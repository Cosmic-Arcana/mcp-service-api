import { Module } from '@nestjs/common';
import { NasaModule } from '../downstream/nasa/nasa.module';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpService } from './mcp.service';

@Module({
  imports: [NasaModule],
  controllers: [McpController],
  providers: [McpServerFactory, McpService],
  exports: [McpService],
})
export class McpModule {}
