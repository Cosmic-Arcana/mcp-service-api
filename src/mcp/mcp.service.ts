import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createMcpHandler } from '@modelcontextprotocol/server';
import {
  toNodeHandler,
  type NodeIncomingMessageLike,
  type NodeMcpRequestHandler,
  type NodeServerResponseLike,
} from '@modelcontextprotocol/node';
import { McpServerFactory } from './mcp-server.factory';

@Injectable()
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);
  private handler!: NodeMcpRequestHandler;

  constructor(private readonly serverFactory: McpServerFactory) {}

  onModuleInit(): void {
    const httpHandler = createMcpHandler(() => this.serverFactory.create());

    this.handler = toNodeHandler(httpHandler, {
      onerror: (error: Error) =>
        this.logger.error('mcp request failed', {
          errorName: error.name,
          errorMessage: error.message,
        }),
    });
  }

  /**
   * Express has already drained the request stream, so the parsed body is handed over
   * explicitly instead of letting the adapter read from `req`.
   */
  handle(
    req: NodeIncomingMessageLike,
    res: NodeServerResponseLike,
    parsedBody: unknown,
  ): Promise<void> {
    return this.handler(req, res, parsedBody);
  }
}
