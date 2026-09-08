import { PoolClient } from 'pg';
import { db } from '../db';
import {
  buildCanonicalEventMetadata,
  CanonicalEventInput,
  canonicalEventHeaders,
} from './canonicalEvent';

export type OutboxEventInput = CanonicalEventInput;

export type EventOutboxRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string | null;
  event_type: string;
  event_version: number;
  schema_version: number;
  payload: Record<string, unknown>;
  headers: Record<string, unknown>;
  occurred_at: Date | string;
  produced_at: Date | string;
  market_code: string;
  service_name: string;
  actor_pseudonymous_id: string;
  entity_id: string;
  correlation_id: string;
  trace_id: string;
  pii_classification: string;
  field_pii_classification: Record<string, string>;
  retention_class: string;
  dedupe_key: string;
  attempts: number;
};

type Queryable = Pick<PoolClient, 'query'>;

export const enqueueOutboxEvent = async (
  queryable: Queryable,
  event: OutboxEventInput,
) => {
  const metadata = buildCanonicalEventMetadata(event);
  const version = metadata.schemaVersion;
  const { rows } = await queryable.query<{ id: string }>(
    `INSERT INTO event_outbox (
        aggregate_type,
        aggregate_id,
        event_type,
        event_version,
        schema_version,
        payload,
        headers,
        occurred_at,
        produced_at,
        market_code,
        service_name,
        actor_pseudonymous_id,
        entity_id,
        correlation_id,
        trace_id,
        pii_classification,
        field_pii_classification,
        retention_class,
        dedupe_key,
        available_at
      ) VALUES ($1, $2, $3, $4, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, COALESCE($19, NOW()))
      RETURNING id`,
    [
      event.aggregateType,
      event.aggregateId || null,
      event.eventType,
      version,
      JSON.stringify(event.payload || {}),
      JSON.stringify(canonicalEventHeaders(event.headers || {})),
      metadata.occurredAt,
      metadata.producedAt,
      metadata.marketCode,
      metadata.serviceName,
      metadata.actorPseudonymousId,
      metadata.entityId,
      metadata.correlationId,
      metadata.traceId,
      metadata.piiClassification,
      JSON.stringify(metadata.fieldPiiClassification),
      metadata.retentionClass,
      metadata.dedupeKey,
      event.availableAt || null,
    ],
  );
  return rows[0]?.id || null;
};

export const lockReadyOutboxEvents = async (
  workerId: string,
  limit: number,
) => {
  const { rows } = await db.query<EventOutboxRow>(
    `WITH ready AS (
        SELECT id
          FROM event_outbox
         WHERE status IN ('pending', 'retry')
           AND available_at <= NOW()
           AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '2 minutes')
         ORDER BY available_at ASC, created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
      )
      UPDATE event_outbox eo
         SET locked_at = NOW(),
             locked_by = $2,
             attempts = eo.attempts + 1,
             updated_at = NOW()
        FROM ready
       WHERE eo.id = ready.id
      RETURNING eo.id,
                eo.aggregate_type,
                eo.aggregate_id,
                eo.event_type,
                eo.event_version,
                eo.schema_version,
                eo.payload,
                eo.headers,
                eo.occurred_at,
                eo.produced_at,
                eo.market_code,
                eo.service_name,
                eo.actor_pseudonymous_id,
                eo.entity_id,
                eo.correlation_id,
                eo.trace_id,
                eo.pii_classification,
                eo.field_pii_classification,
                eo.retention_class,
                eo.dedupe_key,
                eo.attempts`,
    [Math.max(1, Math.min(limit, 500)), workerId],
  );
  return rows;
};

export const markOutboxPublished = async (id: string) => {
  await db.query(
    `UPDATE event_outbox
        SET status = 'published',
            published_at = NOW(),
            locked_at = NULL,
            locked_by = NULL,
            last_error = NULL,
            updated_at = NOW()
      WHERE id = $1`,
    [id],
  );
};

export const markOutboxRetry = async (
  id: string,
  errorMessage: string,
  attempts: number,
) => {
  const maxAttempts = Number.parseInt(process.env.OUTBOX_MAX_ATTEMPTS || '8', 10);
  const boundedAttempts = Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 8;
  const shouldDeadLetter = attempts >= boundedAttempts;
  const backoffSeconds = Math.min(900, Math.max(5, 2 ** Math.min(attempts, 8)));

  await db.query(
    `UPDATE event_outbox
        SET status = $2,
            available_at = CASE
              WHEN $2 = 'dead' THEN available_at
              ELSE NOW() + ($3::text || ' seconds')::interval
            END,
            locked_at = NULL,
            locked_by = NULL,
            last_error = $4,
            updated_at = NOW()
      WHERE id = $1`,
    [
      id,
      shouldDeadLetter ? 'dead' : 'retry',
      backoffSeconds,
      errorMessage.slice(0, 1000),
    ],
  );
};
