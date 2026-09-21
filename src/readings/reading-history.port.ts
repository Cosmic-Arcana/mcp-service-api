import type { ReadingSummary } from './reading-summary.schema';

/**
 * Deliberately takes no user id: the real adapter reads through the PostgreSQL MCP server with an
 * OBO token, so the user is resolved from the token's `sub` and enforced by RLS, never chosen by the agent.
 */
export abstract class ReadingHistoryPort {
  abstract findRecent(limit: number): Promise<ReadingSummary[]>;
}
