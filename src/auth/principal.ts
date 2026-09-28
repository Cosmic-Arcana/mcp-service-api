import type { AuthInfo } from '@modelcontextprotocol/server';

/** RFC 8693 `act` claim: who is acting on the subject's behalf, possibly nested. */
export interface ActorClaim {
  sub?: string;
  client_id?: string;
  act?: ActorClaim;
}

export interface PrincipalExtra extends Record<string, unknown> {
  subject: string;
  tokenId?: string;
  actor?: ActorClaim;
}

/** The authenticated end user plus the agent (OAuth client) acting for them. */
export interface Principal {
  subject: string;
  clientId: string;
  scopes: readonly string[];
  /** The inbound access token; only ever used as an RFC 8693 subject_token, never forwarded. */
  accessToken: string;
  /** Seconds since epoch. */
  expiresAt: number;
  actor?: ActorClaim;
}

export const principalFromAuthInfo = (
  authInfo: AuthInfo | undefined,
): Principal | undefined => {
  const extra = authInfo?.extra as PrincipalExtra | undefined;
  if (!authInfo || !extra?.subject || authInfo.expiresAt === undefined) {
    return undefined;
  }
  return {
    subject: extra.subject,
    clientId: authInfo.clientId,
    scopes: authInfo.scopes,
    accessToken: authInfo.token,
    expiresAt: authInfo.expiresAt,
    actor: extra.actor,
  };
};
