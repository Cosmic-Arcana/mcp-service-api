import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/server';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from './mcp.constants';
import { PreviousReadingsTool } from './tools/previous-readings.tool';

@Injectable()
export class McpServerFactory {
  constructor(private readonly previousReadings: PreviousReadingsTool) {}

  /**
   * Called once per MCP session rather than once per process: a server instance owns the
   * negotiated protocol state of the client it is connected to.
   */
  create(): McpServer {
    const server = new McpServer({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    });

    this.previousReadings.register(server);

    return server;
  }
}
