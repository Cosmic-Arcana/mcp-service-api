import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpService } from './mcp.service';

@Module({
  controllers: [McpController],
  providers: [McpServerFactory, McpService],
  exports: [McpService],
})
export class McpModule {}
