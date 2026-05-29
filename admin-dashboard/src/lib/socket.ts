import { io, Socket } from 'socket.io-client'
import { clientLog } from './clientLogger'
import { adminSocketUrl } from './runtimeConfig'

const SOCKET_URL = adminSocketUrl


class SocketService {
  private socket: Socket | null = null

  connect(userId?: string, role?: string) {
    // If socket exists, check if identity matches
    if (this.socket) {
      const currentQuery = this.socket.io.opts.query as any;
      if (currentQuery?.userId === userId && currentQuery?.role === role) {
        return;
      }
      // If identity changed, disconnect first
      clientLog.debug('WebSocket identity changed, reconnecting', { role });
      this.disconnect();
    }

    this.socket = io(SOCKET_URL, {
      query: { userId, role },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    this.socket.on('connect', () => {
      clientLog.debug('WebSocket connected', { role: role || 'unknown' })
    })

    this.socket.on('disconnect', (reason) => {
      clientLog.debug('WebSocket disconnected', { reason, role: role || 'unknown' })
    })

    this.socket.on('connect_error', (error) => {
      clientLog.error('WebSocket connection error', { error, role: role || 'unknown' })
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback)
  }

  off(event: string, callback: (...args: any[]) => void) {
    this.socket?.off(event, callback)
  }

  emit(event: string, data: any) {
    this.socket?.emit(event, data)
  }

  getSocket() {
    return this.socket
  }
}

export const socketService = new SocketService()
