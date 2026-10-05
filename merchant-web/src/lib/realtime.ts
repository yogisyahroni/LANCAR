import { io, type Socket } from 'socket.io-client'
import { apiBaseUrl } from './api'
import { hasWebSession } from './auth'

export type MerchantOperatingStateEvent = {
  event_id: string
  event_type: 'merchant.operating_state.changed'
  merchant_id: string
  state: string
  state_version: number | null
  updated_at: string | null
  received_at: string
}

const socketBaseUrl = () => {
  const configured = String(import.meta.env.VITE_SOCKET_URL || '').trim()
  if (configured) return configured.replace(/\/+$/, '')
  return apiBaseUrl.replace(/\/api\/v1\/?$/, '') || window.location.origin
}

/**
 * Events invalidate the dashboard only. The callback must refetch the
 * server-authoritative snapshot; event payloads are never used as state.
 */
export function subscribeToMerchantOperatingState(
  listener: (event: MerchantOperatingStateEvent) => void,
) {
  if (typeof window === 'undefined' || !hasWebSession()) return () => undefined

  let socket: Socket | null = null
  try {
    socket = io(socketBaseUrl(), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
    })
    socket.on('merchant_operating_state_changed', listener)
  } catch {
    // The dashboard's bounded polling remains the safe fallback.
  }

  return () => {
    socket?.off('merchant_operating_state_changed', listener)
    socket?.close()
  }
}

export type MerchantOrderEvent = {
  event?: string
  order_id?: string
  merchant_id?: string | null
  status?: string
  occurred_at?: string
  received_at: string
}

/**
 * Order events are invalidation signals only. Orders are always reloaded from
 * the merchant API, while the existing interval remains the reconnect/polling
 * fallback when Socket.IO is unavailable.
 */
export function subscribeToMerchantOrderEvents(
  listener: (event: MerchantOrderEvent) => void,
) {
  if (typeof window === 'undefined' || !hasWebSession()) return () => undefined

  let socket: Socket | null = null
  const seen = new Set<string>()
  const notify = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const event = payload as Omit<MerchantOrderEvent, 'received_at'>
    if (!event.order_id) return
    const key = `${event.order_id}:${event.event || event.status || 'updated'}:${event.occurred_at || ''}`
    if (seen.has(key)) return
    seen.add(key)
    if (seen.size > 128) seen.delete(seen.values().next().value as string)
    listener({ ...event, received_at: new Date().toISOString() })
  }

  try {
    socket = io(socketBaseUrl(), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
    })
    socket.on('merchant_order_update', notify)
    socket.on('order_update', notify)
    socket.on('on_demand_event', notify)
  } catch {
    // The bounded polling in the caller remains the safe fallback.
  }

  return () => {
    socket?.off('merchant_order_update', notify)
    socket?.off('order_update', notify)
    socket?.off('on_demand_event', notify)
    socket?.close()
  }
}
