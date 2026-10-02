import { OboTokenIdentityAdapter } from './obo-token-identity.adapter';

const token = (claims: Record<string, unknown>): string =>
  `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

describe('OboTokenIdentityAdapter', () => {
  const adapter = new OboTokenIdentityAdapter();

  it('reads the user from sub and the agent from an act object', () => {
    const header = `Bearer ${token({ sub: 'user-1', act: { sub: 'ai-agent' }, scope: 'readings:read cosmic:read' })}`;

    expect(adapter.resolve(header)).toEqual({
      userId: 'user-1',
      agent: 'ai-agent',
      scopes: ['readings:read', 'cosmic:read'],
    });
  });

  it('accepts act as a bare string', () => {
    expect(adapter.resolve(`Bearer ${token({ sub: 'user-1', act: 'ai-agent' })}`)).toEqual({
      userId: 'user-1',
      agent: 'ai-agent',
      scopes: [],
    });
  });

  it('treats a token without an act claim as the user acting directly', () => {
    expect(adapter.resolve(`Bearer ${token({ sub: 'user-1' })}`)).toMatchObject({ agent: null });
  });

  it.each([
    ['no header', undefined],
    ['a header that is not a bearer token', 'Basic abc'],
    ['a token without a subject', `Bearer ${token({ act: 'ai-agent' })}`],
    ['a token whose payload is not json', 'Bearer header.bm90LWpzb24.signature'],
  ])('resolves nobody for %s', (_case, header) => {
    expect(adapter.resolve(header)).toBeNull();
  });
});
