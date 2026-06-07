import {
  createOrderCallSession,
  getConversationAccess,
  listConversationChats,
  sendConversationChat,
} from './orderCommunication';
import crypto from 'crypto';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
}));

jest.mock('./realtimeObservability', () => ({
  recordRealtimeMetric: jest.fn().mockResolvedValue(undefined),
  realtimeStructuredLog: jest.fn(),
}));

describe('orderCommunication', () => {
  const { db } = jest.requireMock('../db');
  const orderId = '11111111-1111-4111-8111-111111111111';
  const customerId = '22222222-2222-4222-8222-222222222222';
  const courierId = '33333333-3333-4333-8333-333333333333';
  const conversationId = '44444444-4444-4444-8444-444444444444';
  const callId = '55555555-5555-4555-8555-555555555555';
  const recipientId = '66666666-6666-4666-8666-666666666666';

  const orderRow: any = {
    id: orderId,
    order_number: 'TMB-UNIT-1',
    customer_id: customerId,
    courier_id: courierId,
    courier_has_access: false,
    status: 'accepted',
    recipient_name: 'Penerima',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STUN_URLS;
    delete process.env.TURN_URLS;
    delete process.env.COTURN_URLS;
    delete process.env.COTURN_STATIC_AUTH_SECRET;
    delete process.env.TURN_STATIC_AUTH_SECRET;
    delete process.env.TURN_STATIC_USERNAME;
    delete process.env.TURN_STATIC_PASSWORD;
  });

  const mockConversationBootstrap = (row = orderRow) => {
    const isGroup = ['picked_up', 'in_transit', 'delivering', 'delivered', 'completed'].includes(String(row.status).toLowerCase()) && row.recipient_name;
    db.query
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          order_id: orderId,
          phase: isGroup ? 'customer_courier_recipient' : 'customer_courier',
          status: 'active'
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    if (isGroup) {
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });
    }
    db.query.mockResolvedValueOnce({
      rows: [{
        participant_count: isGroup ? 2 : 2,
        recipient_joined: isGroup,
        current_member_joined_at: null,
      }],
    });
  };

  it('rejects message send without client_message_id', async () => {
    mockConversationBootstrap();

    await expect(sendConversationChat(
      orderId,
      { id: customerId, role: 'customer', full_name: 'Customer' },
      { message: 'Halo kurir', message_type: 'text' },
    )).rejects.toMatchObject({ message: 'client_message_id is required', statusCode: 400 });

    expect(db.query).toHaveBeenCalledTimes(5);
  });

  it('keeps one conversation per order and exposes delivery group context after pickup', async () => {
    mockConversationBootstrap({
      ...orderRow,
      status: 'picked_up',
      recipient_phone_hash: 'recipient-phone-hash',
    });

    const access = await getConversationAccess(
      orderId,
      { id: courierId, role: 'courier', full_name: 'Kurir' },
    );

    const conversationUpsert = db.query.mock.calls.find(([query]: [string]) =>
      query.includes('INSERT INTO order_conversations'),
    );
    const systemMessageInsert = db.query.mock.calls.find(([query]: [string]) =>
      query.includes('INSERT INTO order_chats') && query.includes("'system'"),
    );

    expect(conversationUpsert).toBeTruthy();
    expect(conversationUpsert[1][0]).toBe(orderId);
    expect(conversationUpsert[1][1]).toBe('customer_courier_recipient');
    expect(access.conversationId).toBe(conversationId);
    expect(access.conversationPhase).toBe('delivery_group');
    expect(access.isGroup).toBe(true);
    expect(access.visibilityNotice).toContain('ruang koordinasi');
    expect(systemMessageInsert).toBeTruthy();
    expect(systemMessageInsert[1][4]).toBe(`system:delivery_group:${orderId}`);
  });

  it('restricts recipient chat history to system messages and messages after join', async () => {
    process.env.PHONE_HASH_SECRET = 'unit-test-phone-secret';
    const joinedAt = '2026-06-06T10:00:00.000Z';
    const recipientPhoneHash = crypto
      .createHmac('sha256', process.env.PHONE_HASH_SECRET)
      .update('6281234567890')
      .digest('hex');

    db.query
      .mockResolvedValueOnce({
        rows: [{
          ...orderRow,
          status: 'picked_up',
          recipient_phone_hash: recipientPhoneHash,
          actor_phone_number: '081234567890',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: conversationId, order_id: orderId, phase: 'customer_courier_recipient', status: 'active' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          participant_count: 3,
          recipient_joined: true,
          current_member_joined_at: joinedAt,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await listConversationChats(
      orderId,
      { id: recipientId, role: 'customer', full_name: 'Penerima' },
    );

    const chatListCall = db.query.mock.calls.find(([query]: [string]) =>
      query.includes('FROM order_chats c') && query.includes("c.message_type = 'system'"),
    );
    expect(chatListCall).toBeTruthy();
    expect(chatListCall[1]).toEqual([orderId, true, joinedAt, recipientId]);
  });

  it('stores only a hashed call token and returns short-lived TURN credentials', async () => {
    process.env.STUN_URLS = 'stun:stun.example.test:3478';
    process.env.TURN_URLS = 'turns:turn.example.test:5349';
    process.env.COTURN_STATIC_AUTH_SECRET = 'unit-test-turn-secret';
    mockConversationBootstrap();
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: callId,
          order_id: orderId,
          conversation_id: conversationId,
          caller_id: customerId,
          target_id: courierId,
          target_type: 'courier',
          status: 'ringing',
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          ice_servers: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const before = Date.now();
    const result = await createOrderCallSession(
      orderId,
      { id: customerId, role: 'customer', full_name: 'Customer' },
      'courier',
    );

    const callInsert = db.query.mock.calls.find(([query]: [string]) =>
      query.includes('INSERT INTO order_call_sessions'),
    );
    expect(callInsert).toBeTruthy();
    const callParams = callInsert[1];
    expect(callParams[5]).toHaveLength(64);
    expect(callParams[5]).not.toBe(result.call.call_token);
    expect(new Date(callParams[7]).getTime()).toBeGreaterThanOrEqual(before + (5 * 60 * 1000) - 1000);
    expect(new Date(callParams[7]).getTime()).toBeLessThanOrEqual(before + (5 * 60 * 1000) + 1000);

    const iceServers = JSON.parse(callParams[6]);
    const turnServer = iceServers.find((server: any) => server.urls.includes('turns:turn.example.test:5349'));
    expect(turnServer).toBeTruthy();
    const turnExpiry = Number(String(turnServer.username).split(':')[0]);
    const expectedTurnExpiry = Math.floor(before / 1000) + (10 * 60);
    expect(turnExpiry).toBeGreaterThanOrEqual(expectedTurnExpiry - 1);
    expect(turnExpiry).toBeLessThanOrEqual(expectedTurnExpiry + 1);
  });

  it('prevents a caller from targeting their own role', async () => {
    mockConversationBootstrap();

    await expect(createOrderCallSession(
      orderId,
      { id: courierId, role: 'courier', full_name: 'Kurir' },
      'courier',
    )).rejects.toMatchObject({ message: 'Courier call target is not available', statusCode: 409 });
  });

  it('resolves recipient call target through private phone hash after pickup', async () => {
    process.env.PHONE_HASH_SECRET = 'unit-test-phone-secret';
    const recipientPhoneHash = crypto
      .createHmac('sha256', process.env.PHONE_HASH_SECRET)
      .update('6281234567890')
      .digest('hex');

    mockConversationBootstrap({
      ...orderRow,
      status: 'picked_up',
      recipient_phone_hash: recipientPhoneHash,
    });
    db.query
      .mockResolvedValueOnce({ rows: [{ id: recipientId }] })
      .mockResolvedValueOnce({
        rows: [{
          id: callId,
          order_id: orderId,
          conversation_id: conversationId,
          caller_id: courierId,
          target_id: recipientId,
          target_type: 'recipient',
          status: 'ringing',
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          ice_servers: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await createOrderCallSession(
      orderId,
      { id: courierId, role: 'courier', full_name: 'Kurir' },
      'recipient',
    );

    const callInsert = db.query.mock.calls.find(([query]: [string]) =>
      query.includes('INSERT INTO order_call_sessions'),
    );
    expect(callInsert).toBeTruthy();
    expect(callInsert[1][3]).toBe(recipientId);
    expect(result.call.target_type).toBe('recipient');
    expect(result.call.target_id).toBe(recipientId);
  });

  it('blocks new recipient calls after delivery is already completed', async () => {
    mockConversationBootstrap({
      ...orderRow,
      status: 'delivered',
      recipient_phone_hash: 'recipient-phone-hash',
    });

    await expect(createOrderCallSession(
      orderId,
      { id: courierId, role: 'courier', full_name: 'Kurir' },
      'recipient',
    )).rejects.toMatchObject({
      message: 'Recipient call target is not active for this order',
      statusCode: 409,
    });
  });
});
