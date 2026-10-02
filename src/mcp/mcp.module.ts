import { Module } from '@nestjs/common';
import { ReadingsModule } from '../readings/readings.module';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpService } from './mcp.service';
import { PreviousReadingsTool } from './tools/previous-readings.tool';

@Module({
  imports: [ReadingsModule],
  controllers: [McpController],
  providers: [McpServerFactory, McpService, PreviousReadingsTool],
  exports: [McpService],
})
export class McpModule {}
