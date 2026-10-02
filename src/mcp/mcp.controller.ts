import { All, Body, Controller, Headers, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AgentActorV1 } from '@cosmic-arcana/sdk';
import { AgentActivityRecorder } from '../agent/agent-activity.recorder';
import { runWithAgentContext } from '../agent/agent-context.storage';
import { AgentIdentityPort } from '../agent/agent-identity.port';
import { MCP_ROUTE } from './mcp.constants';
import { McpService } from './mcp.service';
import { RejectedToolCalls } from './rejected-tool-calls';

@Controller(MCP_ROUTE)
export class McpController {
  private readonly seenSessions = new Set<string>();

  constructor(
    private readonly mcp: McpService,
    private readonly identity: AgentIdentityPort,
    private readonly activity: AgentActivityRecorder,
    private readonly rejected: RejectedToolCalls,
  ) {}

  /**
   * @Res() hands response control to the MCP adapter, which streams SSE for long-running
   * responses and must own the socket for the whole exchange.
   */
  @All()
  handle(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Headers('mcp-session-id') sessionHeader: string | undefined,
  ): Promise<void> {
    const actor = this.identity.resolve(authorization);
    const sessionId = sessionHeader ?? statelessSessionId(actor);

    return runWithAgentContext({ sessionId, actor }, async () => {
      if (actor && !this.seenSessions.has(sessionId)) {
        this.seenSessions.add(sessionId);
        this.activity.record('session.opened', { target: req.method });
      }

      this.rejected.record(body);

      try {
        return await this.mcp.handle(req, res, body);
      } finally {
        // The protocol ends a session with DELETE; anything else keeps it open.
        if (actor && req.method === 'DELETE') {
          this.seenSessions.delete(sessionId);
          this.activity.record('session.closed');
        }
      }
    });
  }
}

/**
 * A stateless client sends no session header, so every request would otherwise look like a new
 * session. Grouping those under one id per agent keeps the activity feed readable.
 */
const statelessSessionId = (actor: AgentActorV1 | null): string =>
  `stateless:${actor?.agent ?? 'agent'}`;
