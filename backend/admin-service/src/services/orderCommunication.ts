import crypto from 'crypto';
import { db } from '../db';
import { recordRealtimeMetric, realtimeStructuredLog } from './realtimeObservability';

export type CommunicationUser = {
  id: string;
  role?: string;
  full_name?: string;
};

export type ConversationAccess = {
  orderId: string;
  orderNumber: string;
  conversationId: string;
  memberType: 'customer' | 'courier' | 'recipient' | 'admin';
  conversationPhase: ConversationPhase;
  orderStatus: string;
  customerId: string | null;
  courierId: string | null;
  recipientPhoneHash: string | null;
  isGroup: boolean;
  participantCount: number;
  recipientJoined: boolean;
  currentMemberJoinedAt: string | null;
  canCallCustomer: boolean;
  canCallCourier: boolean;
  canCallRecipient: boolean;
  visibilityNotice: string | null;
};

export type ChatInsertResult = {
  chat: Record<string, any>;
  access: ConversationAccess;
  order: {
    id: string;
    order_number: string;
    customer_id: string | null;
    courier_id: string | null;
  };
  notificationTargetIds: string[];
  created: boolean;
};

export type IceServerPayload = {
  urls: string[];
  username?: string;
  credential?: string;
};

export type CallSessionPayload = {
  id: string;
  order_id: string;
  conversation_id: string;
  caller_id: string;
  target_id: string | null;
  target_type: string;
  status: string;
  call_token: string;
  expires_at: string;
  ice_servers: IceServerPayload[];
};

const MESSAGE_MAX_LENGTH = 1000;
const CLIENT_MESSAGE_ID_MAX_LENGTH = 120;
const CALL_TOKEN_BYTES = 32;
const CALL_TTL_SECONDS = 5 * 60;
const TURN_TTL_SECONDS = 10 * 60;

type ConversationPhase = 'pre_pickup' | 'delivery_group' | 'delivered' | 'closed';

const adminRoles = new Set([
  'super_admin',
  'admin',
  'manager',
  'ops_security',
  'ops_admin',
  'finance_admin',
  'cs_agent',
  'zone_manager',
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const hmacSha1Base64 = (value: string, secret: string) =>
  crypto.createHmac('sha1', secret).update(value).digest('base64');

const normalizePhoneForPrivateLookup = (value: unknown): string | null => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('8')
      ? `62${digits}`
      : digits;
  return normalized.length >= 8 && normalized.length <= 18 ? normalized : null;
};

const phoneHashSecret = () => {
  const secret = process.env.PHONE_HASH_SECRET || process.env.JWT_SECRET || process.env.JWT_REFRESH_SECRET || '';
  if (secret) return secret;
  return process.env.NODE_ENV === 'production' ? '' : 'dev-phone-hash-secret';
};

const hashPhoneForPrivateLookup = (value: unknown): string | null => {
  const phone = normalizePhoneForPrivateLookup(value);
  const secret = phoneHashSecret();
  if (!phone || !secret) return null;
  return crypto.createHmac('sha256', secret).update(phone).digest('hex');
};

const normalizeUuid = (value: unknown): string | null => {
  const text = String(value || '').trim();
  return uuidPattern.test(text) ? text : null;
};

const isAdminRole = (role?: string | null) => adminRoles.has(String(role || '').trim());

const jsonString = (value: Record<string, unknown>) => JSON.stringify(value);

const writeCommunicationAuditEvent = async (
  orderId: string,
  actorId: string,
  eventType: string,
  description: string,
  metadata: Record<string, unknown>,
) => {
  try {
    await db.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [orderId, actorId, eventType, description, jsonString(metadata)],
    );
  } catch (error) {
    realtimeStructuredLog('warn', 'communication_audit_write_failed', {
      order_id: orderId,
      event_type: eventType,
      actor_role: String(metadata.actor_type || 'unknown'),
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const sanitizeClientMessageId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[^A-Za-z0-9._:-]/g, '').slice(0, CLIENT_MESSAGE_ID_MAX_LENGTH);
  return cleaned.length >= 8 ? cleaned : null;
};

export const sanitizeMessageBody = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MESSAGE_MAX_LENGTH);
};

export const sanitizeMessageType = (value: unknown): string => {
  const normalized = String(value || 'text').trim().toLowerCase();
  return ['text', 'image', 'system'].includes(normalized) ? normalized : 'text';
};

