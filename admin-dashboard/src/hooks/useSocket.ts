import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { socketService } from '../lib/socket'
import { clientLog } from '../lib/clientLogger'
import { useAuthStore } from '../store/useAuthStore'

export const useSocket = () => {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  useEffect(() => {
    if (user?.id) {
      socketService.connect(user.id, user.role)
    }

    // Global listeners for real-time invalidation
    socketService.on('order_update', (data) => {
      clientLog.debug('WebSocket order update received', { hasOrderUpdate: Boolean(data) })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    })

    socketService.on('courier_update', (data) => {
      clientLog.debug('WebSocket courier update received', { hasCourierUpdate: Boolean(data) })
      queryClient.invalidateQueries({ queryKey: ['couriers'] })
    })

    socketService.on('new_dispute', () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
    })

    return () => {
      // We keep the connection alive for the dashboard lifecycle
      // but we could disconnect on unmount if needed
    }
  }, [queryClient, user?.id, user?.role])

  return socketService
}
