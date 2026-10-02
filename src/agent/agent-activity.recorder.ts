import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AgentActivityEventV1, AgentActivityKindV1, AgentActorV1 } from '@cosmic-arcana/sdk';
import { AgentActivityStore } from './agent-activity.store';
import { getAgentContext } from './agent-context.storage';

/** Payloads are trimmed before they are stored: the feed is a view, not a transcript. */
const MAX_PAYLOAD_CHARS = 4_000;

export interface ActivityDetails {
  target?: string | null;
  request?: unknown;
  response?: unknown;
  durationMs?: number | null;
  outcome?: 'success' | 'error' | null;
  error?: Error | null;
}

@Injectable()
export class AgentActivityRecorder {
  constructor(private readonly store: AgentActivityStore) {}

  record(kind: AgentActivityKindV1, details: ActivityDetails = {}): void {
    const context = getAgentContext();
    // Without a token there is no user to show this to, so nothing is kept.
    if (!context?.actor) {
      return;
    }
    this.store.record(this.build(kind, context.sessionId, context.actor, details));
  }

  private build(
    kind: AgentActivityKindV1,
    sessionId: string,
    actor: AgentActorV1,
    details: ActivityDetails,
  ): AgentActivityEventV1 {
    return {
      version: 1,
      eventId: randomUUID(),
      sessionId,
      occurredAt: new Date().toISOString(),
      kind,
      actor,
      target: details.target ?? null,
      request: trim(details.request),
      response: trim(details.response),
      durationMs: details.durationMs ?? null,
      outcome: details.outcome ?? null,
      error: details.error ? { name: details.error.name, message: details.error.message } : null,
    };
  }
}

const trim = (payload: unknown): unknown => {
  if (payload === undefined || payload === null) {
    return null;
  }
  const serialized = JSON.stringify(payload);
  if (serialized === undefined) {
    return null;
  }
  return serialized.length <= MAX_PAYLOAD_CHARS
    ? (JSON.parse(serialized) as unknown)
    : `${serialized.slice(0, MAX_PAYLOAD_CHARS)}… (${serialized.length} characters)`;
};
