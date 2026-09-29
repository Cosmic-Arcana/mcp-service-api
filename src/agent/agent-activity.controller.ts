import { BadRequestException, Controller, Get, Headers, Sse } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';
import type { AgentActivityFeedV1 } from '@cosmic-arcana/sdk';
import { AgentActivityStore } from './agent-activity.store';

const HEARTBEAT_MS = 25_000;

/**
 * Read side of the agent's activity, consumed by the storefront dashboard.
 *
 * TODO(authority): the user is taken from a header set by the BFF, which is trusted because the
 * service is not reachable from outside the cluster. It becomes a verified token claim once
 * authority-service-api exists.
 */
@Controller('agent-activity')
export class AgentActivityController {
  constructor(private readonly store: AgentActivityStore) {}

  @Get()
  feed(@Headers('x-user-id') userId: string | undefined): AgentActivityFeedV1 {
    return this.store.feed(this.require(userId));
  }

  @Sse('stream')
  stream(@Headers('x-user-id') userId: string | undefined): Observable<MessageEvent> {
    const user = this.require(userId);

    const events = new Observable<MessageEvent>((subscriber) =>
      this.store.subscribe(user, (event) => subscriber.next({ data: event } as MessageEvent)),
    );
    // Proxies drop a stream that says nothing; the heartbeat keeps it open between tool calls.
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map(() => ({ data: { heartbeat: new Date().toISOString() } }) as MessageEvent),
    );

    return merge(events, heartbeat);
  }

  private require(userId: string | undefined): string {
    if (!userId) {
      throw new BadRequestException('x-user-id header is required');
    }
    return userId;
  }
}
