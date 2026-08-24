import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/server';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from './mcp.constants';

@Injectable()
export class McpServerFactory {
  /**
   * Called once per MCP session rather than once per process: a server instance owns the
   * negotiated protocol state of the client it is connected to.
   */
  create(): McpServer {
    return new McpServer({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    });
  }
}
