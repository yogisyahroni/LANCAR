import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { socketService } from '../lib/socket'

export const useSocket = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    socketService.connect()

    // Global listeners for real-time invalidation
    socketService.on('order_update', (data) => {
      console.log('📡 [WebSocket] Order updated:', data)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    })

    socketService.on('courier_update', (data) => {
      console.log('📡 [WebSocket] Courier updated:', data)
      queryClient.invalidateQueries({ queryKey: ['couriers'] })
    })

    socketService.on('new_dispute', () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
    })

    return () => {
      // We keep the connection alive for the dashboard lifecycle
      // but we could disconnect on unmount if needed
    }
  }, [queryClient])

  return socketService
}
