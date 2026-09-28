import { ConfigService } from '@nestjs/config';
import { exportPKCS8, generateKeyPair, jwtVerify, type CryptoKey } from 'jose';
import type { TokenExchangeConfig } from '../config/configuration';
import type { AuthorizationServerMetadataService } from '../auth/authorization-server-metadata.service';
import {
  CLIENT_ASSERTION_TYPE,
  ClientSecretBasic,
  PrivateKeyJwt,
  type ClientAuthentication,
} from './client-authentication';
import { TokenExchangeClient } from './token-exchange.client';
import { TokenExchangeError } from './token-exchange.errors';

const ISSUER = 'https://auth.test';
const TOKEN_ENDPOINT = 'https://auth.test/oauth/token';

const config: TokenExchangeConfig = {
  clientId: 'mcp-service',
  authMethod: 'client_secret_basic',
  privateKeyAlg: 'ES256',
  timeoutMs: 1_000,
  expirySkewSec: 30,
  maxCacheEntries: 100,
};

const metadata = {
  get: () =>
    Promise.resolve({
      issuer: ISSUER,
      token_endpoint: TOKEN_ENDPOINT,
      grant_types_supported: [
        'urn:ietf:params:oauth:grant-type:token-exchange',
      ],
    }),
} as unknown as AuthorizationServerMetadataService;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const createClient = (
  fetchFn: jest.Mock,
  auth: ClientAuthentication = new ClientSecretBasic(
    'mcp-service',
    's3cret:/&',
  ),
) =>
  new TokenExchangeClient(
    new ConfigService({ tokenExchange: config }),
    metadata,
    auth,
    fetchFn,
  );

const request = {
  subjectToken: 'user-mcp-token',
  resource: 'urn:svc:nasa',
  scopes: ['cosmic:read'],
};

describe('TokenExchangeClient', () => {
  it('sends an RFC 8693 exchange for the target resource, authenticated as this service', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      json(200, {
        access_token: 'downstream-token',
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        token_type: 'Bearer',
        expires_in: 120,
      }),
    );
    const before = Math.floor(Date.now() / 1000);

    const result = await createClient(fetchFn).exchange(request);

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = init.body as URLSearchParams;
    const headers = init.headers as Headers;
    expect(url).toBe(TOKEN_ENDPOINT);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: 'user-mcp-token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      resource: 'urn:svc:nasa',
      scope: 'cosmic:read',
    });
    // RFC 6749 §2.3.1: form-urlencoded before base64, so ':' in the secret stays unambiguous.
    expect(headers.get('authorization')).toBe(
      `Basic ${Buffer.from('mcp-service:s3cret%3A%2F%26').toString('base64')}`,
    );
    expect(result.accessToken).toBe('downstream-token');
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 120);
    expect(result.scopes).toEqual(['cosmic:read']);
  });

  it('authenticates with a signed private_key_jwt assertion addressed to the issuer', async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256', {
      extractable: true,
    });
    const pem = await exportPKCS8(privateKey);
    const fetchFn = jest.fn().mockResolvedValue(
      json(200, {
        access_token: 't',
        issued_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        token_type: 'bearer',
      }),
    );

    await createClient(
      fetchFn,
      new PrivateKeyJwt('mcp-service', pem, 'ES256', 'key-1'),
    ).exchange(request);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect((init.headers as Headers).get('authorization')).toBeNull();
    expect(body.get('client_id')).toBe('mcp-service');
    expect(body.get('client_assertion_type')).toBe(CLIENT_ASSERTION_TYPE);
    const { payload, protectedHeader } = await jwtVerify(
      body.get('client_assertion')!,
      publicKey,
      {
        issuer: 'mcp-service',
        subject: 'mcp-service',
        audience: ISSUER,
      },
    );
    expect(protectedHeader.kid).toBe('key-1');
    expect(payload.jti).toBeDefined();
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60);
  });

  it('surfaces the AS error code, flagging a revoked or expired grant', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(
        json(400, { error: 'invalid_grant', error_description: 'revoked' }),
      );

    const error = await createClient(fetchFn)
      .exchange(request)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TokenExchangeError);
    expect(error).toMatchObject({
      oauthError: 'invalid_grant',
      status: 400,
      isGrantInvalid: true,
    });
  });

  it('rejects a response that is not a usable bearer access token', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      json(200, {
        access_token: 't',
        issued_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        token_type: 'N_A',
      }),
    );

    await expect(createClient(fetchFn).exchange(request)).rejects.toThrow(
      /malformed token exchange response/,
    );
  });

  it('assumes a short lifetime when expires_in is missing', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      json(200, {
        access_token: 't',
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        token_type: 'Bearer',
      }),
    );

    const result = await createClient(fetchFn).exchange(request);

    expect(
      result.expiresAt - Math.floor(Date.now() / 1000),
    ).toBeLessThanOrEqual(60);
  });

  it('wraps network failures', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(createClient(fetchFn).exchange(request)).rejects.toThrow(
      'token endpoint unreachable: fetch failed',
    );
  });
});
