import { previousReadingsOutputSchema } from '@cosmic-arcana/sdk/mcp';
import { AgentActivityRecorder } from '../../agent/agent-activity.recorder';
import { InMemoryAgentActivityStore } from '../../agent/in-memory-agent-activity.store';
import { runWithAgentContext } from '../../agent/agent-context.storage';
import { MockReadingHistoryAdapter } from '../../readings/mock-reading-history.adapter';
import { MOCK_READINGS } from '../../readings/mock-readings.fixture';
import { ReadingHistoryPort } from '../../readings/reading-history.port';
import { PreviousReadingsTool } from './previous-readings.tool';

const actor = { userId: 'user-1', agent: 'claude', scopes: ['readings:read'] };

const build = (history: ReadingHistoryPort = new MockReadingHistoryAdapter()) => {
  const store = new InMemoryAgentActivityStore();
  return { store, tool: new PreviousReadingsTool(history, new AgentActivityRecorder(store)) };
};

describe('PreviousReadingsTool', () => {
  it('returns the most recent readings up to the requested limit', async () => {
    const { tool } = build();

    const result = await tool.handle(2);

    const { readings } = previousReadingsOutputSchema.parse(result.structuredContent);
    expect(readings.map((reading) => reading.id)).toEqual(['mock-reading-4', 'mock-reading-3']);
  });

  it('mirrors the structured output in a text block for clients without structured content support', async () => {
    const { tool } = build();

    const result = await tool.handle(1);

    const [block] = result.content;
    expect(block.type).toBe('text');
    expect(JSON.parse(block.type === 'text' ? block.text : '')).toEqual(result.structuredContent);
  });

  it('passes the limit to the history port', async () => {
    const findRecent = jest.fn().mockResolvedValue([]);
    const { tool } = build({ findRecent });

    await tool.handle(7);

    expect(findRecent).toHaveBeenCalledWith(7);
  });

  it('keeps the mock fixture valid against the advertised output schema', () => {
    expect(() => previousReadingsOutputSchema.parse({ readings: MOCK_READINGS })).not.toThrow();
  });

  it('records the call and its result for the user the agent acts for', async () => {
    const { store, tool } = build();

    await runWithAgentContext({ sessionId: 'session-1', actor }, () => tool.handle(1));

    const { events, sessions } = store.feed(actor.userId);
    expect(events.map((event) => event.kind)).toEqual(['tool.called', 'tool.completed']);
    expect(events[1]).toMatchObject({
      target: 'get_previous_readings',
      outcome: 'success',
      request: { limit: 1 },
    });
    expect(sessions).toEqual([expect.objectContaining({ sessionId: 'session-1', toolCalls: 1 })]);
  });

  it('records a failure without swallowing it', async () => {
    const { store, tool } = build({
      findRecent: () => Promise.reject(new Error('history is down')),
    });

    await expect(
      runWithAgentContext({ sessionId: 'session-2', actor }, () => tool.handle(1)),
    ).rejects.toThrow('history is down');

    const { events, sessions } = store.feed(actor.userId);
    expect(events.at(-1)).toMatchObject({
      kind: 'tool.failed',
      outcome: 'error',
      error: { name: 'Error', message: 'history is down' },
    });
    expect(sessions[0].errors).toBe(1);
  });

  it('keeps nothing when no on-behalf-of token identified a user', async () => {
    const { store, tool } = build();

    await runWithAgentContext({ sessionId: 'session-3', actor: null }, () => tool.handle(1));

    expect(store.feed('user-1').events).toEqual([]);
  });
});
