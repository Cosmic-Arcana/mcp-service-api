import { Injectable, Logger } from '@nestjs/common';
import {
  McpServer,
  type McpRequestContext,
} from '@modelcontextprotocol/server';
import { principalFromAuthInfo } from '../auth/principal';
import { NasaClient } from '../downstream/nasa/nasa.client';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from './mcp.constants';
import { registerCosmicSnapshotTool } from './tools/cosmic-snapshot.tool';
import { registerWhoamiTool } from './tools/whoami.tool';

@Injectable()
export class McpServerFactory {
  private readonly logger = new Logger(McpServerFactory.name);

  constructor(private readonly nasa: NasaClient) {}

  /**
   * Called for every MCP request with that request's verified `authInfo`: tools close over
   * the principal, so user identity always comes from the token and never from tool arguments.
   */
  create(context: McpRequestContext): McpServer {
    const server = new McpServer({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    });

    const principal = principalFromAuthInfo(context.authInfo);
    if (!principal) {
      // Unreachable while McpBearerAuthMiddleware guards the route; if that ever regresses,
      // an unauthenticated caller gets a server with no tools rather than someone else's data.
      this.logger.error(
        'mcp server created without an authenticated principal',
      );
      return server;
    }

    registerWhoamiTool(server, principal);
    registerCosmicSnapshotTool(server, principal, this.nasa);
    return server;
  }
}
