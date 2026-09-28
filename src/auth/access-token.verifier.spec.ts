import { ConfigService } from '@nestjs/config';
import { OAuthErrorCode } from '@modelcontextprotocol/server';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTPayload,
} from 'jose';
import type { AuthConfig } from '../config/configuration';
import { AccessTokenVerifier } from './access-token.verifier';
import type { AuthorizationServerMetadataService } from './authorization-server-metadata.service';
import { principalFromAuthInfo } from './principal';

const ISSUER = 'https://auth.test';
const RESOURCE = 'https://mcp.test/mcp';

const authConfig: AuthConfig = {
  issuer: ISSUER,
  algorithms: ['ES256'],
  clockToleranceSec: 0,
  requireJwtAccessTokenType: true,
  scopesSupported: [],
  allowInsecureIssuer: false,
};

describe('AccessTokenVerifier', () => {
  let privateKey: CryptoKey;
  let verifier: AccessTokenVerifier;

  const sign = (
    claims: JWTPayload,
    header: { alg?: string; typ?: string } = {},
    key: CryptoKey = privateKey,
  ) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      client_id: 'agent-1',
      scope: 'cosmic:read spreads:read',
      ...claims,
    })
      .setProtectedHeader({
        alg: header.alg ?? 'ES256',
        typ: header.typ ?? 'at+jwt',
        kid: 'k1',
      })
      .setIssuer((claims.iss as string) ?? ISSUER)
      .setSubject((claims.sub as string) ?? 'user-1')
      .setAudience((claims.aud as string) ?? RESOURCE)
      .setIssuedAt(now)
      .setExpirationTime((claims.exp as number) ?? now + 600)
      .sign(key);
  };

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    privateKey = pair.privateKey;
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'k1',
      alg: 'ES256',
    };
    verifier = new AccessTokenVerifier(
      new ConfigService({ auth: authConfig, mcpResourceUrl: RESOURCE }),
      {} as AuthorizationServerMetadataService,
    );
    verifier.useKeySet(createLocalJWKSet({ keys: [jwk] }));
  });

  it('accepts a token issued for this MCP resource and maps it to a principal', async () => {
    const token = await sign({});
    const authInfo = await verifier.verifyAccessToken(token);

    expect(authInfo).toMatchObject({
      token,
      clientId: 'agent-1',
      scopes: ['cosmic:read', 'spreads:read'],
    });
    expect(authInfo.resource?.href).toBe(RESOURCE);
    expect(principalFromAuthInfo(authInfo)).toMatchObject({
      subject: 'user-1',
      clientId: 'agent-1',
      accessToken: token,
    });
  });

  it.each([
    [
      'another audience (e.g. a storefront or downstream token)',
      { aud: 'https://spread-service.test' },
    ],
    ['another issuer', { iss: 'https://evil.test' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 10 }],
  ])('rejects %s', async (_label, claims) => {
    await expect(
      verifier.verifyAccessToken(await sign(claims)),
    ).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
    });
  });

  it('rejects a token signed by a key that is not in the JWKS', async () => {
    const foreign = await generateKeyPair('ES256');
    await expect(
      verifier.verifyAccessToken(await sign({}, {}, foreign.privateKey)),
    ).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
      message: 'access token is invalid',
    });
  });

  it('rejects an unsigned token (alg none)', async () => {
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'at+jwt' })}.${encode({ iss: ISSUER, aud: RESOURCE, sub: 'u', client_id: 'a', exp: 9999999999, iat: 1 })}.`;
    await expect(verifier.verifyAccessToken(unsigned)).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
    });
  });

  it('rejects an ID token or other JWT that is not typed at+jwt when that is required', async () => {
    await expect(
      verifier.verifyAccessToken(await sign({}, { typ: 'JWT' })),
    ).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
    });
  });

  it('rejects a token without a client_id', async () => {
    await expect(
      verifier.verifyAccessToken(await sign({ client_id: undefined })),
    ).rejects.toMatchObject({
      code: OAuthErrorCode.InvalidToken,
      message: 'access token has no client_id',
    });
  });

  it('reads scopes from an scp array when scope is absent', async () => {
    const authInfo = await verifier.verifyAccessToken(
      await sign({ scope: undefined, scp: ['cosmic:read'] }),
    );
    expect(authInfo.scopes).toEqual(['cosmic:read']);
  });
});
