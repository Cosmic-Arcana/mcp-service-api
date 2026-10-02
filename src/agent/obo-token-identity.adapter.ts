import { Injectable, Logger } from '@nestjs/common';
import type { AgentActorV1 } from '@cosmic-arcana/sdk';
import { AgentIdentityPort } from './agent-identity.port';

interface OboClaims {
  sub?: unknown;
  scope?: unknown;
  act?: { sub?: unknown } | string | null;
}

/**
 * Reads the on-behalf-of claims of the presented token: `sub` is the user, `act` is the agent
 * acting for them (RFC 8693).
 *
 * TODO(authority): the signature is not verified — authority-service-api does not exist yet. Until
 * it does, this trusts the transport, so the activity feed is observability, never authorization.
 */
@Injectable()
export class OboTokenIdentityAdapter implements AgentIdentityPort {
  private readonly logger = new Logger(OboTokenIdentityAdapter.name);

  resolve(authorization: string | undefined): AgentActorV1 | null {
    const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) {
      return null;
    }

    const claims = this.decode(token);
    if (!claims || typeof claims.sub !== 'string' || claims.sub.length === 0) {
      return null;
    }

    const act = claims.act;
    const agent = typeof act === 'string' ? act : typeof act?.sub === 'string' ? act.sub : null;
    const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : [];

    return { userId: claims.sub, agent, scopes };
  }

  private decode(token: string): OboClaims | null {
    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OboClaims;
    } catch (error) {
      const { name, message } = error as Error;
      this.logger.warn('agent token payload is not readable', {
        errorName: name,
        errorMessage: message,
      });
      return null;
    }
  }
}
