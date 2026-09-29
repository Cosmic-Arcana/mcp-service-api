import type { AgentActivityEventV1, AgentActivityFeedV1 } from '@cosmic-arcana/sdk';

export type AgentActivityListener = (event: AgentActivityEventV1) => void;

export abstract class AgentActivityStore {
  abstract record(event: AgentActivityEventV1): void;
  /** Sessions and recent events of one user, newest last. */
  abstract feed(userId: string): AgentActivityFeedV1;
  /** Returns the unsubscribe function. */
  abstract subscribe(userId: string, listener: AgentActivityListener): () => void;
}
