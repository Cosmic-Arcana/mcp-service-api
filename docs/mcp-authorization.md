# MCP authorization and on-behalf-of (OBO) token exchange

The MCP endpoint is an OAuth 2.1 protected resource (MCP authorization spec, revision
2026-07-28). No valid access token for this resource, no MCP.

## Request flow

1. An agent calls `POST /mcp` without a token → `401` with
   `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp", scope="cosmic:read"`.
2. The agent reads the Protected Resource Metadata (RFC 9728), finds the Authorization Server,
   and runs the authorization code flow with PKCE and `resource=<MCP_RESOURCE_URL>` (RFC 8707).
   If the user is signed in at the AS, only a consent step remains. If not, the AS shows its login page.
3. `McpBearerAuthMiddleware` verifies every MCP request's JWT against the AS JWKS:
   issuer, signature (asymmetric algorithms only), expiry, and **`aud` = `MCP_RESOURCE_URL`**.
   A `tools/call` for a tool whose scopes the token lacks gets `403 insufficient_scope` (step-up).
4. The SDK builds a server per request with the verified `authInfo`. Tools close over that
   principal, so the user always comes from the token and never from tool arguments.
5. To call a downstream service, `OnBehalfOfTokenService` exchanges the user's token (RFC 8693)
   for one whose `aud` is that service. The MCP server authenticates as itself
   (`private_key_jwt` in production). The inbound token is **never forwarded** (no passthrough).
   Exchanged tokens are cached per inbound token + target and never outlive the inbound token.
6. The downstream token travels in the TCP envelope as `meta.authorization`.

## What the Authorization Server must enforce

This service relies on the AS for these rules; `test/support/mock-authorization-server.ts`
implements them and the e2e test exercises them:

- Only the MCP server's client may use the token-exchange grant.
- `subject_token` must be an access token whose `aud` is the MCP resource.
- `resource` must be on an allow-list of downstream services.
- Requested `scope` must be a subset of the subject token's scope (scopes only narrow).
- The issued token keeps `sub` and carries `act: { sub: <mcp client>, client_id: <agent client> }`.
- A revoked user grant makes the exchange fail with `invalid_grant`. The tool then tells the agent to reconnect.

## Downstream services

Each receiving service (nasa-service first) must validate `meta.authorization`:
signature via JWKS, `iss`, `exp`, `aud` equal to its own resource
(e.g. `urn:cosmic-arcana:nasa-service`), and the required scope. It should log `sub` and `act.client_id`.

## Configuration

See `.env.example`. `AUTH_ALLOW_INSECURE_ISSUER` and `client_secret_basic` are refused when `NODE_ENV=production`.
