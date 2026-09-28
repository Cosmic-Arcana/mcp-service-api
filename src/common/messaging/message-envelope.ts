/**
 * Same envelope as the other services (`common/messaging/message-envelope.ts` there), plus
 * `authorization`: TCP has no headers, so the downstream bearer token travels in `meta`.
 * Moves to `@cosmic-arcana/sdk-core` once the SDK exists.
 */
export interface MessageMeta {
  correlationId: string;
  idempotencyKey?: string;
  issuedAt: string;
  origin: string;
  /** `Bearer <token>`: an exchanged (OBO) token whose `aud` is the receiving service. */
  authorization?: string;
}

export interface MessageEnvelope<TData = unknown> {
  meta: MessageMeta;
  data: TData;
}
