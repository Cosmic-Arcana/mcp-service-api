import { randomUUID } from 'node:crypto';
import { importPKCS8, SignJWT, type CryptoKey } from 'jose';
import type { TokenExchangeConfig } from '../config/configuration';

export const CLIENT_ASSERTION_TYPE =
  'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const ASSERTION_LIFETIME_SEC = 60;

/** Adds this service's client authentication to a token endpoint request. */
export interface ClientAuthentication {
  apply(
    headers: Headers,
    body: URLSearchParams,
    context: { issuer: string },
  ): Promise<void>;
}

/** RFC 6749 §2.3.1: id and secret are form-urlencoded before being joined and base64-encoded. */
export class ClientSecretBasic implements ClientAuthentication {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  apply(headers: Headers): Promise<void> {
    const credentials = `${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.clientSecret)}`;
    headers.set(
      'authorization',
      `Basic ${Buffer.from(credentials).toString('base64')}`,
    );
    return Promise.resolve();
  }
}

/**
 * RFC 7523 `private_key_jwt`: a short-lived signed assertion instead of a shared secret, so
 * nothing replayable sits in config. `aud` is the AS issuer identifier, as the RFC 7523bis
 * update recommends over the token endpoint URL.
 */
export class PrivateKeyJwt implements ClientAuthentication {
  private key?: Promise<CryptoKey>;

  constructor(
    private readonly clientId: string,
    private readonly privateKeyPem: string,
    private readonly alg: string,
    private readonly keyId?: string,
  ) {}

  async apply(
    _headers: Headers,
    body: URLSearchParams,
    { issuer }: { issuer: string },
  ): Promise<void> {
    this.key ??= importPKCS8(this.privateKeyPem, this.alg);
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({})
      .setProtectedHeader({
        alg: this.alg,
        typ: 'JWT',
        ...(this.keyId ? { kid: this.keyId } : {}),
      })
      .setIssuer(this.clientId)
      .setSubject(this.clientId)
      .setAudience(issuer)
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + ASSERTION_LIFETIME_SEC)
      .sign(await this.key);
    body.set('client_id', this.clientId);
    body.set('client_assertion_type', CLIENT_ASSERTION_TYPE);
    body.set('client_assertion', assertion);
  }
}

export const createClientAuthentication = (
  config: TokenExchangeConfig,
): ClientAuthentication => {
  if (config.authMethod === 'private_key_jwt') {
    if (!config.privateKeyPem) {
      throw new Error(
        'TOKEN_EXCHANGE_PRIVATE_KEY is required for private_key_jwt',
      );
    }
    return new PrivateKeyJwt(
      config.clientId,
      config.privateKeyPem,
      config.privateKeyAlg,
      config.privateKeyId,
    );
  }
  if (!config.clientSecret) {
    throw new Error(
      'TOKEN_EXCHANGE_CLIENT_SECRET is required for client_secret_basic',
    );
  }
  return new ClientSecretBasic(config.clientId, config.clientSecret);
};
