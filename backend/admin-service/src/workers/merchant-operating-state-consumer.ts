import amqp, { Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { getIO } from '../websocket';
import { recordRealtimeMetric, realtimeStructuredLog } from '../services/realtimeObservability';
import { MERCHANT_AVAILABILITY_ROOM } from '../realtimeRooms';

const EXCHANGE = process.env.OUTBOX_RABBITMQ_EXCHANGE || 'tembus.events';
const QUEUE = process.env.MERCHANT_OPERATING_STATE_QUEUE || 'queue.admin.merchant-operating-state';
const DEAD_LETTER_EXCHANGE = `${EXCHANGE}.dlq`;

const ADMIN_REALTIME_ROOMS = [
  'super_admin',
  'admin',
  'manager',
  'ops_security',
  'ops_admin',
  'finance_admin',
  'cs_agent',
  'zone_manager',
];

export type MerchantOperatingStateRealtimePayload = {
  event_id: string;
  event_type: 'merchant.operating_state.changed';
  merchant_id: string;
  previous_state: string | null;
  state: string;
  is_open: boolean | null;
  reason: string | null;
  effective_until: string | null;
  source: string | null;
  state_version: number | null;
  updated_at: string | null;
  occurred_at: string | null;
};

export type MerchantAvailabilityRealtimePayload = Pick<
  MerchantOperatingStateRealtimePayload,
  'event_id' | 'event_type' | 'merchant_id' | 'state' | 'is_open' | 'state_version' | 'occurred_at'
> & {
  received_at: string;
};

const boundedString = (value: unknown, max = 160) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

const boundedBoolean = (value: unknown) => (typeof value === 'boolean' ? value : null);

const boundedNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

/**
 * Convert both canonical (`data`) and pre-canonical (`payload`) envelopes into
 * a safe invalidation payload. The consumer never forwards arbitrary event
 * fields to browsers.
 */
export const normalizeMerchantOperatingStateEvent = (
  raw: unknown,
): MerchantOperatingStateRealtimePayload | null => {
  if (!raw || typeof raw !== 'object') return null;
  const envelope = raw as Record<string, unknown>;
  if (envelope.event_type !== 'merchant.operating_state.changed') return null;

  const data = (envelope.data || envelope.payload) as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return null;

  const merchantId = boundedString(data.merchant_id || envelope.aggregate_id, 80);
  const state = boundedString(data.state, 40);
  const eventId = boundedString(envelope.event_id || envelope.id, 120);
  if (!merchantId || !state || !eventId) return null;

  return {
    event_id: eventId,
    event_type: 'merchant.operating_state.changed',
    merchant_id: merchantId,
    previous_state: boundedString(data.previous_state, 40),
    state,
    is_open: boundedBoolean(data.is_open),
    reason: boundedString(data.reason, 120),
    effective_until: boundedString(data.effective_until, 80),
    source: boundedString(data.source, 40),
    state_version: boundedNumber(data.state_version),
    updated_at: boundedString(data.updated_at, 80),
    occurred_at: boundedString(envelope.occurred_at, 80),
  };
};

const started = { value: false };
let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
const deliveredEventIds = new Set<string>();

const rememberEvent = (eventId: string) => {
  if (deliveredEventIds.has(eventId)) return false;
  deliveredEventIds.add(eventId);
  if (deliveredEventIds.size > 10_000) {
    const oldest = deliveredEventIds.values().next().value;
    if (oldest) deliveredEventIds.delete(oldest);
  }
  return true;
};

const scheduleReconnect = () => {
  if (!started.value || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, 5_000);
  reconnectTimer.unref();
};

const closeConnection = async () => {
  const currentChannel = channel;
  const currentConnection = connection;
  channel = null;
  connection = null;
  await currentChannel?.close().catch(() => undefined);
  await currentConnection?.close().catch(() => undefined);
};

export const emitOperatingState = (payload: MerchantOperatingStateRealtimePayload) => {
  const io = getIO();
  const receivedAt = new Date().toISOString();
  const event = { ...payload, received_at: receivedAt };
  const availabilityEvent: MerchantAvailabilityRealtimePayload = {
    event_id: payload.event_id,
    event_type: payload.event_type,
    merchant_id: payload.merchant_id,
    state: payload.state,
    is_open: payload.is_open,
    state_version: payload.state_version,
    occurred_at: payload.occurred_at,
    received_at: receivedAt,
  };
  const merchantRoom = `merchant:${payload.merchant_id}`;
  io.to(merchantRoom).emit('merchant_operating_state_changed', event);
  io.to(merchantRoom).emit('merchant_operating_state_update', event);
  // Mobile clients use this only as an invalidation signal. They still
  // refetch authoritative data from the API/database.
  io.to(MERCHANT_AVAILABILITY_ROOM).emit('merchant_operating_state_changed', availabilityEvent);
  ADMIN_REALTIME_ROOMS.forEach((room) => {
    io.to(room).emit('merchant_operating_state_changed', event);
  });
};

const handleMessage = async (message: ConsumeMessage) => {
  let raw: unknown;
  try {
    raw = JSON.parse(message.content.toString('utf8'));
  } catch {
    channel?.nack(message, false, false);
    realtimeStructuredLog('warn', 'merchant_operating_state_event_rejected', { reason: 'invalid_json' });
    return;
  }

  const payload = normalizeMerchantOperatingStateEvent(raw);
  if (!payload) {
    channel?.nack(message, false, false);
    realtimeStructuredLog('warn', 'merchant_operating_state_event_rejected', { reason: 'invalid_contract' });
    return;
  }

  if (!rememberEvent(payload.event_id)) {
    channel?.ack(message);
    return;
  }

  try {
    emitOperatingState(payload);
    channel?.ack(message);
    void recordRealtimeMetric('merchant_operating_state_event_emitted', {
      has_state_version: payload.state_version !== null,
    });
  } catch (error) {
    deliveredEventIds.delete(payload.event_id);
    channel?.nack(message, false, true);
    realtimeStructuredLog('warn', 'merchant_operating_state_event_retry', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const connect = async (): Promise<void> => {
  if (!started.value || connection) return;
  const rabbitUrl = process.env.RABBITMQ_URL;
  if (!rabbitUrl) {
    realtimeStructuredLog('warn', 'merchant_operating_state_consumer_not_started', {
      reason: 'RABBITMQ_URL_missing',
    });
    scheduleReconnect();
    return;
  }

  try {
    const nextConnection = await amqp.connect(rabbitUrl);
    const nextChannel = await nextConnection.createChannel();
    await nextChannel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await nextChannel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true });
    await nextChannel.assertQueue(`${QUEUE}.dlq`, { durable: true });
    await nextChannel.bindQueue(`${QUEUE}.dlq`, DEAD_LETTER_EXCHANGE, '');
    await nextChannel.assertQueue(QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE },
    });
    await nextChannel.bindQueue(QUEUE, EXCHANGE, 'merchant.operating_state.changed');
    await nextChannel.prefetch(32);

    connection = nextConnection;
    channel = nextChannel;
    nextConnection.on('error', (error) => {
      realtimeStructuredLog('warn', 'merchant_operating_state_consumer_connection_error', { message: error.message });
    });
    nextConnection.on('close', () => {
      if (connection !== nextConnection) return;
      void closeConnection();
      scheduleReconnect();
    });

    await nextChannel.consume(QUEUE, (message) => {
      if (message) void handleMessage(message);
    }, { noAck: false });
    realtimeStructuredLog('info', 'merchant_operating_state_consumer_started', { queue: QUEUE });
  } catch (error) {
    await closeConnection();
    realtimeStructuredLog('warn', 'merchant_operating_state_consumer_connect_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    scheduleReconnect();
  }
};

export const startMerchantOperatingStateConsumer = () => {
  if (started.value) return;
  started.value = true;
  if (process.env.MERCHANT_OPERATING_STATE_CONSUMER_ENABLED === 'false') {
    realtimeStructuredLog('info', 'merchant_operating_state_consumer_disabled', {});
    return;
  }
  void connect();
};

export const stopMerchantOperatingStateConsumer = async () => {
  started.value = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  await closeConnection();
};
