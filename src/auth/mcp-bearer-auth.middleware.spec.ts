import { ConfigService } from '@nestjs/config';
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
} from '@modelcontextprotocol/server';
import type { Response } from 'express';
import type { AccessTokenVerifier } from './access-token.verifier';
import {
  McpBearerAuthMiddleware,
  type AuthenticatedRequest,
} from './mcp-bearer-auth.middleware';

const RESOURCE_METADATA =
  'https://mcp.test/.well-known/oauth-protected-resource/mcp';

const authInfo = (scopes: string[]): AuthInfo => ({
  token: 'token',
  clientId: 'agent-1',
  scopes,
  expiresAt: Math.floor(Date.now() / 1000) + 600,
  extra: { subject: 'user-1' },
});

const fakeResponse = () => {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    send(body: string) {
      res.body = body;
    },
  };
  return res;
};

describe('McpBearerAuthMiddleware', () => {
  const verifyAccessToken = jest.fn<Promise<AuthInfo>, [string]>();
  const middleware = new McpBearerAuthMiddleware(
    { verifyAccessToken } as unknown as AccessTokenVerifier,
    new ConfigService({ mcpResourceUrl: 'https://mcp.test/mcp' }),
  );

  const run = async (headers: Record<string, string>, body?: unknown) => {
    const req = { headers, body } as unknown as AuthenticatedRequest;
    const res = fakeResponse();
    const next = jest.fn();
    await middleware.use(req, res as unknown as Response, next);
    return { req, res, next };
  };

  beforeEach(() => verifyAccessToken.mockReset());

  it('answers 401 with a resource_metadata challenge when no token is sent', async () => {
    const { res, next } = await run({});

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain(
      `resource_metadata="${RESOURCE_METADATA}"`,
    );
    expect(res.headers['www-authenticate']).toContain('scope="cosmic:read"');
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('answers 401 invalid_token when the verifier rejects the token', async () => {
    verifyAccessToken.mockRejectedValue(
      new OAuthError(OAuthErrorCode.InvalidToken, 'access token expired'),
    );

    const { res, next } = await run({ authorization: 'Bearer expired' });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
  });

  it('answers 403 insufficient_scope for a tool call the token is not scoped for, asking for the union of scopes', async () => {
    verifyAccessToken.mockResolvedValue(authInfo(['spreads:read']));

    const { res, next } = await run(
      { authorization: 'Bearer narrow' },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_cosmic_snapshot', arguments: {} },
      },
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.headers['www-authenticate']).toContain(
      'error="insufficient_scope"',
    );
    expect(res.headers['www-authenticate']).toContain(
      'scope="spreads:read cosmic:read"',
    );
  });

  it('passes a valid, sufficiently scoped request through with req.auth set', async () => {
    const info = authInfo(['cosmic:read']);
    verifyAccessToken.mockResolvedValue(info);

    const { req, next } = await run(
      { authorization: 'Bearer good' },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_cosmic_snapshot' },
      },
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toBe(info);
    expect(verifyAccessToken).toHaveBeenCalledWith('good');
  });

  it('does not scope-gate non tool-call messages', async () => {
    verifyAccessToken.mockResolvedValue(authInfo([]));

    const { next } = await run(
      { authorization: 'Bearer good' },
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    );

    expect(next).toHaveBeenCalledTimes(1);
  });
});
