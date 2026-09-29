import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentModule } from './agent/agent.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [AgentModule, McpModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
