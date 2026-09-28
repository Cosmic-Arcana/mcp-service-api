import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Principal } from '../../auth/principal';
import { TOOL_REQUIRED_SCOPES } from '../../auth/scopes';
import type { NasaClient } from '../../downstream/nasa/nasa.client';
import {
  delegationErrorResult,
  errorResult,
  jsonResult,
  scopeError,
} from './tool-result';

const NAME = 'get_cosmic_snapshot';

const InputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional()
    .describe('UTC calendar day (YYYY-MM-DD). Defaults to today.'),
});

export const registerCosmicSnapshotTool = (
  server: McpServer,
  principal: Principal,
  nasa: NasaClient,
): void => {
  server.registerTool(
    NAME,
    {
      title: 'Cosmic snapshot',
      description:
        'NASA sky data for a day: Astronomy Picture of the Day, near-Earth asteroids, solar flares and geomagnetic storms, moon phase, and normalized cosmic signals used by Cosmic Arcana readings.',
      inputSchema: InputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ date }) => {
      const denied = scopeError(principal, TOOL_REQUIRED_SCOPES[NAME] ?? []);
      if (denied) {
        return denied;
      }
      try {
        return jsonResult(await nasa.getCosmicSnapshot(principal, { date }));
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          return errorResult(
            'The sky data service did not answer in time. Try again shortly.',
          );
        }
        return delegationErrorResult(error);
      }
    },
  );
};
