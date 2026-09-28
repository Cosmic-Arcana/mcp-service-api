import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { TokenExchangeConfig } from '../config/configuration';
import {
  AuthorizationServerMetadataService,
  TOKEN_EXCHANGE_GRANT_TYPE,
} from '../auth/authorization-server-metadata.service';
import { type ClientAuthentication } from './client-authentication';
import { TokenExchangeError } from './token-exchange.errors';

export const TOKEN_TYPE_ACCESS_TOKEN =
  'urn:ietf:params:oauth:token-type:access_token';
export const TOKEN_TYPE_JWT = 'urn:ietf:params:oauth:token-type:jwt';

export const CLIENT_AUTHENTICATION = Symbol('CLIENT_AUTHENTICATION');
export const FETCH = Symbol('FETCH');

/** Used when the AS omits `expires_in`: assume little rather than cache a token past its life. */
const DEFAULT_LIFETIME_SEC = 60;

const TokenExchangeResponseSchema = z.object({
  access_token: z.string().min(1),
  issued_token_type: z.enum([TOKEN_TYPE_ACCESS_TOKEN, TOKEN_TYPE_JWT]),
  // RFC 8693 §2.2.1 allows N_A for tokens that are not access tokens; we only accept usable bearers.
  token_type: z
    .string()
    .refine(
      (value) => value.toLowerCase() === 'bearer',
      'token_type must be Bearer',
    ),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
});

const OAuthErrorBodySchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export interface TokenExchangeRequest {
  /** The inbound access token of the user; it proves who we act for and is never forwarded. */
  subjectToken: string;
  /** RFC 8707 resource of the downstream service; becomes the `aud` of the new token. */
  resource: string;
  scopes: readonly string[];
}

export interface ExchangedToken {
  accessToken: string;
  /** Seconds since epoch. */
  expiresAt: number;
  scopes: readonly string[];
}

/**
 * RFC 8693 OAuth 2.0 Token Exchange client: trades the user's MCP access token for a new,
 * short-lived token whose audience is one downstream service. The subject (user) is
 * preserved; the AS records this service as the actor (`act` claim). This is how the MCP
 * server calls other services on the user's behalf without token passthrough, which the
 * MCP authorization spec forbids.
 */
@Injectable()
export class TokenExchangeClient {
  private readonly logger = new Logger(TokenExchangeClient.name);
  private readonly config: TokenExchangeConfig;

  constructor(
    configService: ConfigService,
    private readonly asMetadata: AuthorizationServerMetadataService,
    @Inject(CLIENT_AUTHENTICATION)
    private readonly clientAuth: ClientAuthentication,
    @Inject(FETCH) private readonly fetchFn: typeof fetch,
  ) {
    this.config =
      configService.getOrThrow<TokenExchangeConfig>('tokenExchange');
  }

  async exchange(request: TokenExchangeRequest): Promise<ExchangedToken> {
    const metadata = await this.asMetadata.get().catch((error: Error) => {
      throw new TokenExchangeError(
        `authorization server unavailable: ${error.message}`,
      );
    });
    if (
      metadata.grant_types_supported &&
      !metadata.grant_types_supported.includes(TOKEN_EXCHANGE_GRANT_TYPE)
    ) {
      throw new TokenExchangeError(
        'authorization server does not advertise the token-exchange grant',
      );
    }

    const body = new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: request.subjectToken,
      subject_token_type: TOKEN_TYPE_ACCESS_TOKEN,
      requested_token_type: TOKEN_TYPE_ACCESS_TOKEN,
      resource: request.resource,
    });
    if (request.scopes.length > 0) {
      body.set('scope', request.scopes.join(' '));
    }
    const headers = new Headers({
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    });
    await this.clientAuth.apply(headers, body, { issuer: metadata.issuer });

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await this.fetchFn(metadata.token_endpoint, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw new TokenExchangeError(
        `token endpoint unreachable: ${(error as Error).message}`,
      );
    }

    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const oauthError = OAuthErrorBodySchema.safeParse(payload);
      const code = oauthError.success ? oauthError.data.error : undefined;
      this.logger.warn('token exchange refused', {
        status: response.status,
        error: code,
        resource: request.resource,
      });
      throw new TokenExchangeError(
        `token exchange refused: ${code ?? `HTTP ${response.status}`}`,
        code,
        response.status,
      );
    }

    const parsed = TokenExchangeResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new TokenExchangeError(
        `malformed token exchange response: ${parsed.error.issues[0]?.message}`,
      );
    }

    this.logger.debug('token exchanged', {
      resource: request.resource,
      durationMs: Date.now() - startedAt,
    });
    const { access_token, expires_in, scope } = parsed.data;
    return {
      accessToken: access_token,
      expiresAt:
        Math.floor(startedAt / 1000) + (expires_in ?? DEFAULT_LIFETIME_SEC),
      // RFC 8693 §2.2.1: scope is omitted when identical to the requested one.
      scopes: scope ? scope.split(' ').filter(Boolean) : request.scopes,
    };
  }
}
