import { Injectable } from '@nestjs/common';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import {
  MCP_TOOLS,
  PREVIOUS_READINGS_LIMIT,
  type PreviousReadingsOutputV1,
} from '@cosmic-arcana/sdk';
import { previousReadingsInputSchema, previousReadingsOutputSchema } from '@cosmic-arcana/sdk/mcp';
import { AgentActivityRecorder } from '../../agent/agent-activity.recorder';
import { ReadingHistoryPort } from '../../readings/reading-history.port';

@Injectable()
export class PreviousReadingsTool {
  constructor(
    private readonly history: ReadingHistoryPort,
    private readonly activity: AgentActivityRecorder,
  ) {}

  register(server: McpServer): void {
    server.registerTool(
      MCP_TOOLS.previousReadings,
      {
        title: 'Previous readings',
        description:
          "Returns the current user's most recent tarot readings, newest first: date, topic, spread, cards and a one-line summary. " +
          'Call it only when the question refers to the past, to an earlier reading, or to how something has changed over time. ' +
          'Skip it for self-contained questions.',
        inputSchema: previousReadingsInputSchema,
        outputSchema: previousReadingsOutputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      ({ limit }) => this.handle(limit),
    );
  }

  async handle(limit: number = PREVIOUS_READINGS_LIMIT.default): Promise<CallToolResult> {
    const startedAt = process.hrtime.bigint();
    this.activity.record('tool.called', {
      target: MCP_TOOLS.previousReadings,
      request: { limit },
    });

    try {
      const output: PreviousReadingsOutputV1 = { readings: await this.history.findRecent(limit) };
      this.activity.record('tool.completed', {
        target: MCP_TOOLS.previousReadings,
        request: { limit },
        response: output,
        durationMs: elapsedMs(startedAt),
        outcome: 'success',
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      this.activity.record('tool.failed', {
        target: MCP_TOOLS.previousReadings,
        request: { limit },
        durationMs: elapsedMs(startedAt),
        outcome: 'error',
        error: error as Error,
      });
      throw error;
    }
  }
}

const elapsedMs = (startedAt: bigint): number =>
  Number(process.hrtime.bigint() - startedAt) / 1_000_000;
