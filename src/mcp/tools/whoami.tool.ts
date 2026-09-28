import type { McpServer } from '@modelcontextprotocol/server';
import type { Principal } from '../../auth/principal';
import { jsonResult } from './tool-result';

export const registerWhoamiTool = (
  server: McpServer,
  principal: Principal,
): void => {
  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description:
        'Shows which Cosmic Arcana account and which AI client this connection is authorized for.',
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    () =>
      jsonResult({
        subject: principal.subject,
        clientId: principal.clientId,
        scopes: principal.scopes,
        expiresAt: new Date(principal.expiresAt * 1000).toISOString(),
      }),
  );
};
