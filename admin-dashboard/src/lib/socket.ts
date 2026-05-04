import { io, Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8080'


class SocketService {
  private socket: Socket | null = null

  connect() {
    if (this.socket) return

    this.socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    this.socket.on('connect', () => {
      console.log('📡 [WebSocket] Connected to server')
    })

    this.socket.on('disconnect', (reason) => {
      console.log('📡 [WebSocket] Disconnected:', reason)
    })

    this.socket.on('connect_error', (error) => {
      console.error('📡 [WebSocket] Connection Error:', error)
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
