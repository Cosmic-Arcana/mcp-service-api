import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { decodeJwt } from 'jose';
import { of } from 'rxjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AddressInfo } from 'node:net';
import type * as AppModuleExports from '../src/app.module';
import type { MessageEnvelope } from '../src/common/messaging/message-envelope';
import type * as NasaClientExports from '../src/downstream/nasa/nasa.client';
import { MockAuthorizationServer } from './support/mock-authorization-server';

const MCP_RESOURCE = 'http://localhost:3003/mcp';
const NASA_RESOURCE = 'urn:cosmic-arcana:nasa-service';
const EXCHANGE_CLIENT = {
  id: 'mcp-service-api',
  secret: 'e2e-exchange-secret-0000',
};

interface SentMessage {
  pattern: string;
  envelope: MessageEnvelope<{ date?: string }>;
}

describe('MCP authorization and on-behalf-of token exchange (e2e)', () => {
  const as = new MockAuthorizationServer({
    mcpResource: MCP_RESOURCE,
    exchangeClient: EXCHANGE_CLIENT,
    allowedTargets: [NASA_RESOURCE],
  });
  const sentToNasa: SentMessage[] = [];
  let app: INestApplication<App>;
  let baseUrl: string;

  beforeAll(async () => {
    await as.start();
    Object.assign(process.env, {
      NODE_ENV: 'test',
      MCP_RESOURCE_URL: MCP_RESOURCE,
      AUTH_ISSUER: as.issuer,
      AUTH_ALLOW_INSECURE_ISSUER: 'true',
      AUTH_ALLOWED_ALGORITHMS: 'ES256',
      AUTH_REQUIRE_AT_JWT_TYP: 'true',
      TOKEN_EXCHANGE_CLIENT_ID: EXCHANGE_CLIENT.id,
      TOKEN_EXCHANGE_AUTH_METHOD: 'client_secret_basic',
      TOKEN_EXCHANGE_CLIENT_SECRET: EXCHANGE_CLIENT.secret,
      NASA_SERVICE_RESOURCE: NASA_RESOURCE,
      NASA_SERVICE_SCOPES: 'cosmic:read',
    });

    // Loaded only after the env is set: ConfigModule validates process.env when the module loads.
    const { AppModule } =
      jest.requireActual<typeof AppModuleExports>('../src/app.module');
    const { NASA_TRANSPORT } = jest.requireActual<typeof NasaClientExports>(
      '../src/downstream/nasa/nasa.client',
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NASA_TRANSPORT)
      .useValue({
        send: (pattern: string, envelope: SentMessage['envelope']) => {
          sentToNasa.push({ pattern, envelope });
          return of({
            date: envelope.data.date ?? 'today',
            moon: { name: 'full' },
          });
        },
      })
      .compile();

    app = moduleRef.createNestApplication<INestApplication<App>>({
      logger: false,
    });
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
    await as.stop();
  });

  const connect = async (token: string): Promise<Client> => {
    const client = new Client({ name: 'e2e-agent', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  };

  const userToken = (scope = 'cosmic:read spreads:read', sub = 'user-42') =>
    as.issueAccessToken({
      sub,
      clientId: 'https://agent.example/client-metadata.json',
      scope,
    });

  describe('discovery', () => {
    it('serves RFC 9728 protected resource metadata pointing at the authorization server', async () => {
      const res = await request(app.getHttpServer())
        .get('/.well-known/oauth-protected-resource/mcp')
        .expect(200);

      expect(res.body).toEqual({
        resource: MCP_RESOURCE,
        authorization_servers: [as.issuer],
        scopes_supported: ['cosmic:read', 'spreads:read', 'spreads:write'],
        bearer_methods_supported: ['header'],
        resource_name: 'Cosmic Arcana MCP',
      });
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('404s metadata for a resource path it does not serve', async () => {
      await request(app.getHttpServer())
        .get('/.well-known/oauth-protected-resource/other')
        .expect(404);
    });
  });

  describe('no valid token, no MCP', () => {
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'x', version: '1' },
      },
    };

    it('challenges an anonymous request with 401 and the metadata URL', async () => {
      const res = await request(app.getHttpServer())
        .post('/mcp')
        .send(initialize)
        .expect(401);

      expect(res.headers['www-authenticate']).toContain(
        'resource_metadata="http://localhost:3003/.well-known/oauth-protected-resource/mcp"',
      );
    });

    it('rejects a token minted for another audience (no confused deputy)', async () => {
      const storefrontToken = await as.issueAccessToken({
        sub: 'user-42',
        clientId: 'storefront',
        scope: 'cosmic:read',
        audience: 'https://cosmic-arcana.test/bff',
      });

      await request(app.getHttpServer())
        .post('/mcp')
        .set('authorization', `Bearer ${storefrontToken}`)
        .send(initialize)
        .expect(401);
    });

    it('rejects a token from another issuer', async () => {
      const forged = await as.issueAccessToken({
        sub: 'user-42',
        clientId: 'agent',
        scope: 'cosmic:read',
        issuer: 'https://evil.test',
      });

      await request(app.getHttpServer())
        .post('/mcp')
        .set('authorization', `Bearer ${forged}`)
        .send(initialize)
        .expect(401);
    });

    it('asks for step-up with 403 insufficient_scope when a tool needs more scope', async () => {
      const narrow = await userToken('spreads:read');

      const res = await request(app.getHttpServer())
        .post('/mcp')
        .set('authorization', `Bearer ${narrow}`)
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'get_cosmic_snapshot', arguments: {} },
        })
        .expect(403);

      expect(res.headers['www-authenticate']).toContain(
        'error="insufficient_scope"',
      );
      expect(res.headers['www-authenticate']).toContain(
        'scope="spreads:read cosmic:read"',
      );
    });
  });

  describe('signed-in user through an MCP client', () => {
    it('identifies the user and the agent from the token', async () => {
      const client = await connect(await userToken());

      const result = await client.callTool({ name: 'whoami', arguments: {} });

      expect(result.structuredContent).toMatchObject({
        subject: 'user-42',
        clientId: 'https://agent.example/client-metadata.json',
        scopes: ['cosmic:read', 'spreads:read'],
      });
      await client.close();
    });

    it('calls nasa-service with an exchanged token: same user, nasa audience, MCP server as actor', async () => {
      const inbound = await userToken();
      const client = await connect(inbound);
      sentToNasa.length = 0;
      as.exchanges.length = 0;

      const first = await client.callTool({
        name: 'get_cosmic_snapshot',
        arguments: { date: '2026-09-28' },
      });
      const second = await client.callTool({
        name: 'get_cosmic_snapshot',
        arguments: {},
      });

      expect(first.isError).toBeFalsy();
      expect(first.structuredContent).toEqual({
        date: '2026-09-28',
        moon: { name: 'full' },
      });
      expect(second.isError).toBeFalsy();

      // One exchange, reused for the second call.
      expect(as.exchanges).toEqual([
        { subject: 'user-42', resource: NASA_RESOURCE, scope: 'cosmic:read' },
      ]);
      expect(sentToNasa).toHaveLength(2);

      const { pattern, envelope } = sentToNasa[0];
      expect(pattern).toBe('nasa.cosmic.snapshot');
      expect(envelope.data).toEqual({ date: '2026-09-28' });
      expect(envelope.meta.origin).toBe('mcp-service-api');

      const forwarded = envelope.meta.authorization!.replace(/^Bearer /, '');
      // Never token passthrough: the inbound MCP token must not reach the downstream service.
      expect(forwarded).not.toBe(inbound);
      expect(decodeJwt(forwarded)).toMatchObject({
        sub: 'user-42',
        aud: NASA_RESOURCE,
        scope: 'cosmic:read',
        act: {
          sub: EXCHANGE_CLIENT.id,
          client_id: 'https://agent.example/client-metadata.json',
        },
      });
      await client.close();
    });

    it('tells the agent to reconnect once the user revoked it', async () => {
      const client = await connect(
        await userToken('cosmic:read', 'user-revoked'),
      );
      as.revokedSubjects.add('user-revoked');

      const result = await client.callTool({
        name: 'get_cosmic_snapshot',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(
        'expired or was revoked',
      );
      await client.close();
    });
  });
});
