import { ConfigService } from '@nestjs/config';
import type { Principal } from '../auth/principal';
import type { TokenExchangeConfig } from '../config/configuration';
import { OnBehalfOfTokenService } from './on-behalf-of-token.service';
import type {
  ExchangedToken,
  TokenExchangeClient,
  TokenExchangeRequest,
} from './token-exchange.client';
import { DelegationScopeError } from './token-exchange.errors';

const nowSec = () => Math.floor(Date.now() / 1000);

const principal = (overrides: Partial<Principal> = {}): Principal => ({
  subject: 'user-1',
  clientId: 'agent-1',
  scopes: ['cosmic:read', 'spreads:read'],
  accessToken: 'inbound-token-1',
  expiresAt: nowSec() + 900,
  ...overrides,
});

const nasa = { resource: 'urn:svc:nasa', scopes: ['cosmic:read'] };

describe('OnBehalfOfTokenService', () => {
  let exchange: jest.Mock<Promise<ExchangedToken>, [TokenExchangeRequest]>;
  let service: OnBehalfOfTokenService;
  let issued: number;

  beforeEach(() => {
    issued = 0;
    exchange = jest.fn((request: TokenExchangeRequest) =>
      Promise.resolve({
        accessToken: `downstream-${++issued}`,
        expiresAt: nowSec() + 300,
        scopes: request.scopes,
      }),
    );
    const config: Partial<TokenExchangeConfig> = {
      expirySkewSec: 30,
      maxCacheEntries: 100,
    };
    service = new OnBehalfOfTokenService(
      new ConfigService({ tokenExchange: config }),
      {
        exchange,
      } as unknown as TokenExchangeClient,
    );
  });

  it('exchanges the inbound token for the target resource and scopes', async () => {
    await expect(service.tokenFor(principal(), nasa)).resolves.toBe(
      'downstream-1',
    );
    expect(exchange).toHaveBeenCalledWith({
      subjectToken: 'inbound-token-1',
      resource: 'urn:svc:nasa',
      scopes: ['cosmic:read'],
    });
  });

  it('reuses a cached token for the same inbound token and target', async () => {
    await service.tokenFor(principal(), nasa);
    await expect(service.tokenFor(principal(), nasa)).resolves.toBe(
      'downstream-1',
    );
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight exchange between concurrent calls', async () => {
    const tokens = await Promise.all([
      service.tokenFor(principal(), nasa),
      service.tokenFor(principal(), nasa),
    ]);
    expect(tokens).toEqual(['downstream-1', 'downstream-1']);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('never reuses an exchange across different inbound tokens, even for the same user', async () => {
    await service.tokenFor(principal(), nasa);
    await expect(
      service.tokenFor(principal({ accessToken: 'inbound-token-2' }), nasa),
    ).resolves.toBe('downstream-2');
  });

  it('does not cache past the lifetime of the inbound token', async () => {
    const shortLived = principal({ expiresAt: nowSec() + 10 }); // inside the 30 s skew
    await service.tokenFor(shortLived, nasa);
    await service.tokenFor(shortLived, nasa);
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it('refuses to request a downstream scope the user never granted, without calling the AS', async () => {
    const error = await service
      .tokenFor(principal({ scopes: ['spreads:read'] }), nasa)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DelegationScopeError);
    expect((error as DelegationScopeError).missing).toEqual(['cosmic:read']);
    expect(exchange).not.toHaveBeenCalled();
  });

  it('does not cache a failed exchange', async () => {
    exchange.mockRejectedValueOnce(new Error('boom'));
    await expect(service.tokenFor(principal(), nasa)).rejects.toThrow('boom');
    await expect(service.tokenFor(principal(), nasa)).resolves.toBe(
      'downstream-1',
    );
  });
});
