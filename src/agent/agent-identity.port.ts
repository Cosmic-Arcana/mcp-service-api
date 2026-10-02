import type { AgentActorV1 } from '@cosmic-arcana/sdk';

/**
 * Resolves who an MCP request is acting for. The agent never names the user: the identity comes
 * from the token it presents, and the user is whoever that token was issued on behalf of.
 */
export abstract class AgentIdentityPort {
  abstract resolve(authorization: string | undefined): AgentActorV1 | null;
}
