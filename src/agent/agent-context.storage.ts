import { AsyncLocalStorage } from 'node:async_hooks';
import type { AgentActorV1 } from '@cosmic-arcana/sdk';

export interface AgentContext {
  sessionId: string;
  actor: AgentActorV1 | null;
}

/**
 * Module-level singleton rather than a provider: a tool handler is invoked deep inside the MCP
 * adapter, far from anything the DI container passes down.
 */
const storage = new AsyncLocalStorage<AgentContext>();

export const getAgentContext = (): AgentContext | null => storage.getStore() ?? null;

export const runWithAgentContext = <T>(context: AgentContext, callback: () => T): T =>
  storage.run(context, callback);