const inferMemberType = (accessRow: any, user: CommunicationUser): ConversationAccess['memberType'] => {
  if (isAdminRole(user.role)) return 'admin';
  if (accessRow.customer_id && accessRow.customer_id === user.id) return 'customer';
  if (accessRow.courier_id && accessRow.courier_id === user.id) return 'courier';
  if (accessRow.recipient_has_access === true) return 'recipient';
  const role = String(user.role || '').toLowerCase();
  if (role.includes('courier')) return 'courier';
  if (role.includes('customer')) return 'customer';
  return 'customer';
};

const isRecipientVisibleStatus = (status: string) =>
  ['picked_up', 'in_transit', 'delivering', 'delivered', 'completed'].includes(String(status || '').toLowerCase());

const isRecipientCallableStatus = (status: string) =>
  ['picked_up', 'in_transit', 'delivering'].includes(String(status || '').toLowerCase());

const deriveConversationPhase = (orderRow: any): ConversationPhase => {
  const status = String(orderRow?.status || '').trim().toLowerCase();
  if (['cancelled', 'canceled', 'failed', 'payment_failed', 'returned'].includes(status)) {
    return 'closed';
  }
  if (['delivered', 'completed'].includes(status)) {
    return 'delivered';
  }
  if (isRecipientVisibleStatus(status) && orderRow?.recipient_name) {
    return 'delivery_group';
  }
  return 'pre_pickup';
};

const databasePhaseForConversation = (phase: ConversationPhase) =>
  phase === 'delivery_group' || phase === 'delivered'
    ? 'customer_courier_recipient'
    : 'customer_courier';

const isGroupPhase = (phase: ConversationPhase) =>
  phase === 'delivery_group' || phase === 'delivered';

const visibilityNoticeForAccess = (access: Pick<ConversationAccess, 'memberType' | 'conversationPhase'>) => {
  if (access.memberType === 'recipient' && isGroupPhase(access.conversationPhase)) {
    return 'Kamu melihat percakapan pengantaran sejak paket diambil dan sejak kamu bergabung.';
  }
  if (isGroupPhase(access.conversationPhase)) {
    return 'Percakapan ini menjadi ruang koordinasi customer, kurir, dan penerima setelah paket diambil.';
  }
  return null;
};

