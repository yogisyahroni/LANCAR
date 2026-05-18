import { getIO } from '../websocket';
import { recordRealtimeEventDelivery, recordRealtimeMetric } from './realtimeObservability';

export const ON_DEMAND_REALTIME_EVENTS = {
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
    io.to(`order:${realtimePayload.order_id}`).emit('on_demand_event', realtimePayload);
    io.to(`order:${realtimePayload.order_id}`).emit(event, realtimePayload);
    if (event === ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED) {
      io.to(`order:${realtimePayload.order_id}`).emit('order_tracking_updated', realtimePayload);
      io.to(`order:${realtimePayload.order_id}`).emit('tracking:update', realtimePayload);
    }
    if (event === ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE && realtimePayload.chat) {
      io.to(`order:${realtimePayload.order_id}`).emit('new_chat_message', realtimePayload.chat);
    }

    if (realtimePayload.customer_id) {
      io.to(String(realtimePayload.customer_id)).emit('on_demand_event', realtimePayload);
      io.to(String(realtimePayload.customer_id)).emit(event, realtimePayload);
      if (event === ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED) {
        io.to(String(realtimePayload.customer_id)).emit('order_tracking_updated', realtimePayload);
        io.to(String(realtimePayload.customer_id)).emit('tracking:update', realtimePayload);
      }
      if (event === ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE && realtimePayload.chat) {
        io.to(String(realtimePayload.customer_id)).emit('new_chat_message', realtimePayload.chat);
      }
    }

    if (realtimePayload.courier_user_id) {
      io.to(String(realtimePayload.courier_user_id)).emit('on_demand_event', realtimePayload);
      io.to(String(realtimePayload.courier_user_id)).emit(event, realtimePayload);
      if (event === ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED) {
        io.to(String(realtimePayload.courier_user_id)).emit('order_tracking_updated', realtimePayload);
        io.to(String(realtimePayload.courier_user_id)).emit('tracking:update', realtimePayload);
      }
      if (event === ON_DEMAND_REALTIME_EVENTS.CHAT_MESSAGE && realtimePayload.chat) {
        io.to(String(realtimePayload.courier_user_id)).emit('new_chat_message', realtimePayload.chat);
      }
    }
    recordRealtimeEventDelivery(event, realtimePayload);
  } catch (wsError) {
    void recordRealtimeMetric('event_emit_failed', {
      event,
      has_customer: Boolean(realtimePayload.customer_id),
      has_courier: Boolean(realtimePayload.courier_user_id),
    });
    console.warn(`[WebSocket] Could not emit on-demand event ${event}:`, wsError);
  }

  return realtimePayload;
};
