import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  verifyBearerToken,
  type AuthInfo,
} from '@modelcontextprotocol/server';
import type { NextFunction, Request, Response } from 'express';
import { AccessTokenVerifier } from './access-token.verifier';
import { missingScopes, SCOPES, TOOL_REQUIRED_SCOPES } from './scopes';

/** Scope hinted in the 401 challenge, so a first-time client asks for the least it needs. */
const DEFAULT_CHALLENGE_SCOPES = [SCOPES.cosmicRead];

export type AuthenticatedRequest = Request & { auth?: AuthInfo };

/**
 * Gate in front of the MCP endpoint: no valid access token for this resource, no MCP.
 *
 * - no or invalid token → 401 + `WWW-Authenticate: Bearer resource_metadata=…` so the client
 *   can discover the Authorization Server and start OAuth;
 * - `tools/call` for a tool whose scopes the token lacks → 403 `insufficient_scope` naming the
 *   scopes to re-authorize with (step-up);
 * - otherwise the verified AuthInfo goes on `req.auth`, which the MCP SDK hands to the server
 *   factory and tool handlers.
 */
@Injectable()
export class McpBearerAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(McpBearerAuthMiddleware.name);
  private readonly resourceMetadataUrl: string;

  constructor(
    private readonly verifier: AccessTokenVerifier,
    configService: ConfigService,
  ) {
    this.resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(
      new URL(configService.getOrThrow<string>('mcpResourceUrl')),
    );
  }

  async use(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    let authInfo: AuthInfo;
    try {
      authInfo = await verifyBearerToken(req.headers.authorization, {
        verifier: this.verifier,
        resourceMetadataUrl: this.resourceMetadataUrl,
      });
    } catch (error) {
      this.logger.warn('mcp request rejected', {
        reason: error instanceof OAuthError ? error.code : 'server_error',
        message: (error as Error).message,
      });
      return this.reject(res, error, DEFAULT_CHALLENGE_SCOPES);
    }

    const required = requiredScopesFor(req.body);
    const missing = missingScopes(authInfo.scopes, required);
    if (missing.length > 0) {
      this.logger.warn('mcp request lacks scope', {
        clientId: authInfo.clientId,
        missing,
      });
      // Ask for what the token already has plus what is missing, so stepping up does not drop scopes.
      const scopes = [...new Set([...authInfo.scopes, ...required])];
      return this.reject(
        res,
        new OAuthError(
          OAuthErrorCode.InsufficientScope,
          `requires scope: ${missing.join(' ')}`,
        ),
        scopes,
      );
    }

    req.auth = authInfo;
    next();
  }

  private async reject(
    res: Response,
    error: unknown,
    scopes: readonly string[],
  ): Promise<void> {
    const challenge = bearerAuthChallengeResponse(error, {
      resourceMetadataUrl: this.resourceMetadataUrl,
      requiredScopes: [...scopes],
    });
    res.status(challenge.status);
    challenge.headers.forEach((value, name) => res.setHeader(name, value));
    res.send(await challenge.text());
  }
}

/** Scopes needed by the JSON-RPC message in the body; only `tools/call` is scope-gated today. */
const requiredScopesFor = (body: unknown): readonly string[] => {
  const messages = Array.isArray(body) ? body : [body];
  const scopes = new Set<string>();
  for (const message of messages) {
    if (!isToolCall(message)) {
      continue;
    }
    for (const scope of TOOL_REQUIRED_SCOPES[message.params.name] ?? []) {
      scopes.add(scope);
    }
  }
  return [...scopes];
};

const isToolCall = (
  message: unknown,
): message is { method: 'tools/call'; params: { name: string } } =>
  typeof message === 'object' &&
  message !== null &&
  (message as { method?: unknown }).method === 'tools/call' &&
  typeof (message as { params?: { name?: unknown } }).params?.name === 'string';