const buildTurnIceServers = (actorId: string): IceServerPayload[] => {
  const stunUrls = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const turnUrls = (process.env.TURN_URLS || process.env.COTURN_URLS || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const staticUsername = process.env.TURN_STATIC_USERNAME || process.env.COTURN_STATIC_USERNAME || '';
  const staticPassword = process.env.TURN_STATIC_PASSWORD || process.env.COTURN_STATIC_PASSWORD || '';
  const sharedSecret = process.env.COTURN_STATIC_AUTH_SECRET || process.env.TURN_STATIC_AUTH_SECRET || '';

  const servers: IceServerPayload[] = stunUrls.map((url) => ({ urls: [url] }));

  if (turnUrls.length === 0) return servers;

  if (sharedSecret) {
    const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
    const username = `${expiry}:${actorId.slice(0, 12)}`;
    const credential = hmacSha1Base64(username, sharedSecret);
    servers.push({ urls: turnUrls, username, credential });
    return servers;
  }

  if (staticUsername && staticPassword) {
    servers.push({ urls: turnUrls, username: staticUsername, credential: staticPassword });
  }

  return servers;
};

const getOrderAccessRow = async (orderId: string, user: CommunicationUser) => {
  const { rows } = await db.query(
    `SELECT o.id,
            o.order_number,
            o.customer_id,
            o.status,
            o.recipient_name,
            o.recipient_phone_hash,
            actor.phone_number AS actor_phone_number,
            (
              SELECT ol.courier_id
              FROM order_legs ol
              WHERE ol.order_id = o.id
                AND ol.courier_id IS NOT NULL
              ORDER BY ol.leg_number ASC
              LIMIT 1
            ) AS courier_id,
            EXISTS (
              SELECT 1
              FROM order_legs ol
              WHERE ol.order_id = o.id
                AND ol.courier_id = $2
            ) AS courier_has_access
     FROM orders o
     LEFT JOIN users actor ON actor.id = $2 AND actor.deleted_at IS NULL
     WHERE o.id = $1
     LIMIT 1`,
    [orderId, user.id]
  );

  const row = rows[0];
  if (!row) {
    const error = new Error('Order not found or access denied');
    (error as any).statusCode = 404;
    throw error;
  }

  const actorRecipientHash = hashPhoneForPrivateLookup(row.actor_phone_number);
  row.recipient_has_access = Boolean(
    row.recipient_phone_hash &&
      actorRecipientHash &&
      row.recipient_phone_hash === actorRecipientHash &&
      isRecipientVisibleStatus(row.status)
  );

  const hasAccess =
    row.customer_id === user.id ||
    row.courier_id === user.id ||
    row.courier_has_access === true ||
    row.recipient_has_access === true ||
    isAdminRole(user.role);

  if (!hasAccess) {
    void recordRealtimeMetric('communication_access_denied', {
      actor_role: user.role || 'unknown',
      order_status: row.status || 'unknown',
    });
    const error = new Error('Order not found or access denied');
    (error as any).statusCode = 404;
    throw error;
  }

  return row;
};

const ensureSystemConversationMessage = async (
  orderRow: any,
  conversationId: string,
  phase: ConversationPhase,
) => {
  if (!['delivery_group', 'delivered'].includes(phase)) return;

  const senderId = orderRow.customer_id || orderRow.courier_id;
  if (!senderId) return;

  const message = phase === 'delivery_group'
    ? 'Paket sudah diambil. Penerima dapat bergabung untuk koordinasi pengantaran.'
    : 'Paket telah diterima. Percakapan pengantaran tersimpan sebagai riwayat.';
  const clientMessageId = `system:${phase}:${orderRow.id}`;

  await db.query(
    `INSERT INTO order_chats (
        order_id,
        conversation_id,
        sender_id,
        message,
        message_type,
        client_message_id,
        sender_role_snapshot,
        metadata
     )
     VALUES ($1, $2, $3, $4, 'system', $5, 'system', $6::jsonb)
     ON CONFLICT (order_id, sender_id, client_message_id) WHERE client_message_id IS NOT NULL
     DO NOTHING`,
    [
      orderRow.id,
      conversationId,
      senderId,
      message,
      clientMessageId,
      jsonString({ source: 'conversation_phase', phase }),
    ],
  );
};

const ensureConversationForRow = async (orderRow: any) => {
  const publicPhase = deriveConversationPhase(orderRow);
  const phase = databasePhaseForConversation(publicPhase);

  const conversationResult = await db.query(
    `INSERT INTO order_conversations (order_id, phase)
     VALUES ($1, $2)
     ON CONFLICT (order_id)
     DO UPDATE SET phase = EXCLUDED.phase, updated_at = NOW()
     RETURNING id, order_id, phase, status`,
    [orderRow.id, phase]
  );
  const conversation = conversationResult.rows[0];

  if (orderRow.customer_id) {
    await db.query(
      `INSERT INTO order_conversation_members (
          conversation_id, order_id, member_type, member_id, display_name, metadata
       )
       VALUES ($1, $2, 'customer', $3, 'Customer', $4::jsonb)
       ON CONFLICT (order_id, member_type, member_id) WHERE member_id IS NOT NULL
       DO UPDATE SET revoked_at = NULL, metadata = order_conversation_members.metadata || EXCLUDED.metadata`,
      [conversation.id, orderRow.id, orderRow.customer_id, jsonString({ source: 'order.customer_id' })]
    );
  }

  if (orderRow.courier_id) {
    await db.query(
      `INSERT INTO order_conversation_members (
          conversation_id, order_id, member_type, member_id, display_name, metadata
       )
       VALUES ($1, $2, 'courier', $3, 'Kurir', $4::jsonb)
       ON CONFLICT (order_id, member_type, member_id) WHERE member_id IS NOT NULL
       DO UPDATE SET revoked_at = NULL, metadata = order_conversation_members.metadata || EXCLUDED.metadata`,
      [conversation.id, orderRow.id, orderRow.courier_id, jsonString({ source: 'order_legs.courier_id' })]
    );
  }

  if (isGroupPhase(publicPhase)) {
    await db.query(
      `INSERT INTO order_conversation_members (
          conversation_id, order_id, member_type, member_id, display_name, metadata
       )
       SELECT $1, $2, 'recipient', NULL, $3, $4::jsonb
       WHERE NOT EXISTS (
         SELECT 1
         FROM order_conversation_members
         WHERE order_id = $2
           AND member_type = 'recipient'
           AND member_id IS NULL
       )`,
      [
        conversation.id,
        orderRow.id,
        String(orderRow.recipient_name || 'Penerima').slice(0, 160),
        jsonString({ source: 'order.recipient_name', app_surface: 'paket_masuk' }),
      ]
    );
  }

  await ensureSystemConversationMessage(orderRow, conversation.id, publicPhase);

  return {
    ...conversation,
    public_phase: publicPhase,
  };
};

const ensureAuthenticatedRecipientMember = async (
  access: ConversationAccess,
  user: CommunicationUser,
) => {
  if (access.memberType !== 'recipient') return;

  await db.query(
    `INSERT INTO order_conversation_members (
        conversation_id, order_id, member_type, member_id, display_name, metadata
     )
     VALUES ($1, $2, 'recipient', $3, $4, $5::jsonb)
     ON CONFLICT (order_id, member_type, member_id) WHERE member_id IS NOT NULL
     DO UPDATE SET revoked_at = NULL,
                   display_name = EXCLUDED.display_name,
                   metadata = order_conversation_members.metadata || EXCLUDED.metadata`,
    [
      access.conversationId,
      access.orderId,
      user.id,
      String(user.full_name || 'Penerima').slice(0, 160),
      jsonString({ source: 'recipient_phone_hash', app_surface: 'customer_mobile' }),
    ],
  );
};

const getConversationMemberContext = async (
  orderId: string,
  memberType: ConversationAccess['memberType'],
  userId: string,
) => {
  const { rows } = await db.query(
    `SELECT
        COUNT(*) FILTER (WHERE revoked_at IS NULL AND member_id IS NOT NULL)::int AS participant_count,
        COALESCE(
          BOOL_OR(member_type = 'recipient' AND revoked_at IS NULL),
          false
        ) AS recipient_joined,
        (
          SELECT m.joined_at
          FROM order_conversation_members m
          WHERE m.order_id = $1
            AND m.member_type = $2
            AND m.member_id = $3
            AND m.revoked_at IS NULL
          ORDER BY m.joined_at ASC
          LIMIT 1
        ) AS current_member_joined_at
     FROM order_conversation_members
     WHERE order_id = $1`,
    [orderId, memberType, userId],
  );

  const row = rows[0] || {};
  return {
    participantCount: Number(row.participant_count || 0),
    recipientJoined: row.recipient_joined === true,
    currentMemberJoinedAt: row.current_member_joined_at
      ? new Date(row.current_member_joined_at).toISOString()
      : null,
  };
};

const findRecipientUserIdByPhoneHash = async (
  recipientPhoneHash: string | null,
  callerId: string,
): Promise<string | null> => {
  if (!recipientPhoneHash) return null;

  const indexedResult = await db.query(
    `SELECT id
     FROM users
     WHERE phone_number_hash = $1
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [recipientPhoneHash],
  );
  const indexedId = indexedResult.rows[0]?.id;
  if (indexedId && indexedId !== callerId) return indexedId;

  const fallbackResult = await db.query(
    `SELECT id, phone_number
     FROM users
     WHERE phone_number IS NOT NULL
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 5000`,
  );

  for (const row of fallbackResult.rows) {
    if (row.id === callerId) continue;
    if (hashPhoneForPrivateLookup(row.phone_number) === recipientPhoneHash) {
      await db.query(
        `UPDATE users
         SET phone_number_hash = $2
         WHERE id = $1
           AND (phone_number_hash IS NULL OR phone_number_hash <> $2)`,
        [row.id, recipientPhoneHash],
      );
      return row.id;
    }
  }

  void recordRealtimeMetric('communication_recipient_target_unresolved', {
    lookup: 'phone_hash',
  });
  return null;
};

export const getConversationAccess = async (
  orderIdValue: unknown,
  user: CommunicationUser,
): Promise<ConversationAccess> => {
  const orderId = normalizeUuid(orderIdValue);
  if (!orderId || !normalizeUuid(user.id)) {
    const error = new Error('Invalid order or user');
    (error as any).statusCode = 400;
    throw error;
  }

  const orderRow = await getOrderAccessRow(orderId, user);
  const conversation = await ensureConversationForRow(orderRow);
  const memberType = inferMemberType(orderRow, user);
  const conversationPhase = (conversation.public_phase || deriveConversationPhase(orderRow)) as ConversationPhase;

  const access: ConversationAccess = {
    orderId: orderRow.id,
    orderNumber: orderRow.order_number,
    conversationId: conversation.id,
    memberType,
    conversationPhase,
    orderStatus: orderRow.status,
    customerId: orderRow.customer_id || null,
    courierId: orderRow.courier_id || null,
    recipientPhoneHash: orderRow.recipient_phone_hash || null,
    isGroup: isGroupPhase(conversationPhase),
    participantCount: 0,
    recipientJoined: false,
    currentMemberJoinedAt: null,
    canCallCustomer: Boolean(orderRow.customer_id && memberType !== 'customer'),
    canCallCourier: Boolean(orderRow.courier_id && memberType !== 'courier'),
    canCallRecipient: isRecipientCallableStatus(orderRow.status),
    visibilityNotice: null,
  };

  await ensureAuthenticatedRecipientMember(access, user);
  const memberContext = await getConversationMemberContext(access.orderId, memberType, user.id);
  return {
    ...access,
    ...memberContext,
    visibilityNotice: visibilityNoticeForAccess(access),
  };
};

export const listConversationChats = async (orderId: string, user: CommunicationUser) => {
  const access = await getConversationAccess(orderId, user);
  const shouldRestrictRecipientHistory = access.memberType === 'recipient';
  const { rows } = await db.query(
    `SELECT c.id,
            c.order_id,
            c.sender_id,
            u.full_name AS sender_name,
            COALESCE(c.sender_role_snapshot, u.role) AS sender_role,
            c.message,
            c.message_type,
            c.client_message_id,
            c.created_at,
            c.metadata
     FROM order_chats c
     JOIN users u ON c.sender_id = u.id
     WHERE c.order_id = $1
       AND (
         $2::boolean = false
         OR c.sender_id = $4
         OR c.message_type = 'system'
         OR (
           $3::timestamptz IS NOT NULL
           AND c.created_at >= $3::timestamptz
         )
       )
     ORDER BY c.created_at ASC`,
    [access.orderId, shouldRestrictRecipientHistory, access.currentMemberJoinedAt, user.id]
  );

  const receipts = await db.query(
    `SELECT member_type, member_id, last_message_id, read_at
     FROM order_chat_read_receipts
     WHERE order_id = $1
     ORDER BY read_at DESC`,
    [access.orderId]
  );

  return {
    access,
    chats: rows,
    read_receipts: receipts.rows,
  };
};

export const sendConversationChat = async (
  orderId: string,
  user: CommunicationUser,
  body: { message?: unknown; message_type?: unknown; client_message_id?: unknown },
): Promise<ChatInsertResult> => {
  const access = await getConversationAccess(orderId, user);
  const message = sanitizeMessageBody(body.message);
  const requestedMessageType = sanitizeMessageType(body.message_type);
  const messageType = requestedMessageType === 'system' ? 'text' : requestedMessageType;
  const clientMessageId = sanitizeClientMessageId(body.client_message_id);

  if (!message) {
    const error = new Error('Message is required');
    (error as any).statusCode = 400;
    throw error;
  }

  if (!clientMessageId) {
    void recordRealtimeMetric('communication_message_rejected', {
      actor_type: access.memberType,
      reason: 'missing_client_message_id',
    });
    const error = new Error('client_message_id is required');
    (error as any).statusCode = 400;
    throw error;
  }

  const existing = await db.query(
        `SELECT c.*, u.full_name AS sender_name, COALESCE(c.sender_role_snapshot, u.role) AS sender_role
         FROM order_chats c
         JOIN users u ON u.id = c.sender_id
         WHERE c.order_id = $1
           AND c.sender_id = $2
           AND c.client_message_id = $3
         LIMIT 1`,
        [access.orderId, user.id, clientMessageId]
      );

  if (existing.rows.length > 0) {
    void recordRealtimeMetric('communication_message_idempotent_hit', {
      actor_type: access.memberType,
      message_type: existing.rows[0].message_type || 'unknown',
    });
    return {
      chat: existing.rows[0],
      access,
      created: false,
      notificationTargetIds: [],
      order: {
        id: access.orderId,
        order_number: access.orderNumber,
        customer_id: access.customerId,
        courier_id: access.courierId,
      },
    };
  }

  const { rows } = await db.query(
    `INSERT INTO order_chats (
        order_id,
        conversation_id,
        sender_id,
        message,
        message_type,
        client_message_id,
        sender_role_snapshot,
        metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING *`,
    [
      access.orderId,
      access.conversationId,
      user.id,
      message,
      messageType,
      clientMessageId,
      access.memberType,
      jsonString({ source: 'mobile_conversation' }),
    ]
  );

  const chat = {
    ...rows[0],
    sender_name: user.full_name || 'User',
    sender_role: access.memberType,
    order_number: access.orderNumber,
  };

  const notificationTargets = await db.query(
    `SELECT DISTINCT member_id
     FROM order_conversation_members
     WHERE order_id = $1
       AND member_id IS NOT NULL
       AND member_id <> $2
       AND revoked_at IS NULL`,
    [access.orderId, user.id],
  );

  void recordRealtimeMetric('communication_message_sent', {
    actor_type: access.memberType,
    message_type: messageType,
    order_status: access.orderStatus || 'unknown',
  });
  await writeCommunicationAuditEvent(
    access.orderId,
    user.id,
    'communication_message_sent',
    'In-app message sent',
    {
      conversation_id: access.conversationId,
      actor_type: access.memberType,
      message_type: messageType,
      client_message_id: clientMessageId,
    },
  );

  return {
    chat,
    access,
    created: true,
    order: {
      id: access.orderId,
      order_number: access.orderNumber,
      customer_id: access.customerId,
      courier_id: access.courierId,
    },
    notificationTargetIds: notificationTargets.rows
      .map((row) => row.member_id)
      .filter(Boolean),
  };
};

export const markConversationRead = async (
  orderId: string,
  user: CommunicationUser,
  lastMessageIdValue: unknown,
) => {
  const access = await getConversationAccess(orderId, user);
  const lastMessageId = normalizeUuid(lastMessageIdValue);

  if (lastMessageId) {
    const messageCheck = await db.query(
      `SELECT id FROM order_chats WHERE id = $1 AND order_id = $2 LIMIT 1`,
      [lastMessageId, access.orderId]
    );
    if (messageCheck.rows.length === 0) {
      const error = new Error('Message not found');
      (error as any).statusCode = 404;
      throw error;
    }
  }

  const { rows } = await db.query(
    `INSERT INTO order_chat_read_receipts (
        order_id, conversation_id, member_id, member_type, last_message_id, read_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (order_id, member_type, member_id) WHERE member_id IS NOT NULL
     DO UPDATE SET last_message_id = EXCLUDED.last_message_id,
                   read_at = NOW(),
                   updated_at = NOW()
     RETURNING member_type, member_id, last_message_id, read_at`,
    [access.orderId, access.conversationId, user.id, access.memberType, lastMessageId]
  );

  await db.query(
    `UPDATE order_conversation_members
     SET last_read_message_id = $4,
         last_read_at = NOW()
     WHERE order_id = $1
       AND member_type = $2
       AND member_id = $3`,
    [access.orderId, access.memberType, user.id, lastMessageId]
  );

  void recordRealtimeMetric('communication_message_read', {
    actor_type: access.memberType,
    has_last_message: Boolean(lastMessageId),
  });
  await writeCommunicationAuditEvent(
    access.orderId,
    user.id,
    'communication_message_read',
    'In-app conversation marked as read',
    {
      conversation_id: access.conversationId,
      actor_type: access.memberType,
      has_last_message: Boolean(lastMessageId),
    },
  );

  return { access, receipt: rows[0] };
};

const resolveCallTarget = (access: ConversationAccess, callerType: ConversationAccess['memberType'], rawTarget: unknown) => {
  const requested = String(rawTarget || '').trim().toLowerCase();
  const fallbackTarget = callerType === 'courier' ? 'customer' : 'courier';
  const targetType = ['customer', 'courier', 'recipient'].includes(requested) ? requested : fallbackTarget;

  if (targetType === 'customer') {
    if (!access.customerId || callerType === 'customer') {
      void recordRealtimeMetric('communication_wrong_target_prevented', {
        caller_type: callerType,
        target_type: targetType,
        order_status: access.orderStatus || 'unknown',
      });
      const error = new Error('Customer call target is not available');
      (error as any).statusCode = 409;
      throw error;
    }
    return { targetType, targetId: access.customerId };
  }

  if (targetType === 'courier') {
    if (!access.courierId || callerType === 'courier') {
      void recordRealtimeMetric('communication_wrong_target_prevented', {
        caller_type: callerType,
        target_type: targetType,
        order_status: access.orderStatus || 'unknown',
      });
      const error = new Error('Courier call target is not available');
      (error as any).statusCode = 409;
      throw error;
    }
    return { targetType, targetId: access.courierId };
  }

  if (!access.canCallRecipient) {
    void recordRealtimeMetric('communication_wrong_target_prevented', {
      caller_type: callerType,
      target_type: targetType,
      order_status: access.orderStatus || 'unknown',
    });
    const error = new Error('Recipient call target is not active for this order');
    (error as any).statusCode = 409;
    throw error;
  }

  return { targetType, targetId: null };
};

export const createOrderCallSession = async (
  orderId: string,
  user: CommunicationUser,
  targetTypeValue: unknown,
): Promise<{ access: ConversationAccess; call: CallSessionPayload }> => {
  const access = await getConversationAccess(orderId, user);
  const target = resolveCallTarget(access, access.memberType, targetTypeValue);
  const targetId = target.targetType === 'recipient'
    ? await findRecipientUserIdByPhoneHash(access.recipientPhoneHash, user.id)
    : target.targetId;
  const rawToken = crypto.randomBytes(CALL_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + CALL_TTL_SECONDS * 1000);
  const iceServers = buildTurnIceServers(user.id);

  const { rows } = await db.query(
    `INSERT INTO order_call_sessions (
        conversation_id,
        order_id,
        caller_id,
        target_id,
        target_type,
        status,
        join_token_hash,
        ice_servers,
        expires_at,
        metadata
     )
     VALUES ($1, $2, $3, $4, $5, 'ringing', $6, $7::jsonb, $8, $9::jsonb)
     RETURNING id, order_id, conversation_id, caller_id, target_id, target_type, status, expires_at, ice_servers`,
    [
      access.conversationId,
      access.orderId,
      user.id,
      targetId,
      target.targetType,
      sha256(rawToken),
      JSON.stringify(iceServers),
      expiresAt,
      jsonString({ caller_type: access.memberType, signaling: 'socket_io' }),
    ]
  );

  void recordRealtimeMetric('communication_call_started', {
    caller_type: access.memberType,
    target_type: target.targetType,
    has_direct_target: Boolean(targetId),
    order_status: access.orderStatus || 'unknown',
  });
  await writeCommunicationAuditEvent(
    access.orderId,
    user.id,
    'communication_call_started',
    'In-app voice call started',
    {
      conversation_id: access.conversationId,
      caller_type: access.memberType,
      target_type: target.targetType,
      has_direct_target: Boolean(targetId),
      ttl_seconds: CALL_TTL_SECONDS,
    },
  );

  return {
    access,
    call: {
      ...rows[0],
      call_token: rawToken,
      ice_servers: rows[0].ice_servers || iceServers,
    },
  };
};

export const joinOrderCallSession = async (
  orderId: string,
  callIdValue: unknown,
  user: CommunicationUser,
  tokenValue: unknown,
) => {
  const access = await getConversationAccess(orderId, user);
  const callId = normalizeUuid(callIdValue);
  const token = typeof tokenValue === 'string' ? tokenValue.trim() : '';
  if (!callId || token.length < 32) {
    const error = new Error('Invalid call token');
    (error as any).statusCode = 400;
    throw error;
  }

  const { rows } = await db.query(
    `SELECT id, order_id, conversation_id, caller_id, target_id, target_type, status, expires_at, ice_servers
     FROM order_call_sessions
     WHERE id = $1
       AND order_id = $2
       AND join_token_hash = $3
       AND expires_at > NOW()
       AND status IN ('ringing', 'accepted')
     LIMIT 1`,
    [callId, access.orderId, sha256(token)]
  );

  const call = rows[0];
  if (!call) {
    const error = new Error('Call session not found or expired');
    (error as any).statusCode = 404;
    throw error;
  }

  const isParticipant =
    call.caller_id === user.id ||
    call.target_id === user.id ||
    isAdminRole(user.role);

  if (!isParticipant && call.target_type !== 'recipient') {
    const error = new Error('Call access denied');
    (error as any).statusCode = 403;
    throw error;
  }

  const status = call.status === 'ringing' && call.caller_id !== user.id ? 'accepted' : call.status;
  if (status !== call.status) {
    await db.query(
      `UPDATE order_call_sessions
       SET status = 'accepted', answered_at = COALESCE(answered_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [call.id]
    );
    void recordRealtimeMetric('communication_call_accepted', {
      actor_type: access.memberType,
      target_type: call.target_type || 'unknown',
    });
    await writeCommunicationAuditEvent(
      access.orderId,
      user.id,
      'communication_call_accepted',
      'In-app voice call accepted',
      {
        conversation_id: access.conversationId,
        call_id: call.id,
        actor_type: access.memberType,
        target_type: call.target_type || 'unknown',
      },
    );
  }

  return {
    access,
    call: {
      ...call,
      status,
      ice_servers: call.ice_servers || buildTurnIceServers(user.id),
    },
  };
};

export const endOrderCallSession = async (
  orderId: string,
  callIdValue: unknown,
  user: CommunicationUser,
  statusValue: unknown,
) => {
  const access = await getConversationAccess(orderId, user);
  const callId = normalizeUuid(callIdValue);
  if (!callId) {
    const error = new Error('Invalid call session');
    (error as any).statusCode = 400;
    throw error;
  }

  const normalizedStatus = String(statusValue || 'ended').trim().toLowerCase();
  const finalStatus = ['rejected', 'missed', 'ended', 'failed'].includes(normalizedStatus)
    ? normalizedStatus
    : 'ended';

  const { rows } = await db.query(
    `UPDATE order_call_sessions
     SET status = $4,
         ended_by = $3,
         ended_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND order_id = $2
       AND status IN ('ringing', 'accepted')
       AND (
         caller_id = $3
         OR target_id = $3
         OR ($6::boolean = true AND target_type = 'recipient')
         OR $5::boolean = true
       )
     RETURNING id, order_id, conversation_id, caller_id, target_id, target_type, status, ended_at`,
    [callId, access.orderId, user.id, finalStatus, isAdminRole(user.role), access.memberType === 'recipient']
  );

  if (rows.length === 0) {
    const error = new Error('Call session not found or already closed');
    (error as any).statusCode = 404;
    throw error;
  }

  void recordRealtimeMetric('communication_call_closed', {
    actor_type: access.memberType,
    status: rows[0].status || finalStatus,
  });
  await writeCommunicationAuditEvent(
    access.orderId,
    user.id,
    'communication_call_closed',
    'In-app voice call closed',
    {
      conversation_id: access.conversationId,
      call_id: rows[0].id,
      actor_type: access.memberType,
      status: rows[0].status || finalStatus,
    },
  );

  return { access, call: rows[0] };
};

export const authorizeCallSocketRoom = async (
  orderId: unknown,
  callId: unknown,
  user: CommunicationUser,
) => {
  const access = await getConversationAccess(orderId, user);
  const normalizedCallId = normalizeUuid(callId);
  if (!normalizedCallId) {
    const error = new Error('Invalid call session');
    (error as any).statusCode = 400;
    throw error;
  }

  const { rows } = await db.query(
    `SELECT id, caller_id, target_id, target_type, status
     FROM order_call_sessions
     WHERE id = $1
       AND order_id = $2
       AND expires_at > NOW()
       AND status IN ('ringing', 'accepted')
     LIMIT 1`,
    [normalizedCallId, access.orderId]
  );

  const call = rows[0];
  if (!call) {
    const error = new Error('Call session not found or expired');
    (error as any).statusCode = 404;
    throw error;
  }

  const allowed =
    call.caller_id === user.id ||
    call.target_id === user.id ||
    isAdminRole(user.role);

  if (!allowed && call.target_type !== 'recipient') {
    const error = new Error('Call access denied');
    (error as any).statusCode = 403;
    throw error;
  }

  return { access, room: `call:${normalizedCallId}`, call };
};

export const revokeReceiverLocationInvite = async (
  requestIdValue: unknown,
  user: CommunicationUser,
) => {
  const requestId = normalizeUuid(requestIdValue);
  if (!requestId) {
    const error = new Error('Invalid location request');
    (error as any).statusCode = 400;
    throw error;
  }

  const { rows } = await db.query(
    `UPDATE customer_receiver_location_requests
     SET status = 'revoked',
         updated_at = NOW()
     WHERE id = $1
       AND customer_id = $2
       AND status = 'pending'
     RETURNING id, status, updated_at`,
    [requestId, user.id]
  );

  if (rows.length === 0) {
    const error = new Error('Request lokasi tidak ditemukan atau tidak bisa dibatalkan.');
    (error as any).statusCode = 404;
    throw error;
  }

  return rows[0];
};

export const errorStatusCode = (error: unknown, fallback = 500): number => {
  const statusCode = Number((error as any)?.statusCode || fallback);
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : fallback;
};
