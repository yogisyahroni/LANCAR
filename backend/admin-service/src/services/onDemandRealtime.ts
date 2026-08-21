import { getIO } from '../websocket';
import { recordRealtimeEventDelivery, recordRealtimeMetric } from './realtimeObservability';

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

export const ON_DEMAND_REALTIME_EVENTS = {
  PAYMENT_CONFIRMED: 'payment_confirmed',
  PAYMENT_FAILED: 'payment_failed',
  OFFER_CREATED: 'offer_created',
  OFFER_ACCEPTED: 'offer_accepted',
  COURIER_OTW_PICKUP: 'courier_otw_pickup',
  PICKUP_VERIFIED: 'pickup_verified',
  DELIVERY_STARTED: 'delivery_started',
  POD_COMPLETED: 'pod_completed',
  PICKUP_CANCELLED: 'pickup_cancelled',
  CHAT_MESSAGE: 'chat_message',
  TRACKING_UPDATED: 'tracking_updated',
} as const;

export type OnDemandRealtimeEvent =
  typeof ON_DEMAND_REALTIME_EVENTS[keyof typeof ON_DEMAND_REALTIME_EVENTS];

export type OnDemandRealtimePayload = {
  event: OnDemandRealtimeEvent;
  order_id: string;
  status?: string;
  stage?: string;
  customer_id?: string | null;
  courier_user_id?: string | null;
  courier_profile_id?: string | null;
  merchant_id?: string | null;
  admin_broadcast?: boolean;
  order_number?: string | null;
  occurred_at?: string;
  location?: {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
    timestamp?: string;
  } | null;
  proof?: Record<string, any> | null;
  chat?: Record<string, any> | null;
  metadata?: Record<string, any>;
};

export const buildOnDemandRealtimePayload = (
  event: OnDemandRealtimeEvent,
  payload: Omit<OnDemandRealtimePayload, 'event' | 'occurred_at'> & { occurred_at?: string }
): OnDemandRealtimePayload => ({
  event,
  occurred_at: payload.occurred_at || new Date().toISOString(),
  ...payload,
});

export const emitOnDemandRealtime = (
  event: OnDemandRealtimeEvent,
  payload: Omit<OnDemandRealtimePayload, 'event' | 'occurred_at'> & { occurred_at?: string }
) => {
  const realtimePayload = buildOnDemandRealtimePayload(event, payload);

  try {
    const io = getIO();
    const emitLifecycleToRoom = (room: string) => {
      io.to(room).emit('on_demand_event', realtimePayload);
      io.to(room).emit(event, realtimePayload);
      if (event === ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED) {
        io.to(room).emit('order_tracking_updated', realtimePayload);
        io.to(room).emit('tracking:update', realtimePayload);
      }
      if (event === ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE && realtimePayload.chat) {
        io.to(room).emit('new_chat_message', realtimePayload.chat);
      }
    };

    emitLifecycleToRoom(`order:${realtimePayload.order_id}`);

    if (realtimePayload.customer_id) {
      emitLifecycleToRoom(String(realtimePayload.customer_id));
    }

    if (realtimePayload.courier_user_id) {
      emitLifecycleToRoom(String(realtimePayload.courier_user_id));
    }

    if (realtimePayload.merchant_id) {
      const merchantRoom = `merchant:${realtimePayload.merchant_id}`;
      emitLifecycleToRoom(merchantRoom);
      io.to(merchantRoom).emit('merchant_order_update', realtimePayload);
      io.to(merchantRoom).emit('order_update', realtimePayload);
    }

    if (realtimePayload.admin_broadcast) {
      ADMIN_REALTIME_ROOMS.forEach((room) => {
        io.to(room).emit('admin_order_lifecycle', realtimePayload);
        io.to(room).emit('order_update', realtimePayload);
      });
    }
    recordRealtimeEventDelivery(event, realtimePayload);
  } catch (wsError) {
    void recordRealtimeMetric('event_emit_failed', {
      event,
      has_customer: Boolean(realtimePayload.customer_id),
      has_courier: Boolean(realtimePayload.courier_user_id),
      has_merchant: Boolean(realtimePayload.merchant_id),
      admin_broadcast: Boolean(realtimePayload.admin_broadcast),
    });
    console.warn(`[WebSocket] Could not emit on-demand event ${event}:`, wsError);
  }

  return realtimePayload;
};
