import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  Globe2,
  Map,
  MonitorSmartphone,
  Navigation,
  RefreshCw,
  Route,
  Server,
  ShieldAlert,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  WifiOff,
} from 'lucide-react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

type MapProviderId = 'google_maps' | 'openstreetmap' | 'disabled'
type MapScopeId = 'global' | 'customer_mobile' | 'courier_mobile' | 'web_customer' | 'tracking'
type OpsStatus = 'operational' | 'degraded' | 'disabled' | 'critical'

interface ScopePolicy {
  enabled: boolean
  provider: MapProviderId
}

interface MapsProviderValue {
  enabled: boolean
  active_provider: MapProviderId
  fallback_provider: MapProviderId
  google_maps_enabled: boolean
  openstreetmap_enabled: boolean
  disabled_mode_enabled: boolean
  config_ttl_seconds: number
  scopes: Record<string, ScopePolicy>
  providers: {
    google_maps?: {
      requires_server_key?: boolean
      tiles_enabled?: boolean
      routing_enabled?: boolean
      geocoding_enabled?: boolean
    }
    openstreetmap?: {
      requires_server_key?: boolean
      tile_url_template?: string
      attribution?: string
      routing_enabled?: boolean
      geocoding_enabled?: boolean
    }
  }
}

interface PublicMapsConfig {
  enabled: boolean
  requested_provider: MapProviderId
  active_provider: MapProviderId
  fallback_provider: MapProviderId
  scope: MapScopeId
  ttl_seconds: number
  reason: string | null
  capabilities: {
    tiles: boolean
    routing: boolean
    geocoding: boolean
  }
}

interface MapsProviderObservation {
  recorded_at: string
  operation: string
  scope: MapScopeId
  requested_provider: MapProviderId
  active_provider: MapProviderId
  provider: string
  status: 'success' | 'failure' | 'fallback' | 'disabled' | 'cache_hit'
  latency_ms: number
  cache_hit: boolean
  fallback_reason?: string | null
  error_message?: string | null
  result_count?: number | null
}

interface MapsOpsSnapshot {
  generated_at: string
  status: OpsStatus
  active_alerts: Array<{
    code: string
    severity: 'info' | 'warning' | 'critical'
    message: string
  }>
  active_config: {
    enabled: boolean
    active_provider: MapProviderId
    fallback_provider: MapProviderId
    google_maps_enabled: boolean
    openstreetmap_enabled: boolean
  }
  counters: Record<string, number>
  latency: {
    sample_count: number
    average_ms: number
    p95_ms: number
  }
  cache: {
    hits: number
    misses: number
  }
  fallback: {
    total: number
    osm_fallbacks: number
    haversine_fallbacks: number
  }
  last_error: MapsProviderObservation | null
  recent_events: MapsProviderObservation[]
  quota: {
    google_remaining_percent: number | null
    status: 'not_configured' | 'healthy' | 'near_limit'
  }
}

interface MapsProviderResponse {
  value: MapsProviderValue
  resolved: Partial<Record<MapScopeId, PublicMapsConfig>>
  ops: MapsOpsSnapshot
}

const providerOptions: Array<{
  id: MapProviderId
  title: string
  description: string
  icon: typeof Globe2
}> = [
  {
    id: 'openstreetmap',
    title: 'OpenStreetMap',
    description: 'Default hemat biaya dengan OSRM route fallback.',
    icon: Globe2,
  },
  {
    id: 'google_maps',
    title: 'Google Maps',
    description: 'Provider premium untuk geocode, route, dan ETA produksi.',
    icon: Navigation,
  },
  {
    id: 'disabled',
    title: 'Text Only',
    description: 'Mode darurat tanpa tiles, tetap kirim koordinat dan ETA kasar.',
    icon: WifiOff,
  },
]

