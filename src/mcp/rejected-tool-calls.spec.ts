import { runWithAgentContext } from '../agent/agent-context.storage';
import { AgentActivityRecorder } from '../agent/agent-activity.recorder';
import { InMemoryAgentActivityStore } from '../agent/in-memory-agent-activity.store';
import { RejectedToolCalls } from './rejected-tool-calls';

const actor = { userId: 'user-1', agent: 'claude', scopes: ['readings:read'] };

const toolCall = (name: string, args?: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: args },
});

describe('Feature: a tool call the server refuses still shows up in the activity feed', () => {
  const setup = () => {
    const store = new InMemoryAgentActivityStore();
    return { store, rejected: new RejectedToolCalls(new AgentActivityRecorder(store)) };
  };

  const feedAfter = (body: unknown) => {
    const { store, rejected } = setup();
    runWithAgentContext({ sessionId: 's1', actor }, () => rejected.record(body));
    return store.feed('user-1').events;
  };

  it('Given arguments outside the tool schema, When the call is recorded, Then it is listed as called and failed with the reason', () => {
    const events = feedAfter(toolCall('get_previous_readings', { limit: 999 }));

    expect(events.map((event) => event.kind)).toEqual(['tool.called', 'tool.failed']);
    expect(events[1]).toMatchObject({
      target: 'get_previous_readings',
      outcome: 'error',
      request: { limit: 999 },
    });
    expect(events[1].error?.message).toMatch(/limit/);
  });

  it('Given a tool that does not exist, When the call is recorded, Then the attempt is visible by name', () => {
    const events = feedAfter(toolCall('delete_all_readings', {}));

    expect(events.map((event) => event.kind)).toEqual(['tool.called', 'tool.failed']);
    expect(events[1]).toMatchObject({ target: 'delete_all_readings', outcome: 'error' });
    expect(events[1].error?.name).toBe('UnknownTool');
  });

  it('Given a valid call, When it is screened, Then nothing is recorded, because the tool records its own', () => {
    expect(feedAfter(toolCall('get_previous_readings', { limit: 3 }))).toEqual([]);
    expect(feedAfter(toolCall('get_previous_readings'))).toEqual([]);
  });

  it('Given messages that are not tool calls, When they are screened, Then they are ignored', () => {
    expect(feedAfter({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).toEqual([]);
    expect(feedAfter({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).toEqual([]);
    expect(feedAfter(undefined)).toEqual([]);
    expect(feedAfter('not json rpc')).toEqual([]);
    expect(feedAfter({ method: 'tools/call', params: 'oops' })).toEqual([]);
  });

  it('Given a batch, When it is screened, Then each refused call is recorded and valid ones are left alone', () => {
    const events = feedAfter([
      toolCall('get_previous_readings', { limit: 2 }),
      toolCall('get_previous_readings', { limit: 0 }),
      toolCall('nope', {}),
    ]);

    expect(
      events.filter((event) => event.kind === 'tool.failed').map((event) => event.target),
    ).toEqual(['get_previous_readings', 'nope']);
  });

  it('Given an agent with no token, When a refused call arrives, Then nothing is kept, as for every other event', () => {
    const { store, rejected } = setup();

    rejected.record(toolCall('nope', {}));

    expect(store.feed('user-1').events).toEqual([]);
  });
});
