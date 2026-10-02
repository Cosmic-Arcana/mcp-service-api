import { Global, Module } from '@nestjs/common';
import { AgentActivityController } from './agent-activity.controller';
import { AgentActivityRecorder } from './agent-activity.recorder';
import { AgentActivityStore } from './agent-activity.store';
import { AgentIdentityPort } from './agent-identity.port';
import { InMemoryAgentActivityStore } from './in-memory-agent-activity.store';
import { OboTokenIdentityAdapter } from './obo-token-identity.adapter';

@Global()
@Module({
  controllers: [AgentActivityController],
  providers: [
    AgentActivityRecorder,
    { provide: AgentActivityStore, useClass: InMemoryAgentActivityStore },
    { provide: AgentIdentityPort, useClass: OboTokenIdentityAdapter },
  ],
  exports: [AgentActivityRecorder, AgentActivityStore, AgentIdentityPort],
})
export class AgentModule {}
