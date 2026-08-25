import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';

import type { PoolClient } from 'pg';
import { db } from '../../db';

import { createNotification } from '../../notifications';
import { createSnapTransaction, getMidtransClientKey, getMidtransSnapJsUrl } from '../../midtrans';

import { isExpiredOrFailedTransaction, isSuccessfulTransaction } from '../../midtrans';
import { calculateServiceSettlement, customerFacingService, DeliveryServiceProduct, findDeliveryServiceByCode, listEnabledDeliveryServicesForCustomer } from '../deliveryServices.controller';

import { advanceOnDemandDispatchQueue, dispatchToPreferredCourier, notifyOnDemandOffers } from '../courierAuth.controller';
import { redis } from '../../redis';

import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../../services/onDemandRealtime';
import { buildOnDemandTrackingSnapshot, evaluateLocationQuality, writeLocationSafetyEvent } from '../../services/onDemandTracking';

import { evaluateOnDemandRealtimeAlerts } from '../../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot, RouteEtaSnapshot } from '../../services/mapsProviderConfig';

import { enqueueOutboxEvent } from '../../services/eventOutbox';
import {
  createOrderCallSession,
  endOrderCallSession,
  errorStatusCode,
  joinOrderCallSession,
  listConversationChats,
  markConversationRead,
  revokeReceiverLocationInvite,
  sendConversationChat,
} from '../../services/orderCommunication';

import crypto from 'crypto';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';

import { releasePromoReservation, validatePromoForCheckout } from '../../services/promoEngine';
import {
  insertWebhookAuditEvent,
  resolveRawBody,
  updateWebhookAuditEvent,
  verifyMidtransSignature,
} from '../../security/webhookSecurity';




import {
  publicConversationContext,
} from './_shared';

export const getOrderChats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, chats: [], error: 'Unauthorized' });
      return;
    }

    const result = await listConversationChats(String(req.params.id || ''), req.user);
    res.json({
      success: true,
      chats: result.chats,
      read_receipts: result.read_receipts,
      conversation: publicConversationContext(result.access),
    });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, chats: [], error: error.message });
  }
};



export const sendOrderChat = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, chat: null, error: 'Unauthorized' });
      return;
    }

    const result = await sendConversationChat(String(req.params.id || ''), req.user, req.body || {});
    const chatMessage = result.chat;
    const order = result.order;
    const notificationTargetIds = result.notificationTargetIds;

    // Emit chat message to both sender and recipient rooms for real-time UI update
    if (result.created) {
      try {
        emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE, {
          order_id: order.id,
          customer_id: order.customer_id,
          courier_user_id: order.courier_id,
          stage: 'chat',
          chat: chatMessage,
          metadata: { order_number: order.order_number },
        });
      } catch (wsError) {
        console.warn('[WebSocket] Could not emit chat message');
      }
    }

    // Create notification for recipient if they are not the sender
    if (result.created && notificationTargetIds.length > 0) {
      await Promise.all(
        notificationTargetIds.map((targetId) =>
          createNotification({
            user_id: targetId,
            title: `Pesan Baru - ${order.order_number}`,
            body: 'Ada pesan baru di percakapan order.',
            type: 'order_group_chat_message',
            category: 'message',
            priority: 'high',
            order_id: order.id,
            conversation_id: result.access.conversationId,
            metadata: {
              chat_id: chatMessage.id,
              sender_name: req.user?.full_name || 'User',
              conversation_id: result.access.conversationId,
              order_number: order.order_number
            },
            deep_link: `tembus://orders/${order.id}/chat`
          })
        )
      );
    }

    res.status(result.created ? 201 : 200).json({ success: true, chat: chatMessage, idempotent: !result.created });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, chat: null, error: error.message });
  }
};



export const markOrderChatRead = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await markConversationRead(String(req.params.id || ''), req.user, req.body?.last_message_id);
    res.json({
      success: true,
      receipt: result.receipt,
      conversation: publicConversationContext(result.access),
    });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, error: error.message });
  }
};



export const createOrderCall = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await createOrderCallSession(String(req.params.id || ''), req.user, req.body?.target_type);
    try {
      const { getIO } = await import('../../websocket');
      const io = getIO();
      const callEvent = {
        order_id: result.access.orderId,
        call_id: result.call.id,
        caller_id: req.user.id,
        caller_name: req.user.full_name || 'TEMBUS',
        target_type: result.call.target_type,
        status: result.call.status,
        expires_at: result.call.expires_at,
      };
      if (result.call.target_id) {
        io.to(String(result.call.target_id)).emit('call:incoming', {
          ...callEvent,
          call_token: result.call.call_token,
        });
      }
    } catch {
      console.warn('[WebSocket] Could not emit call incoming event');
    }

    res.status(201).json({
      success: true,
      call: result.call,
      conversation: publicConversationContext(result.access),
    });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, error: error.message });
  }
};



export const joinOrderCall = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await joinOrderCallSession(
      String(req.params.id || ''),
      String(req.params.callId || ''),
      req.user,
      req.body?.call_token
    );
    try {
      const { getIO } = await import('../../websocket');
      getIO().to(`call:${result.call.id}`).emit('call:accepted', {
        order_id: result.access.orderId,
        call_id: result.call.id,
        accepted_by: req.user.id,
        status: result.call.status,
      });
    } catch {
      console.warn('[WebSocket] Could not emit call accepted event');
    }

    res.json({
      success: true,
      call: result.call,
      conversation: publicConversationContext(result.access),
    });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, error: error.message });
  }
};



export const endOrderCall = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await endOrderCallSession(
      String(req.params.id || ''),
      String(req.params.callId || ''),
      req.user,
      req.body?.status
    );
    try {
      const { getIO } = await import('../../websocket');
      getIO().to(`call:${result.call.id}`).emit('call:ended', {
        order_id: result.access.orderId,
        call_id: result.call.id,
        ended_by: req.user.id,
        status: result.call.status,
      });
    } catch {
      console.warn('[WebSocket] Could not emit call ended event');
    }

    res.json({ success: true, call: result.call });
  } catch (error: any) {
    res.status(errorStatusCode(error)).json({ success: false, error: error.message });
  }
};


