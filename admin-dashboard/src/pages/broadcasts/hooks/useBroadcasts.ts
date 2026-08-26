import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { toast } from 'sonner'

export type BroadcastStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'cancelled'
  | 'failed'

export type BroadcastTargetType = 'all' | 'online' | 'filter' | 'manual'

export interface BroadcastTargetFilter {
  zone_ids?: string[]
  roles?: string[]
  capabilities?: string[]
  account_status?: string
  user_ids?: string[]
}

export interface BroadcastPayload {
  title: string
  body: string
  image_url?: string | null
  deep_link?: string | null
  category: string
  priority: string
  channels: string[]
  target_type: BroadcastTargetType
  target_filter?: BroadcastTargetFilter | null
  status?: 'draft' | 'scheduled'
  scheduled_at?: string | null
}

export interface BroadcastRow {
  id: string
  title: string
  body: string
  image_url?: string | null
  deep_link?: string | null
  category: string
  priority: string
  channels?: string[] | null
  target_type: BroadcastTargetType
  target_filter?: BroadcastTargetFilter | null
  status: BroadcastStatus
  scheduled_at: string | null
  sent_at: string | null
  total_targets: number
  sent_count: number
  failed_count: number
  opened_count: number
  created_by_name?: string | null
  created_at: string
}

export const broadcastErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback

interface BroadcastListResponse {
  success: boolean
  data: BroadcastRow[]
  total: number
}

export function useBroadcasts({ status, page, limit = 20 }: { status: string; page: number; limit?: number }) {
  return useQuery({
    queryKey: ['broadcasts', status, page],
    queryFn: async () => {
      const res = await api.get<BroadcastListResponse>('/admin/broadcasts', {
        params: {
          status: status !== 'all' ? status : undefined,
          page,
          limit,
        },
      })
      return res.data
    },
  })
}

/** Create draft / scheduled broadcast. sendNow=true triggers immediate dispatch (backend 202). */
export function useCreateBroadcast(options?: { onSuccessCreate?: (row: any) => void }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { payload: BroadcastPayload; sendNow: boolean }) => {
      const { payload, sendNow } = vars
      const body: Record<string, unknown> = { ...payload }
      if (sendNow) body.send_now = true
      const res = await api.post('/admin/broadcasts', body)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] })
      toast.success('Broadcast disimpan')
    },
    onError: (error: any) => {
      toast.error(broadcastErrorMessage(error, 'Gagal menyimpan broadcast'))
    },
  })
}

export function useCancelBroadcast() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/admin/broadcasts/${id}`, { status: 'cancelled' })
      return res.data
    },
    // Optimistic: flip row status immediately while request is in flight.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['broadcasts'] })
      const snapshots = queryClient.getQueriesData<{ data: BroadcastRow[] }>({
        queryKey: ['broadcasts'],
      })
      for (const [key, value] of snapshots) {
        if (!value) continue
        queryClient.setQueryData(key, {
          ...value,
          data: value.data.map((row) =>
            row.id === id ? { ...row, status: 'cancelled' as BroadcastStatus } : row,
          ),
        })
      }
      return { snapshots }
    },
    onError: (error: any, _id, context) => {
      context?.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value))
      toast.error(broadcastErrorMessage(error, 'Gagal membatalkan broadcast'))
    },
    onSuccess: () => {
      toast.success('Broadcast dibatalkan')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] })
    },
  })
}

export function useSendBroadcast() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/broadcasts/${id}/send`)
      return res.data
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['broadcasts'] })
      const snapshots = queryClient.getQueriesData<{ data: BroadcastRow[] }>({
        queryKey: ['broadcasts'],
      })
      for (const [key, value] of snapshots) {
        if (!value) continue
        queryClient.setQueryData(key, {
          ...value,
          data: value.data.map((row) =>
            row.id === id ? { ...row, status: 'sending' as BroadcastStatus } : row,
          ),
        })
      }
      return { snapshots }
    },
    onError: (error: any, _id, context) => {
      context?.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value))
      toast.error(broadcastErrorMessage(error, 'Gagal mengirim broadcast'))
    },
    onSuccess: () => {
      toast.success('Broadcast masuk proses pengiriman')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] })
    },
  })
}
