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
