import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TokenExchangeConfig } from '../config/configuration';
import { AuthModule } from '../auth/auth.module';
import { createClientAuthentication } from './client-authentication';
import { OnBehalfOfTokenService } from './on-behalf-of-token.service';
import {
  CLIENT_AUTHENTICATION,
  FETCH,
  TokenExchangeClient,
} from './token-exchange.client';

@Module({
  imports: [AuthModule],
  providers: [
    TokenExchangeClient,
    OnBehalfOfTokenService,
    {
      provide: CLIENT_AUTHENTICATION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createClientAuthentication(
          config.getOrThrow<TokenExchangeConfig>('tokenExchange'),
        ),
    },
    {
      provide: FETCH,
      useValue: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, init),
    },
  ],
  exports: [OnBehalfOfTokenService],
})
export class TokenExchangeModule {}
