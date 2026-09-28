import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import type { NasaServiceConfig } from '../../config/configuration';
import { TokenExchangeModule } from '../../token-exchange/token-exchange.module';
import { NASA_TRANSPORT, NasaClient } from './nasa.client';

@Module({
  imports: [TokenExchangeModule],
  providers: [
    NasaClient,
    {
      provide: NASA_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { host, port } =
          config.getOrThrow<NasaServiceConfig>('nasaService');
        return ClientProxyFactory.create({
          transport: Transport.TCP,
          options: { host, port },
        });
      },
    },
  ],
  exports: [NasaClient],
})
export class NasaModule {}
