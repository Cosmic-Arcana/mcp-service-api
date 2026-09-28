import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'node:crypto';
import type { NasaServiceConfig } from '../../config/configuration';
import type { Principal } from '../../auth/principal';
import type { MessageEnvelope } from '../../common/messaging/message-envelope';
import { OnBehalfOfTokenService } from '../../token-exchange/on-behalf-of-token.service';

export const NASA_TRANSPORT = Symbol('NASA_TRANSPORT');

// Mirrors NASA_MESSAGE_PATTERNS in nasa-service-api until both import them from the SDK.
export const NASA_PATTERNS = {
  cosmicSnapshot: 'nasa.cosmic.snapshot',
} as const;

export interface CosmicSnapshotQuery {
  date?: string;
}

/** Calls nasa-service-api as the user: every message carries a token minted for nasa-service only. */
@Injectable()
export class NasaClient {
  private readonly config: NasaServiceConfig;

  constructor(
    @Inject(NASA_TRANSPORT) private readonly transport: ClientProxy,
    private readonly obo: OnBehalfOfTokenService,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<NasaServiceConfig>('nasaService');
  }

  async getCosmicSnapshot(
    principal: Principal,
    query: CosmicSnapshotQuery,
  ): Promise<unknown> {
    const token = await this.obo.tokenFor(principal, this.config);
    const envelope: MessageEnvelope<CosmicSnapshotQuery> = {
      meta: {
        correlationId: randomUUID(),
        issuedAt: new Date().toISOString(),
        origin: 'mcp-service-api',
        authorization: `Bearer ${token}`,
      },
      data: query,
    };
    return firstValueFrom(
      this.transport
        .send(NASA_PATTERNS.cosmicSnapshot, envelope)
        .pipe(timeout(this.config.timeoutMs)),
    );
  }
}
