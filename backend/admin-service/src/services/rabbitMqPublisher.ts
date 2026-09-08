import amqp, { Channel, ChannelModel } from 'amqplib';
import { EventOutboxRow } from './eventOutbox';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

const structuredLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
) => {
  console[level](JSON.stringify({ level, event, ...fields }));
};

const isRabbitEnabled = () => process.env.OUTBOX_RABBITMQ_ENABLED === 'true';

const getExchangeName = () => process.env.OUTBOX_RABBITMQ_EXCHANGE || 'tembus.events';

const asIsoString = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const canonicalEventHeaders = (headers: Record<string, unknown> = {}) => ({
  ...(headers.request_id ? { request_id: headers.request_id } : {}),
  ...(headers.correlation_id ? { correlation_id: headers.correlation_id } : {}),
  ...(headers.trace_id ? { trace_id: headers.trace_id } : {}),
  ...(headers.market_code ? { market_code: headers.market_code } : {}),
  ...(headers.source ? { source: headers.source } : {}),
});

const ensureChannel = async () => {
  if (!isRabbitEnabled()) return null;
  if (channel) return channel;

  const rabbitUrl = process.env.RABBITMQ_URL;
  if (!rabbitUrl) {
    throw new Error('RABBITMQ_URL is required when OUTBOX_RABBITMQ_ENABLED=true');
  }

  connection = await amqp.connect(rabbitUrl);
  connection.on('error', (error) => {
    structuredLog('error', 'rabbitmq_connection_error', { message: error.message });
    channel = null;
    connection = null;
  });
  connection.on('close', () => {
    structuredLog('warn', 'rabbitmq_connection_closed', {});
    channel = null;
    connection = null;
  });

  channel = await connection.createChannel();
  await channel.assertExchange(getExchangeName(), 'topic', {
    durable: true,
  });
  return channel;
};

export const publishOutboxEvent = async (row: EventOutboxRow) => {
  const eventPayload = {
    event_id: row.id,
    event_type: row.event_type,
    schema_version: row.schema_version,
    occurred_at: asIsoString(row.occurred_at),
    produced_at: asIsoString(row.produced_at),
    market: row.market_code,
    service: row.service_name,
    actor_pseudonymous_id: row.actor_pseudonymous_id,
    entity_id: row.entity_id,
    correlation_id: row.correlation_id,
    trace_id: row.trace_id,
    pii_classification: row.pii_classification,
    field_pii_classification: row.field_pii_classification,
    retention_class: row.retention_class,
    dedupe_key: row.dedupe_key,
    data: row.payload,
    // Compatibility aliases for consumers that still read the pre-GLOB-005
    // envelope. They are removed only after all consumers migrate.
    id: row.id,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id,
    event_version: row.event_version,
    payload: row.payload,
    published_at: new Date().toISOString(),
  };

  if (!isRabbitEnabled()) {
    structuredLog('info', 'outbox_publish_noop', {
      outbox_id: row.id,
      event_type: row.event_type,
      aggregate_id: row.aggregate_id,
    });
    return;
  }

  const activeChannel = await ensureChannel();
  if (!activeChannel) return;

  const buffer = Buffer.from(JSON.stringify(eventPayload));
  const published = activeChannel.publish(
    getExchangeName(),
    row.event_type,
    buffer,
    {
      contentType: 'application/json',
      deliveryMode: 2,
      messageId: row.id,
      timestamp: Date.now(),
      headers: {
        ...canonicalEventHeaders(row.headers || {}),
        event_type: row.event_type,
        aggregate_type: row.aggregate_type,
        aggregate_id: row.aggregate_id,
        schema_version: row.schema_version,
        event_id: row.id,
        dedupe_key: row.dedupe_key,
      },
    },
  );

  if (!published) {
    await new Promise<void>((resolve) => activeChannel.once('drain', () => resolve()));
  }
};

export const closeRabbitMqPublisher = async () => {
  if (channel) {
    await channel.close().catch(() => undefined);
    channel = null;
  }
  if (connection) {
    await connection.close().catch(() => undefined);
    connection = null;
  }
};
