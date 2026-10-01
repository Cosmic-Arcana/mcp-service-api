import { Injectable } from '@nestjs/common';
import { MCP_TOOLS } from '@cosmic-arcana/sdk';
import { previousReadingsInputSchema } from '@cosmic-arcana/sdk/mcp';
import { AgentActivityRecorder } from '../agent/agent-activity.recorder';

interface ToolCall {
  name: string;
  arguments: unknown;
}

type InputSchema = Pick<typeof previousReadingsInputSchema, 'safeParse'>;

// The schemas the SDK itself validates against, so this screen and the SDK cannot disagree about
// what is refused. A Map, not an object: a tool named "constructor" must not find a prototype.
const INPUT_SCHEMAS = new Map<string, InputSchema>([
  [MCP_TOOLS.previousReadings, previousReadingsInputSchema],
]);

const toolCallOf = (message: unknown): ToolCall | null => {
  if (!message || typeof message !== 'object') {
    return null;
  }
  const { method, params } = message as { method?: unknown; params?: unknown };
  if (method !== 'tools/call' || !params || typeof params !== 'object') {
    return null;
  }
  const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
  return typeof name === 'string' ? { name, arguments: args } : null;
};

const named = (name: string, message: string): Error => {
  const error = new Error(message);
  error.name = name;
  return error;
};

/**
 * The SDK refuses a bad tool call before any tool handler runs, so the handler can never record it.
 * That would leave the activity feed silent about exactly the calls a user most wants to see: an
 * agent asking for a tool that does not exist, or for something outside what a tool accepts.
 * Valid calls are left alone, because the tool records those itself.
 */
@Injectable()
export class RejectedToolCalls {
  constructor(private readonly activity: AgentActivityRecorder) {}

  record(body: unknown): void {
    for (const message of Array.isArray(body) ? body : [body]) {
      const call = toolCallOf(message);
      const rejection = call ? this.rejectionOf(call) : null;
      if (call && rejection) {
        this.activity.record('tool.called', { target: call.name, request: call.arguments });
        this.activity.record('tool.failed', {
          target: call.name,
          request: call.arguments,
          outcome: 'error',
          error: rejection,
        });
      }
    }
  }

  private rejectionOf(call: ToolCall): Error | null {
    const schema = INPUT_SCHEMAS.get(call.name);
    if (!schema) {
      return named('UnknownTool', `tool ${call.name} does not exist`);
    }
    const parsed = schema.safeParse(call.arguments ?? {});
    if (parsed.success) {
      return null;
    }
    const reason = parsed.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || 'arguments'}: ${issue.message}`)
      .join('; ');
    return named('InvalidArguments', reason);
  }
}