const scopeOptions: Array<{
  id: MapScopeId
  title: string
  description: string
  icon: typeof Smartphone
}> = [
  {
    id: 'global',
    title: 'Global Default',
    description: 'Policy dasar untuk semua client saat scope khusus tidak diatur.',
    icon: Server,
  },
  {
    id: 'customer_mobile',
    title: 'Customer Mobile',
    description: 'Dipakai aplikasi customer untuk booking, tracking, dan alamat.',
    icon: Smartphone,
  },
  {
    id: 'courier_mobile',
    title: 'Courier Mobile',
    description: 'Dipakai aplikasi kurir untuk pickup, delivery, dan POD.',
    icon: MonitorSmartphone,
  },
  {
    id: 'web_customer',
    title: 'Customer Web',
    description: 'Dipakai web customer dan public tracking link.',
    icon: Map,
  },
  {
    id: 'tracking',
    title: 'Tracking Runtime',
    description: 'Dipakai endpoint route ETA, geocode, dan realtime tracking.',
    icon: Route,
  },
]

const providerLabel: Record<MapProviderId, string> = {
  google_maps: 'Google Maps',
  openstreetmap: 'OpenStreetMap',
  disabled: 'Text Only',
}

const statusTone: Record<OpsStatus, string> = {
  operational: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  degraded: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  disabled: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-200',
  critical: 'border-red-500/30 bg-red-500/10 text-red-200',
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const formatReason = (value?: string | null) => {
  if (!value) return 'Policy normal'
  return value
    .split('_')
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(' ')
}

const ProviderPill = ({ provider }: { provider: MapProviderId }) => {
  const className = provider === 'google_maps'
    ? 'border-blue-400/30 bg-blue-500/10 text-blue-200'
    : provider === 'openstreetmap'
      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
      : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300'

  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em]', className)}>
      {providerLabel[provider]}
    </span>
  )
}

const MetricCard = ({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: typeof Activity
  label: string
  value: string
  caption: string
}) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-sm">
    <div className="mb-5 flex items-center justify-between">
      <div className="rounded-2xl bg-primary/15 p-3 text-primary-light">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">{label}</span>
    </div>
    <div className="text-3xl font-black tracking-tight text-white">{value}</div>
    <p className="mt-2 text-sm text-zinc-500">{caption}</p>
  </div>
)

const MapsRuntimeSkeleton = () => (
  <div className="space-y-6 p-8">
    <div className="h-24 rounded-3xl bg-white/5 animate-pulse" />
    <div className="grid gap-4 xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-36 rounded-2xl bg-white/5 animate-pulse" />
      ))}
    </div>
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="h-[520px] rounded-3xl bg-white/5 animate-pulse" />
      <div className="h-[520px] rounded-3xl bg-white/5 animate-pulse" />
    </div>
  </div>
)

