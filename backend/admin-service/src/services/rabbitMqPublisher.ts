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
    id: row.id,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id,
    event_type: row.event_type,
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
        ...(row.headers || {}),
        event_type: row.event_type,
        aggregate_type: row.aggregate_type,
        aggregate_id: row.aggregate_id,
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
