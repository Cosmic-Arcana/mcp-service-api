import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { AuthConfig } from '../config/configuration';

const AuthorizationServerMetadataSchema = z.looseObject({
  issuer: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url().optional(),
  grant_types_supported: z.array(z.string()).optional(),
});

export type AuthorizationServerMetadata = z.infer<
  typeof AuthorizationServerMetadataSchema
>;

export const TOKEN_EXCHANGE_GRANT_TYPE =
  'urn:ietf:params:oauth:grant-type:token-exchange';

const FAILURE_BACKOFF_MS = 5_000;

/**
 * Discovers the Authorization Server's RFC 8414 metadata, falling back to OpenID Connect
 * discovery. Fetched lazily and cached for the process lifetime; a failed fetch is retried
 * after a short backoff so an AS outage at boot does not wedge the service.
 */
@Injectable()
export class AuthorizationServerMetadataService {
  private readonly logger = new Logger(AuthorizationServerMetadataService.name);
  private readonly config: AuthConfig;
  private pending?: Promise<AuthorizationServerMetadata>;
  private lastFailureAt = 0;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<AuthConfig>('auth');
  }

  get(): Promise<AuthorizationServerMetadata> {
    if (!this.pending && Date.now() - this.lastFailureAt < FAILURE_BACKOFF_MS) {
      return Promise.reject(
        new Error(
          'authorization server metadata unavailable, retrying shortly',
        ),
      );
    }
    this.pending ??= this.discover().catch((error: unknown) => {
      this.pending = undefined;
      this.lastFailureAt = Date.now();
      throw error;
    });
    return this.pending;
  }

  private async discover(): Promise<AuthorizationServerMetadata> {
    const errors: string[] = [];
    for (const url of this.candidateUrls()) {
      try {
        const response = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) {
          errors.push(`${url}: HTTP ${response.status}`);
          continue;
        }
        const metadata = AuthorizationServerMetadataSchema.parse(
          await response.json(),
        );
        // RFC 8414 §3.3: a mismatched issuer means the document is not for this AS.
        if (metadata.issuer !== this.config.issuer) {
          throw new Error(
            `issuer mismatch: expected ${this.config.issuer}, got ${metadata.issuer}`,
          );
        }
        this.logger.log(`discovered authorization server metadata at ${url}`);
        return metadata;
      } catch (error) {
        errors.push(`${url}: ${(error as Error).message}`);
      }
    }
    throw new Error(
      `authorization server metadata discovery failed (${errors.join('; ')})`,
    );
  }

  /** RFC 8414 §3.1 path insertion first, then OIDC discovery (both forms), as the MCP spec lists. */
  private candidateUrls(): string[] {
    const issuer = new URL(this.config.issuer);
    const path =
      issuer.pathname === '/' ? '' : issuer.pathname.replace(/\/$/, '');
    return [
      `${issuer.origin}/.well-known/oauth-authorization-server${path}`,
      `${issuer.origin}/.well-known/openid-configuration${path}`,
      `${issuer.origin}${path}/.well-known/openid-configuration`,
    ].filter((url, index, all) => all.indexOf(url) === index);
  }
}
