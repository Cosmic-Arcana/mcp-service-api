import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type {
  DownstreamTarget,
  TokenExchangeConfig,
} from '../config/configuration';
import type { Principal } from '../auth/principal';
import { missingScopes } from '../auth/scopes';
import { TokenExchangeClient } from './token-exchange.client';
import { DelegationScopeError } from './token-exchange.errors';

interface CachedToken {
  accessToken: string;
  /** Milliseconds since epoch, already reduced by the skew. */
  usableUntil: number;
}

/**
 * Hands out downstream access tokens for a principal ("on behalf of" the user), caching
 * each until shortly before it expires.
 *
 * The cache key starts with a hash of the inbound token rather than the user id: a new
 * inbound token (refresh, re-consent, revocation) never reuses an exchange made with an
 * older one, and a cached token can never outlive the token it was derived from.
 */
@Injectable()
export class OnBehalfOfTokenService {
  private readonly config: TokenExchangeConfig;
  private readonly cache = new Map<string, CachedToken>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    configService: ConfigService,
    private readonly client: TokenExchangeClient,
  ) {
    this.config =
      configService.getOrThrow<TokenExchangeConfig>('tokenExchange');
  }

  async tokenFor(
    principal: Principal,
    target: DownstreamTarget,
  ): Promise<string> {
    // Scopes can only narrow along the chain; asking the AS for more would be refused anyway,
    // so fail fast with a precise reason.
    const missing = missingScopes(principal.scopes, target.scopes);
    if (missing.length > 0) {
      throw new DelegationScopeError(missing);
    }

    const key = this.cacheKey(principal, target);
    const cached = this.cache.get(key);
    if (cached && cached.usableUntil > Date.now()) {
      return cached.accessToken;
    }
    this.cache.delete(key);

    // Single flight: concurrent tool calls for the same user and target share one exchange.
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.exchangeAndCache(key, principal, target).finally(() =>
        this.inFlight.delete(key),
      );
      this.inFlight.set(key, pending);
    }
    return pending;
  }

  private async exchangeAndCache(
    key: string,
    principal: Principal,
    target: DownstreamTarget,
  ): Promise<string> {
    const exchanged = await this.client.exchange({
      subjectToken: principal.accessToken,
      resource: target.resource,
      scopes: target.scopes,
    });

    const expiresAtMs =
      Math.min(exchanged.expiresAt, principal.expiresAt) * 1000;
    const usableUntil = expiresAtMs - this.config.expirySkewSec * 1000;
    if (usableUntil > Date.now()) {
      this.evictIfFull();
      this.cache.set(key, { accessToken: exchanged.accessToken, usableUntil });
    }
    return exchanged.accessToken;
  }

  private cacheKey(principal: Principal, target: DownstreamTarget): string {
    const subjectTokenHash = createHash('sha256')
      .update(principal.accessToken)
      .digest('base64url');
    return [
      subjectTokenHash,
      target.resource,
      [...target.scopes].sort().join(' '),
    ].join('|');
  }

  private evictIfFull(): void {
    if (this.cache.size < this.config.maxCacheEntries) {
      return;
    }
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.usableUntil <= now) {
        this.cache.delete(key);
      }
    }
    // Map iteration is insertion order, so the first key is the oldest entry.
    for (const oldest of this.cache.keys()) {
      if (this.cache.size < this.config.maxCacheEntries) {
        break;
      }
      this.cache.delete(oldest);
    }
  }
}
