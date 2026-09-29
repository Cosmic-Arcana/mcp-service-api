import { Injectable } from '@nestjs/common';
import type { AgentActivityEventV1, AgentActivityFeedV1, AgentSessionV1 } from '@cosmic-arcana/sdk';
import { AgentActivityStore, type AgentActivityListener } from './agent-activity.store';

const EVENTS_PER_USER = 200;

/**
 * Bounded per-user buffer. Deliberately not durable: this is a live view of what an agent is doing
 * right now, and the readings it touched are the source of truth elsewhere.
 */
@Injectable()
export class InMemoryAgentActivityStore implements AgentActivityStore {
  private readonly events = new Map<string, AgentActivityEventV1[]>();
  private readonly sessions = new Map<string, Map<string, AgentSessionV1>>();
  private readonly listeners = new Map<string, Set<AgentActivityListener>>();

  record(event: AgentActivityEventV1): void {
    const userId = event.actor.userId;

    const events = this.events.get(userId) ?? [];
    events.push(event);
    if (events.length > EVENTS_PER_USER) {
      events.splice(0, events.length - EVENTS_PER_USER);
    }
    this.events.set(userId, events);

    this.updateSession(userId, event);

    for (const listener of this.listeners.get(userId) ?? []) {
      listener(event);
    }
  }

  feed(userId: string): AgentActivityFeedV1 {
    return {
      sessions: [...(this.sessions.get(userId)?.values() ?? [])].sort((a, b) =>
        b.lastSeenAt.localeCompare(a.lastSeenAt),
      ),
      events: [...(this.events.get(userId) ?? [])],
    };
  }

  subscribe(userId: string, listener: AgentActivityListener): () => void {
    const listeners = this.listeners.get(userId) ?? new Set<AgentActivityListener>();
    listeners.add(listener);
    this.listeners.set(userId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(userId);
      }
    };
  }

  private updateSession(userId: string, event: AgentActivityEventV1): void {
    const sessions = this.sessions.get(userId) ?? new Map<string, AgentSessionV1>();
    const existing = sessions.get(event.sessionId);

    const session: AgentSessionV1 = existing ?? {
      sessionId: event.sessionId,
      actor: event.actor,
      startedAt: event.occurredAt,
      lastSeenAt: event.occurredAt,
      open: true,
      toolCalls: 0,
      errors: 0,
    };

    session.lastSeenAt = event.occurredAt;
    session.actor = event.actor;
    if (event.kind === 'tool.called') {
      session.toolCalls += 1;
    }
    if (event.kind === 'tool.failed') {
      session.errors += 1;
    }
    if (event.kind === 'session.closed') {
      session.open = false;
    }

    sessions.set(event.sessionId, session);
    this.sessions.set(userId, sessions);
  }
}