export default function MapsRuntime() {
  const queryClient = useQueryClient()

  const { data, isLoading, isFetching } = useQuery<MapsProviderResponse>({
    queryKey: ['maps-provider-config'],
    queryFn: async () => {
      const response = await api.get('/admin/maps-provider-config')
      return response.data
    },
    refetchInterval: 30_000,
  })

  const updateMapsProviderMutation = useMutation({
    mutationFn: async (payload: Partial<MapsProviderValue>) => {
      const response = await api.patch('/admin/maps-provider-config', payload)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })
      queryClient.invalidateQueries({ queryKey: ['system-configs'] })
      toast.success('Maps runtime policy diperbarui')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Gagal memperbarui maps runtime policy')
    },
  })

  const value = data?.value
  const ops = data?.ops

  const totalCache = (ops?.cache.hits || 0) + (ops?.cache.misses || 0)
  const cacheHitRate = totalCache === 0 ? 0 : Math.round(((ops?.cache.hits || 0) / totalCache) * 100)
  const selectedGlobalProvider = value?.active_provider || 'disabled'
  const tileTemplate = value?.providers.openstreetmap?.tile_url_template || ''

  const eventRows = useMemo(() => ops?.recent_events || [], [ops?.recent_events])

  const patchRuntime = (payload: Partial<MapsProviderValue>) => {
    updateMapsProviderMutation.mutate(payload)
  }

  const setGlobalProvider = (provider: MapProviderId) => {
    if (!value) return
    const next: Partial<MapsProviderValue> = {
      enabled: provider !== 'disabled',
      active_provider: provider,
      fallback_provider: provider === 'google_maps' ? 'openstreetmap' : provider,
      google_maps_enabled: provider === 'google_maps' ? true : value.google_maps_enabled,
      openstreetmap_enabled: provider === 'disabled' ? value.openstreetmap_enabled : true,
      disabled_mode_enabled: true,
      scopes: {
        ...value.scopes,
        global: {
          enabled: provider !== 'disabled',
          provider,
        },
      },
    }
    patchRuntime(next)
  }

  const setScopeProvider = (scope: MapScopeId, provider: MapProviderId) => {
    if (!value) return
    patchRuntime({
      scopes: {
        ...value.scopes,
        [scope]: {
          enabled: provider !== 'disabled',
          provider,
        },
      },
    })
  }

  const toggleScope = (scope: MapScopeId) => {
    if (!value) return
    const current = value.scopes[scope] || { enabled: true, provider: value.active_provider }
    patchRuntime({
      scopes: {
        ...value.scopes,
        [scope]: {
          ...current,
          enabled: !current.enabled,
        },
      },
    })
  }

  const restoreOpenStreetMap = () => {
    if (!value) return
    const scopes = scopeOptions.reduce<Record<string, ScopePolicy>>((acc, scope) => {
      acc[scope.id] = { enabled: true, provider: 'openstreetmap' }
      return acc
    }, {})
    patchRuntime({
      enabled: true,
      active_provider: 'openstreetmap',
      fallback_provider: 'openstreetmap',
      google_maps_enabled: value.google_maps_enabled,
      openstreetmap_enabled: true,
      disabled_mode_enabled: true,
      scopes,
    })
  }

  const emergencyTextOnly = () => {
    if (!value) return
    const scopes = scopeOptions.reduce<Record<string, ScopePolicy>>((acc, scope) => {
      acc[scope.id] = { enabled: false, provider: 'disabled' }
      return acc
    }, {})
    patchRuntime({
      enabled: false,
      active_provider: 'disabled',
      fallback_provider: 'disabled',
      disabled_mode_enabled: true,
      scopes,
    })
  }

  const updateTtl = (ttlSeconds: number) => {
    if (!value) return
    patchRuntime({
      config_ttl_seconds: Math.max(30, Math.min(3600, ttlSeconds)),
    })
  }

  const updateTileTemplate = (template: string) => {
    if (!value) return
    patchRuntime({
      providers: {
        ...value.providers,
        openstreetmap: {
          ...value.providers.openstreetmap,
          tile_url_template: template.trim(),
        },
      },
    })
  }

  if (isLoading || !value || !ops) {
    return <MapsRuntimeSkeleton />
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6 md:p-8">
      <div className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20">
        <div className="relative p-7 md:p-8">
          <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-emerald-500/10 to-transparent" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-primary/15 p-3 text-primary-light">
                  <Map className="h-6 w-6" />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.45em] text-primary-light">
                  Runtime Maps Control
                </span>
              </div>
              <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
                Maps Provider Operations
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
                Switch Google Maps, OpenStreetMap, atau text-only secara runtime untuk customer app,
                courier app, web tracking, dan ETA tanpa rebuild aplikasi mobile.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className={cn('rounded-2xl border px-5 py-4', statusTone[ops.status])}>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Status</div>
                <div className="mt-1 text-xl font-black capitalize">{ops.status}</div>
              </div>
              <button
                type="button"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.98]"
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Globe2}
          label="Active"
          value={providerLabel[selectedGlobalProvider]}
          caption={`Fallback: ${providerLabel[value.fallback_provider]}`}
        />
        <MetricCard
          icon={Gauge}
          label="Latency"
          value={`${ops.latency.p95_ms}ms`}
          caption={`P95 dari ${ops.latency.sample_count} sample, avg ${ops.latency.average_ms}ms`}
        />
        <MetricCard
          icon={Activity}
          label="Cache"
          value={`${cacheHitRate}%`}
          caption={`${ops.cache.hits} hit / ${ops.cache.misses} miss`}
        />
        <MetricCard
          icon={ShieldAlert}
          label="Fallback"
          value={`${ops.fallback.total}`}
          caption={`${ops.fallback.osm_fallbacks} OSM, ${ops.fallback.haversine_fallbacks} haversine`}
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1fr_430px]">
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-white/10 bg-zinc-900/60 p-6 shadow-xl shadow-black/10">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Global Provider</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Provider utama platform</h2>
              </div>
              <ProviderPill provider={selectedGlobalProvider} />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {providerOptions.map((provider) => {
                const Icon = provider.icon
                const active = selectedGlobalProvider === provider.id
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setGlobalProvider(provider.id)}
                    disabled={updateMapsProviderMutation.isPending}
                    className={cn(
                      'group rounded-3xl border p-5 text-left transition-all duration-200 active:scale-[0.98]',
                      active
                        ? 'border-primary/50 bg-primary/15 shadow-lg shadow-primary/10'
                        : 'border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.055]'
                    )}
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <div className={cn('rounded-2xl p-3', active ? 'bg-primary text-white' : 'bg-white/5 text-zinc-400')}>
                        <Icon className="h-5 w-5" />
                      </div>
                      {active && <CheckCircle2 className="h-5 w-5 text-primary-light" />}
                    </div>
                    <div className="text-lg font-black text-white">{provider.title}</div>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">{provider.description}</p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-zinc-900/60 p-6 shadow-xl shadow-black/10">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Client Scopes</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Kontrol per aplikasi</h2>
              <p className="mt-2 text-sm text-zinc-500">
                Perubahan ini dibaca oleh mobile customer, mobile kurir, customer web, dan tracking saat config TTL habis atau socket config berubah.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {scopeOptions.map((scope) => {
                const Icon = scope.icon
                const policy = value.scopes[scope.id] || { enabled: true, provider: value.active_provider }
                const resolved = data.resolved?.[scope.id]
                return (
                  <div key={scope.id} className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div className="flex gap-4">
                        <div className="rounded-2xl bg-primary/15 p-3 text-primary-light">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-lg font-black text-white">{scope.title}</div>
                          <p className="mt-1 text-sm leading-6 text-zinc-500">{scope.description}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleScope(scope.id)}
                        disabled={updateMapsProviderMutation.isPending}
                        className={cn(
                          'rounded-full p-1 transition-all duration-200 active:scale-[0.98]',
                          policy.enabled ? 'text-emerald-300 hover:bg-emerald-500/10' : 'text-zinc-500 hover:bg-white/5'
                        )}
                        aria-label={`Toggle ${scope.title}`}
                      >
                        {policy.enabled ? <ToggleRight className="h-8 w-8" /> : <ToggleLeft className="h-8 w-8" />}
                      </button>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2">
                      {providerOptions.map((provider) => (
                        <button
                          key={`${scope.id}-${provider.id}`}
                          type="button"
                          onClick={() => setScopeProvider(scope.id, provider.id)}
                          disabled={updateMapsProviderMutation.isPending}
                          className={cn(
                            'rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all duration-200 active:scale-[0.98]',
                            policy.provider === provider.id
                              ? 'border-primary/60 bg-primary/20 text-primary-light'
                              : 'border-white/10 bg-white/[0.025] text-zinc-500 hover:border-white/20 hover:text-white'
                          )}
                        >
                          {provider.title}
                        </button>
                      ))}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">Resolved runtime</p>
                          <p className="mt-1 text-sm font-bold text-zinc-300">
                            {resolved ? providerLabel[resolved.active_provider] : providerLabel[policy.provider]}
                          </p>
                        </div>
                        <span className={cn(
                          'rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em]',
                          policy.enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-500/10 text-zinc-400'
                        )}>
                          {policy.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-zinc-500">
                        {formatReason(resolved?.reason)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-zinc-900/60 p-6 shadow-xl shadow-black/10">
            <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Provider Detail</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Runtime parameters</h2>
              </div>
              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Config TTL seconds
                  </span>
                  <input
                    type="number"
                    min={30}
                    max={3600}
                    defaultValue={value.config_ttl_seconds}
                    onBlur={(event) => updateTtl(Number(event.target.value))}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition-all duration-200 focus:border-primary/50"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    OpenStreetMap tile URL
                  </span>
                  <input
                    type="text"
                    defaultValue={tileTemplate}
                    onBlur={(event) => updateTileTemplate(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition-all duration-200 focus:border-primary/50"
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-red-500/20 bg-red-500/[0.055] p-6 shadow-xl shadow-red-950/10">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/15 p-3 text-red-300">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.26em] text-red-300/80">Emergency</p>
                <h2 className="text-xl font-black tracking-tight text-white">Failover control</h2>
              </div>
            </div>
            <p className="mb-5 text-sm leading-6 text-red-100/70">
              Gunakan saat provider maps gagal, quota habis, atau mobile harus tetap berjalan tanpa visual map.
            </p>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={restoreOpenStreetMap}
                disabled={updateMapsProviderMutation.isPending}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition-all duration-200 hover:bg-emerald-500 active:scale-[0.98]"
              >
                Restore OpenStreetMap
              </button>
              <button
                type="button"
                onClick={emergencyTextOnly}
                disabled={updateMapsProviderMutation.isPending}
                className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 transition-all duration-200 hover:bg-red-500/20 active:scale-[0.98]"
              >
                Activate Text-Only Mode
              </button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-zinc-900/60 p-6 shadow-xl shadow-black/10">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.26em] text-zinc-500">Observability</p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white">Provider health</h2>
              </div>
              <Clock3 className="h-5 w-5 text-zinc-500" />
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">Last sync</div>
                <div className="mt-1 text-sm font-bold text-zinc-300">{formatDateTime(ops.generated_at)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">Google quota</div>
                <div className="mt-1 text-sm font-bold capitalize text-zinc-300">
                  {ops.quota.status.replace('_', ' ')}
                  {ops.quota.google_remaining_percent !== null ? ` · ${ops.quota.google_remaining_percent}%` : ''}
                </div>
              </div>
              {ops.last_error && (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Last provider issue</div>
                  <div className="mt-2 text-sm font-bold text-amber-50">{ops.last_error.provider}</div>
                  <p className="mt-1 text-xs leading-5 text-amber-100/70">
                    {ops.last_error.error_message || formatReason(ops.last_error.fallback_reason)}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-zinc-900/60 p-6 shadow-xl shadow-black/10">
            <div className="mb-5 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              <h2 className="text-xl font-black tracking-tight text-white">Active alerts</h2>
            </div>
            <div className="space-y-3">
              {ops.active_alerts.length === 0 ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">
                  Tidak ada alert aktif.
                </div>
              ) : (
                ops.active_alerts.map((alert) => (
                  <div
                    key={alert.code}
                    className={cn(
                      'rounded-2xl border p-4',
                      alert.severity === 'critical'
                        ? 'border-red-400/30 bg-red-500/10 text-red-100'
                        : alert.severity === 'warning'
                          ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                          : 'border-blue-400/30 bg-blue-500/10 text-blue-100'
                    )}
                  >
                    <div className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{alert.code}</div>
                    <p className="mt-2 text-sm leading-6">{alert.message}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="mt-6 rounded-[2rem] border border-white/10 bg-zinc-900/60 p-6 shadow-xl shadow-black/10">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Audit Signal</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Recent maps events</h2>
          </div>
          <span className="text-sm text-zinc-500">{eventRows.length} event terakhir</span>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10">
          <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] border-b border-white/10 bg-white/[0.035] px-5 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
            <span>Waktu</span>
            <span>Scope</span>
            <span>Provider</span>
            <span>Status</span>
          </div>
          {eventRows.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-zinc-500">
              Belum ada event runtime. Event akan muncul setelah client memanggil config, route, geocode, atau reverse geocode.
            </div>
          ) : (
            eventRows.map((event, index) => (
              <div
                key={`${event.recorded_at}-${event.scope}-${index}`}
                className="grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center gap-3 border-b border-white/5 px-5 py-4 text-sm last:border-b-0"
              >
                <span className="font-medium text-zinc-300">{formatDateTime(event.recorded_at)}</span>
                <span className="font-bold text-zinc-400">{event.scope}</span>
                <span className="font-bold text-zinc-400">{event.provider}</span>
                <span className={cn(
                  'w-fit rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em]',
                  event.status === 'failure'
                    ? 'bg-red-500/10 text-red-300'
                    : event.status === 'fallback'
                      ? 'bg-amber-500/10 text-amber-300'
                      : event.status === 'disabled'
                        ? 'bg-zinc-500/10 text-zinc-300'
                        : 'bg-emerald-500/10 text-emerald-300'
                )}>
                  {event.status}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
