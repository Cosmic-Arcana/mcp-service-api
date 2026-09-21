import { Injectable } from '@nestjs/common';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ReadingHistoryPort } from '../../readings/reading-history.port';
import { readingSummarySchema } from '../../readings/reading-summary.schema';

export const PREVIOUS_READINGS_TOOL_NAME = 'get_previous_readings';

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe('How many recent readings to return, newest first.'),
});

export const previousReadingsOutputSchema = z.object({
  readings: z.array(readingSummarySchema),
});

@Injectable()
export class PreviousReadingsTool {
  constructor(private readonly history: ReadingHistoryPort) {}

  register(server: McpServer): void {
    server.registerTool(
      PREVIOUS_READINGS_TOOL_NAME,
      {
        title: 'Previous readings',
        description:
          "Returns the current user's most recent tarot readings, newest first: date, topic, spread, cards and a one-line summary. " +
          'Call it only when the question refers to the past, to an earlier reading, or to how something has changed over time. ' +
          'Skip it for self-contained questions.',
        inputSchema,
        outputSchema: previousReadingsOutputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      ({ limit }) => this.handle(limit),
    );
  }

  async handle(limit: number): Promise<CallToolResult> {
    const output = { readings: await this.history.findRecent(limit) };

    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
}
