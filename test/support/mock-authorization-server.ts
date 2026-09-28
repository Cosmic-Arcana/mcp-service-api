import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  exportJWK,
  generateKeyPair,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from 'jose';

export interface MockAuthorizationServerOptions {
  /** The MCP server's resource: only tokens with this audience may be exchanged. */
  mcpResource: string;
  /** The MCP server's own client credentials at this AS. */
  exchangeClient: { id: string; secret: string };
  /** Downstream resources the MCP server may obtain tokens for. */
  allowedTargets: string[];
}

export interface ExchangeRecord {
  subject: string;
  resource: string;
  scope: string;
}

interface SubjectClaims extends JWTPayload {
  client_id?: string;
  scope?: string;
}

/**
 * A minimal Authorization Server for tests. Its /token endpoint implements the RFC 8693
 * exchange policy the real AS must enforce:
 * - only the MCP server (authenticated client) may exchange,
 * - only tokens issued for the MCP resource are accepted as subject_token,
 * - only allow-listed downstream resources can be targeted,
 * - scopes can only narrow,
 * - `sub` is preserved and `act` names the MCP server and the originating agent client.
 */
export class MockAuthorizationServer {
  readonly exchanges: ExchangeRecord[] = [];
  readonly revokedSubjects = new Set<string>();
  private server?: Server;
  private privateKey!: CryptoKey;
  private publicJwk!: JWK;
  private readonly kid = randomUUID();
  issuer = '';

  constructor(private readonly options: MockAuthorizationServerOptions) {}

  async start(): Promise<void> {
    const { privateKey, publicKey } = await generateKeyPair('ES256', {
      extractable: true,
    });
    this.privateKey = privateKey;
    this.publicJwk = {
      ...(await exportJWK(publicKey)),
      kid: this.kid,
      alg: 'ES256',
      use: 'sig',
    };
    this.server = createServer((req, res) => {
      this.handle(req)
        .then(({ status, body }) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(body));
        })
        .catch((error: Error) => {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'server_error',
              error_description: error.message,
            }),
          );
        });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    this.issuer = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }

  /** What the AS hands an agent after the user signs in and consents (authorization code flow). */
  issueAccessToken(claims: {
    sub: string;
    clientId: string;
    scope: string;
    audience?: string;
    expiresInSec?: number;
    issuer?: string;
  }): Promise<string> {
    return this.sign(
      { client_id: claims.clientId, scope: claims.scope },
      {
        sub: claims.sub,
        audience: claims.audience ?? this.options.mcpResource,
        expiresInSec: claims.expiresInSec ?? 900,
        issuer: claims.issuer,
      },
    );
  }

  private async handle(
    req: IncomingMessage,
  ): Promise<{ status: number; body: unknown }> {
    if (
      req.method === 'GET' &&
      req.url === '/.well-known/oauth-authorization-server'
    ) {
      return {
        status: 200,
        body: {
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: `${this.issuer}/jwks`,
          response_types_supported: ['code'],
          grant_types_supported: [
            'authorization_code',
            'refresh_token',
            'urn:ietf:params:oauth:grant-type:token-exchange',
          ],
          code_challenge_methods_supported: ['S256'],
          client_id_metadata_document_supported: true,
        },
      };
    }
    if (req.method === 'GET' && req.url === '/jwks') {
      return { status: 200, body: { keys: [this.publicJwk] } };
    }
    if (req.method === 'POST' && req.url === '/token') {
      return this.tokenExchange(req);
    }
    return { status: 404, body: { error: 'not_found' } };
  }

  private async tokenExchange(
    req: IncomingMessage,
  ): Promise<{ status: number; body: unknown }> {
    const expected = `Basic ${Buffer.from(`${this.options.exchangeClient.id}:${this.options.exchangeClient.secret}`).toString('base64')}`;
    if (req.headers.authorization !== expected) {
      return oauthError(401, 'invalid_client');
    }
    const form = new URLSearchParams(await readBody(req));
    if (
      form.get('grant_type') !==
      'urn:ietf:params:oauth:grant-type:token-exchange'
    ) {
      return oauthError(400, 'unsupported_grant_type');
    }
    if (
      form.get('subject_token_type') !==
      'urn:ietf:params:oauth:token-type:access_token'
    ) {
      return oauthError(400, 'invalid_request');
    }

    let subject: SubjectClaims;
    try {
      subject = (
        await jwtVerify<SubjectClaims>(
          form.get('subject_token') ?? '',
          this.publicJwk,
          {
            issuer: this.issuer,
            audience: this.options.mcpResource,
          },
        )
      ).payload;
    } catch {
      return oauthError(400, 'invalid_grant');
    }
    if (this.revokedSubjects.has(subject.sub!)) {
      return oauthError(400, 'invalid_grant');
    }

    const resource = form.get('resource') ?? '';
    if (!this.options.allowedTargets.includes(resource)) {
      return oauthError(400, 'invalid_target');
    }
    const granted = (subject.scope ?? '').split(' ');
    const requested = (form.get('scope') ?? '').split(' ').filter(Boolean);
    if (requested.some((scope) => !granted.includes(scope))) {
      return oauthError(400, 'invalid_scope');
    }

    const scope = requested.join(' ');
    this.exchanges.push({ subject: subject.sub!, resource, scope });
    const accessToken = await this.sign(
      {
        scope,
        client_id: this.options.exchangeClient.id,
        act: {
          sub: this.options.exchangeClient.id,
          client_id: subject.client_id,
        },
      },
      { sub: subject.sub!, audience: resource, expiresInSec: 300 },
    );
    return {
      status: 200,
      body: {
        access_token: accessToken,
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        token_type: 'Bearer',
        expires_in: 300,
      },
    };
  }

  private sign(
    claims: JWTPayload,
    {
      sub,
      audience,
      expiresInSec,
      issuer,
    }: { sub: string; audience: string; expiresInSec: number; issuer?: string },
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: this.kid })
      .setIssuer(issuer ?? this.issuer)
      .setSubject(sub)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + expiresInSec)
      .setJti(randomUUID())
      .sign(this.privateKey);
  }
}

const oauthError = (status: number, error: string) => ({
  status,
  body: { error },
});

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
};
