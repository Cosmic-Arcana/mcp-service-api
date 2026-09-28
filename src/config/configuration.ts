export type ClientAuthMethod = 'client_secret_basic' | 'private_key_jwt';

export interface AuthConfig {
  /** Authorization Server issuer identifier; its RFC 8414 metadata is discovered from here. */
  issuer: string;
  /** Explicit JWKS URI; when unset it is taken from the Authorization Server metadata. */
  jwksUri?: string;
  algorithms: string[];
  clockToleranceSec: number;
  /** Require the RFC 9068 `at+jwt` typ header on access tokens. */
  requireJwtAccessTokenType: boolean;
  scopesSupported: string[];
  /** Local development only: accept an `http://` issuer. */
  allowInsecureIssuer: boolean;
}

export interface TokenExchangeConfig {
  clientId: string;
  authMethod: ClientAuthMethod;
  clientSecret?: string;
  /** PKCS#8 PEM, used when authMethod is private_key_jwt. */
  privateKeyPem?: string;
  privateKeyAlg: string;
  privateKeyId?: string;
  timeoutMs: number;
  /** Exchanged tokens are dropped from the cache this long before they expire. */
  expirySkewSec: number;
  maxCacheEntries: number;
}

export interface DownstreamTarget {
  /** RFC 8707 resource identifier the downstream service validates as `aud`. */
  resource: string;
  scopes: string[];
}

export interface NasaServiceConfig extends DownstreamTarget {
  host: string;
  port: number;
  timeoutMs: number;
}

export interface AppConfig {
  serviceName: string;
  nodeEnv: string;
  http: { port: number };
  /** Public URL of the MCP endpoint; it is the RFC 8707 resource this server protects. */
  mcpResourceUrl: string;
  auth: AuthConfig;
  tokenExchange: TokenExchangeConfig;
  nasaService: NasaServiceConfig;
}

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const configuration = (): AppConfig => ({
  serviceName: 'mcp-service-api',
  nodeEnv: process.env.NODE_ENV as string,
  http: { port: Number(process.env.PORT) },
  mcpResourceUrl: process.env.MCP_RESOURCE_URL as string,
  auth: {
    issuer: process.env.AUTH_ISSUER as string,
    jwksUri: process.env.AUTH_JWKS_URI || undefined,
    algorithms: list(process.env.AUTH_ALLOWED_ALGORITHMS),
    clockToleranceSec: Number(process.env.AUTH_CLOCK_TOLERANCE_SEC),
    requireJwtAccessTokenType: process.env.AUTH_REQUIRE_AT_JWT_TYP === 'true',
    scopesSupported: list(process.env.AUTH_SCOPES_SUPPORTED),
    allowInsecureIssuer: process.env.AUTH_ALLOW_INSECURE_ISSUER === 'true',
  },
  tokenExchange: {
    clientId: process.env.TOKEN_EXCHANGE_CLIENT_ID as string,
    authMethod: process.env.TOKEN_EXCHANGE_AUTH_METHOD as ClientAuthMethod,
    clientSecret: process.env.TOKEN_EXCHANGE_CLIENT_SECRET || undefined,
    privateKeyPem:
      process.env.TOKEN_EXCHANGE_PRIVATE_KEY?.replace(/\\n/g, '\n') ||
      undefined,
    privateKeyAlg: process.env.TOKEN_EXCHANGE_PRIVATE_KEY_ALG as string,
    privateKeyId: process.env.TOKEN_EXCHANGE_PRIVATE_KEY_ID || undefined,
    timeoutMs: Number(process.env.TOKEN_EXCHANGE_TIMEOUT_MS),
    expirySkewSec: Number(process.env.TOKEN_EXCHANGE_EXPIRY_SKEW_SEC),
    maxCacheEntries: Number(process.env.TOKEN_EXCHANGE_MAX_CACHE_ENTRIES),
  },
  nasaService: {
    host: process.env.NASA_SERVICE_HOST as string,
    port: Number(process.env.NASA_SERVICE_PORT),
    timeoutMs: Number(process.env.NASA_SERVICE_TIMEOUT_MS),
    resource: process.env.NASA_SERVICE_RESOURCE as string,
    scopes: list(process.env.NASA_SERVICE_SCOPES),
  },
});
