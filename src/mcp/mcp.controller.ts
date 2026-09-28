import { All, Body, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MCP_ROUTE } from './mcp.constants';
import { McpService } from './mcp.service';

@Controller(MCP_ROUTE)
export class McpController {
  constructor(private readonly mcp: McpService) {}

  /**
   * @Res() hands response control to the MCP adapter, which streams SSE for long-running
   * responses and must own the socket for the whole exchange.
   */
  @All()
  handle(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    return this.mcp.handle(req, res, body);
  }
}
