import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'

export function useDebouncedValue<T>(value: T, delay = 600): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export interface ZoneOption {
  id: string
  name: string
}

/** Fetch courier zones for the advanced filter multi-select. */
export function useZones() {
  return useQuery({
    queryKey: ['broadcast-zones'],
    queryFn: async (): Promise<ZoneOption[]> => {
      const res = await api.get('/admin/zones')
      const raw = Array.isArray(res.data) ? res.data : res.data?.data || []
      return raw.map((zone: any) => ({
        id: String(zone.id),
        name: zone.name || zone.zone_name || zone.title || zone.id,
      }))
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface CourierOption {
  id: string
  full_name: string
  phone_number?: string | null
  plate_number?: string | null
}

/** Search couriers for manual targeting (reuses the Couriers list endpoint). */
export function useCourierSearch(search: string) {
  const debounced = useDebouncedValue(search.trim(), 400)
  return useQuery({
    queryKey: ['broadcast-courier-search', debounced],
    queryFn: async (): Promise<CourierOption[]> => {
      const res = await api.get('/admin/couriers', {
        params: { search: debounced, limit: 10, page: 1 },
      })
      const rows = res.data?.data || []
      return rows.map((row: any) => ({
        id: row.id,
        full_name: row.full_name,
        phone_number: row.phone_number ?? null,
        plate_number: row.plate_number ?? null,
      }))
    },
    enabled: debounced.length >= 2,
  })
}

export interface TargetFilterDraft {
  zone_ids: string[]
  roles: string[]
  capabilities: string[]
  account_status: string
}

/** Build the JSON-encoded target_filter payload accepted by the estimate/create endpoints. */
export function buildTargetFilterPayload(
  targetType: 'all' | 'online' | 'filter' | 'manual',
  filter: TargetFilterDraft,
  manualUserIds: string[],
): Record<string, unknown> | null {
  if (targetType === 'manual') {
    return manualUserIds.length > 0 ? { user_ids: manualUserIds } : null
  }
  if (targetType !== 'filter') return null

  const payload: Record<string, unknown> = {}
  if (filter.zone_ids.length > 0) payload.zone_ids = filter.zone_ids
  if (filter.roles.length > 0) payload.roles = filter.roles
  if (filter.capabilities.length > 0) payload.capabilities = filter.capabilities
  if (filter.account_status) payload.account_status = filter.account_status
  return Object.keys(payload).length > 0 ? payload : null
}

/**
 * LIVE audience counter. Debounces filter changes, then calls
 * GET /admin/broadcasts/targets/estimate and returns estimated_targets.
 */
export function useBroadcastTargetEstimate(
  targetType: 'all' | 'online' | 'filter' | 'manual',
  filter: TargetFilterDraft,
  manualUserIds: string[],
) {
  const serializedFilter = useDebouncedValue(
    JSON.stringify(buildTargetFilterPayload(targetType, filter, manualUserIds)),
    700,
  )

  return useQuery<{ count: number; isStaleFilter: boolean }>({
    queryKey: ['broadcast-target-estimate', targetType, serializedFilter],
    queryFn: async () => {
      const params: Record<string, string> = { target_type: targetType }
      if (serializedFilter && serializedFilter !== 'null') {
        params.target_filter = serializedFilter
      }
      const res = await api.get('/admin/broadcasts/targets/estimate', { params })
      return { count: Number(res.data?.data?.estimated_targets ?? 0), isStaleFilter: false }
    },
    placeholderData: (previous) =>
      previous ? { ...previous, isStaleFilter: true } : undefined,
  })
}
