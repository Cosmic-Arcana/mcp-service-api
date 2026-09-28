import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import type { AuthConfig } from '../config/configuration';
import { AuthorizationServerMetadataService } from './authorization-server-metadata.service';
import type { ActorClaim, PrincipalExtra } from './principal';

interface AccessTokenClaims extends JWTPayload {
  client_id?: string;
  azp?: string;
  scope?: string;
  scp?: string[] | string;
  act?: ActorClaim;
}

/**
 * Validates JWT access tokens (RFC 9068) locally against the Authorization Server's JWKS.
 * Only tokens minted for this MCP server are accepted: `aud` must contain MCP_RESOURCE_URL.
 * That audience check is what stops a token issued for another service (the storefront,
 * a downstream API) from being replayed here.
 */
@Injectable()
export class AccessTokenVerifier implements OAuthTokenVerifier {
  private readonly config: AuthConfig;
  private readonly resource: string;
  private keySet?: JWTVerifyGetKey;

  constructor(
    configService: ConfigService,
    private readonly asMetadata: AuthorizationServerMetadataService,
  ) {
    this.config = configService.getOrThrow<AuthConfig>('auth');
    this.resource = configService.getOrThrow<string>('mcpResourceUrl');
  }

  /** Test seam: verify against a fixed key source instead of the remote JWKS. */
  useKeySet(keySet: JWTVerifyGetKey): void {
    this.keySet = keySet;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const keySet = await this.resolveKeySet();

    let claims: AccessTokenClaims;
    try {
      const result = await jwtVerify<AccessTokenClaims>(token, keySet, {
        issuer: this.config.issuer,
        audience: this.resource,
        algorithms: this.config.algorithms,
        clockTolerance: this.config.clockToleranceSec,
        requiredClaims: ['sub', 'exp', 'iat'],
        ...(this.config.requireJwtAccessTokenType ? { typ: 'at+jwt' } : {}),
      });
      claims = result.payload;
    } catch (error) {
      throw this.toOAuthError(error);
    }

    const clientId = claims.client_id ?? claims.azp;
    if (!clientId) {
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        'access token has no client_id',
      );
    }

    const extra: PrincipalExtra = {
      subject: claims.sub as string,
      tokenId: claims.jti,
      actor: claims.act,
    };
    return {
      token,
      clientId,
      scopes: parseScopes(claims),
      expiresAt: claims.exp,
      resource: new URL(this.resource),
      extra,
    };
  }

  private async resolveKeySet(): Promise<JWTVerifyGetKey> {
    if (this.keySet) {
      return this.keySet;
    }
    let jwksUri = this.config.jwksUri;
    if (!jwksUri) {
      try {
        jwksUri = (await this.asMetadata.get()).jwks_uri;
      } catch (error) {
        throw new OAuthError(
          OAuthErrorCode.ServerError,
          `cannot load signing keys: ${(error as Error).message}`,
        );
      }
    }
    if (!jwksUri) {
      throw new OAuthError(
        OAuthErrorCode.ServerError,
        'authorization server metadata has no jwks_uri',
      );
    }
    // jose caches the key set and refetches (rate limited) when an unknown `kid` shows up,
    // which is what makes AS key rotation work without a restart.
    this.keySet = createRemoteJWKSet(new URL(jwksUri));
    return this.keySet;
  }

  private toOAuthError(error: unknown): OAuthError {
    if (
      error instanceof joseErrors.JWKSTimeout ||
      error instanceof joseErrors.JWKSInvalid
    ) {
      return new OAuthError(
        OAuthErrorCode.ServerError,
        'signing keys unavailable',
      );
    }
    if (error instanceof joseErrors.JWTExpired) {
      return new OAuthError(
        OAuthErrorCode.InvalidToken,
        'access token expired',
      );
    }
    if (error instanceof joseErrors.JWTClaimValidationFailed) {
      return new OAuthError(
        OAuthErrorCode.InvalidToken,
        `access token rejected: ${error.claim} ${error.reason}`,
      );
    }
    // Signature, algorithm and format failures get one generic message: the details help attackers, not clients.
    return new OAuthError(
      OAuthErrorCode.InvalidToken,
      'access token is invalid',
    );
  }
}

const parseScopes = (claims: AccessTokenClaims): string[] => {
  if (typeof claims.scope === 'string') {
    return claims.scope.split(' ').filter(Boolean);
  }
  if (Array.isArray(claims.scp)) {
    return claims.scp.filter(
      (scope): scope is string => typeof scope === 'string',
    );
  }
  if (typeof claims.scp === 'string') {
    return claims.scp.split(' ').filter(Boolean);
  }
  return [];
};
