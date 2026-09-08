import { createHash, randomUUID } from 'node:crypto';

export const CANONICAL_EVENT_SCHEMA_VERSION = 1;

export const PII_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export type PiiClassification = (typeof PII_CLASSIFICATIONS)[number];

export const RETENTION_CLASSES = ['short', 'standard', 'financial', 'legal_hold'] as const;
export type RetentionClass = (typeof RETENTION_CLASSES)[number];

export type CanonicalEventMetadata = {
  schemaVersion: number;
  occurredAt: Date;
  producedAt: Date;
  marketCode: string;
  serviceName: string;
  actorPseudonymousId: string;
  entityId: string;
  correlationId: string;
  traceId: string;
  piiClassification: PiiClassification;
  fieldPiiClassification: Record<string, PiiClassification>;
  retentionClass: RetentionClass;
  dedupeKey: string;
};

const MARKET_CODE_PATTERN = /^[a-z]{2}-[a-z0-9-]+$/;
const EVENT_TYPE_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const ACTOR_PSEUDONYM_PATTERN = /^(?:system|actor_[a-zA-Z0-9_-]{16,128}|anon_[a-zA-Z0-9_-]{16,128})$/;

const stringValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const headerString = (headers: Record<string, unknown>, ...names: string[]) => {
  for (const name of names) {
    const value = stringValue(headers[name]);
    if (value) return value;
  }
  return null;
};

const hashDedupeKey = (value: string) => createHash('sha256').update(value).digest('hex');

export type CanonicalEventInput = {
  aggregateType: string;
  aggregateId?: string | null;
  eventType: string;
  eventVersion?: number;
  payload?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  availableAt?: Date;
  occurredAt?: Date;
  producedAt?: Date;
  marketCode?: string;
  serviceName?: string;
  actorPseudonymousId?: string;
  entityId?: string;
  correlationId?: string;
  traceId?: string;
  piiClassification?: PiiClassification;
  fieldPiiClassification?: Record<string, PiiClassification>;
  retentionClass?: RetentionClass;
  dedupeKey?: string;
};

export const validateCanonicalEventInput = (event: CanonicalEventInput): void => {
  if (!stringValue(event.aggregateType)) throw new Error('canonical event aggregateType is required');
  if (!EVENT_TYPE_PATTERN.test(event.eventType)) {
    throw new Error(`canonical event type is invalid: ${event.eventType}`);
  }
  const version = event.eventVersion || CANONICAL_EVENT_SCHEMA_VERSION;
  if (!Number.isInteger(version) || version < 1) throw new Error('canonical event schema version must be positive');
  const marketCode = (event.marketCode || stringValue(event.headers?.market_code) || 'id-jk').toLowerCase();
  if (!MARKET_CODE_PATTERN.test(marketCode)) throw new Error(`canonical event market is invalid: ${marketCode}`);
  const actor = event.actorPseudonymousId || 'system';
  if (!ACTOR_PSEUDONYM_PATTERN.test(actor)) {
    throw new Error('canonical event actor must be a pseudonymous identifier');
  }
  const serviceName = event.serviceName || process.env.LANCAR_SERVICE_NAME || 'admin-service';
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(serviceName)) {
    throw new Error(`canonical event service is invalid: ${serviceName}`);
  }
  if (event.piiClassification && !PII_CLASSIFICATIONS.includes(event.piiClassification)) {
    throw new Error(`canonical event PII classification is invalid: ${event.piiClassification}`);
  }
  if (event.retentionClass && !RETENTION_CLASSES.includes(event.retentionClass)) {
    throw new Error(`canonical event retention class is invalid: ${event.retentionClass}`);
  }
  for (const classification of Object.values(event.fieldPiiClassification || {})) {
    if (!PII_CLASSIFICATIONS.includes(classification)) {
      throw new Error(`canonical event field PII classification is invalid: ${classification}`);
    }
  }
};

export const buildCanonicalEventMetadata = (event: CanonicalEventInput): CanonicalEventMetadata => {
  validateCanonicalEventInput(event);
  const headers = event.headers || {};
  const payload = event.payload || {};
  const version = event.eventVersion || CANONICAL_EVENT_SCHEMA_VERSION;
  const occurredAt = event.occurredAt || new Date();
  const producedAt = event.producedAt || new Date();
  const marketCode = (event.marketCode || headerString(headers, 'market_code') || stringValue(payload.market_code) || 'id-jk').toLowerCase();
  const entityId = event.entityId || event.aggregateId || event.eventType;
  const correlationId = event.correlationId || headerString(headers, 'correlation_id', 'request_id') || randomUUID();
  const traceId = event.traceId || headerString(headers, 'trace_id') || correlationId;
  const dedupeSource = event.dedupeKey
    || headerString(headers, 'idempotency_key')
    || `${event.eventType}|${entityId}|${version}|${correlationId}`;

  return {
    schemaVersion: version,
    occurredAt,
    producedAt,
    marketCode,
    serviceName: event.serviceName || process.env.LANCAR_SERVICE_NAME || 'admin-service',
    actorPseudonymousId: event.actorPseudonymousId || 'system',
    entityId,
    correlationId,
    traceId,
    piiClassification: event.piiClassification || 'restricted',
    fieldPiiClassification: event.fieldPiiClassification || { payload: 'restricted' },
    retentionClass: event.retentionClass || 'standard',
    dedupeKey: hashDedupeKey(dedupeSource),
  };
};

export const canonicalEventHeaders = (headers: Record<string, unknown> = {}) => {
  const allowed = ['request_id', 'correlation_id', 'trace_id', 'market_code', 'source'];
  return Object.fromEntries(
    allowed
      .map((key) => [key, headers[key]])
      .filter(([, value]) => value !== null && value !== undefined && value !== ''),
  );
};
