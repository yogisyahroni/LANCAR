import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  Globe2,
  KeyRound,
  LockKeyhole,
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

type MapProviderId = 'tomtom_maps' | 'openstreetmap' | 'disabled'
type MapScopeId = 'global' | 'customer_mobile' | 'courier_mobile' | 'web_customer' | 'web_admin' | 'tracking'
type OpsStatus = 'operational' | 'degraded' | 'disabled' | 'critical'

interface ScopePolicy {
  enabled: boolean
  provider: MapProviderId
}

interface MapsProviderValue {
  enabled: boolean
  active_provider: MapProviderId
  fallback_provider: MapProviderId
  tomtom_maps_enabled: boolean
  openstreetmap_enabled: boolean
  disabled_mode_enabled: boolean
  config_ttl_seconds: number
  scopes: Record<string, ScopePolicy>
  providers: {
    tomtom_maps?: {
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
  request_id?: string | null
  operation: string
  scope: MapScopeId
  requested_provider: MapProviderId
  active_provider: MapProviderId
  provider: string
  credential_alias?: string | null
  status: 'success' | 'failure' | 'fallback' | 'disabled' | 'cache_hit'
  latency_ms: number
  cache_hit: boolean
  fallback_reason?: string | null
  error_message?: string | null
  result_count?: number | null
  service_code?: string | null
  route_profile?: string | null
  vehicle_type?: string | null
  distance_meters?: number | null
  distance_km?: number | null
  duration_seconds?: number | null
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
    tomtom_maps_enabled: boolean
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
  route_quality: {
    route_events: number
    road_route_successes: number
    distance_anomalies: number
    straight_line_fallbacks: number
    cache_hit_rate_percent: number
  }
  last_error: MapsProviderObservation | null
  recent_events: MapsProviderObservation[]
  quota: {
    tomtom_remaining_percent: number | null
    status: 'not_configured' | 'healthy' | 'near_limit'
  }
}

interface MapsProviderResponse {
  value: MapsProviderValue
  resolved: Partial<Record<MapScopeId, PublicMapsConfig>>
  ops: MapsOpsSnapshot
}

interface MapsCredentialSummary {
  id: string
  provider: 'tomtom_maps'
  scope: string
  key_alias: string
  key_mask: string
  secret_fingerprint: string
  enabled_apis: string[]
  restriction_type: string
  is_active: boolean
  last_validation_status: 'untested' | 'valid' | 'invalid'
  last_error_code: string | null
  last_validated_at: string | null
  created_at: string
  updated_at: string
  activated_at: string | null
}

interface MapsCredentialValidation {
  status: 'untested' | 'valid' | 'invalid'
  error_code: string | null
  message: string
  checks: Array<{
    name: 'geocode' | 'route'
    status: 'passed' | 'failed'
    provider_status?: string | null
    error_code?: string | null
    latency_ms: number
  }>
}

interface MapsCredentialResponse {
  credential: MapsCredentialSummary
  validation?: MapsCredentialValidation
  rollback_to?: MapsCredentialSummary | null
}

interface MapsProductionIssue {
  code: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  action: string
}

interface MapsProductionKeyCheck {
  id: 'android_courier' | 'android_customer' | 'web_browser' | 'server'
  label: string
  expected_alias: string
  alias: string | null
  package_name?: string
  configured: boolean
  source: 'env' | 'runtime_store' | 'metadata' | 'legacy_fallback' | 'missing'
  source_env: string[]
  key_identity: string | null
  expected_application_restriction: string
  declared_application_restriction: string | null
  expected_api_restrictions: string[]
  declared_api_restrictions: string[]
  rotation: {
    status: 'current' | 'due_soon' | 'overdue' | 'unknown'
    last_rotated_at: string | null
    age_days: number | null
    due_at: string | null
    max_age_days: number
  }
  issues: MapsProductionIssue[]
}

interface MapsProductionReadiness {
  generated_at: string
  environment: 'development' | 'staging' | 'production' | 'unknown'
  overall_status: 'ready' | 'degraded' | 'blocked'
  key_inventory: MapsProductionKeyCheck[]
  shared_key_findings: Array<{
    key_identity: string
    surfaces: string[]
    severity: 'critical'
    message: string
    action: string
  }>
  active_alerts: MapsProductionIssue[]
  incident_response: {
    failover_steps: string[]
    quota_steps: string[]
    rotation_steps: string[]
  }
  docs: string[]
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
    id: 'tomtom_maps',
    title: 'TomTom Maps',
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
    id: 'web_admin',
    title: 'Admin Web',
    description: 'Dipakai di dashboard ini untuk monitoring dan peta operasional.',
    icon: MonitorSmartphone,
  },
  {
    id: 'tracking',
    title: 'Tracking Runtime',
    description: 'Dipakai endpoint route ETA, geocode, dan realtime tracking.',
    icon: Route,
  },
]

const providerLabel: Record<MapProviderId, string> = {
  tomtom_maps: 'TomTom Maps',
  openstreetmap: 'OpenStreetMap',
  disabled: 'Text Only',
}

const statusTone: Record<OpsStatus, string> = {
  operational: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  degraded: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  disabled: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-200',
  critical: 'border-red-500/30 bg-red-500/10 text-red-200',
}

const productionStatusTone: Record<MapsProductionReadiness['overall_status'], string> = {
  ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  degraded: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  blocked: 'border-red-500/30 bg-red-500/10 text-red-200',
}

const issueTone: Record<MapsProductionIssue['severity'], string> = {
  info: 'border-blue-400/30 bg-blue-500/10 text-blue-100',
  warning: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
  critical: 'border-red-400/30 bg-red-500/10 text-red-100',
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

const formatToken = (value?: string | null) => formatReason(value || null)

const mapsOpsAlertAction = (
  alert: MapsOpsSnapshot['active_alerts'][number],
  lastError?: MapsProviderObservation | null
) => {
  const text = [
    alert.code,
    alert.message,
    lastError?.error_message,
    lastError?.fallback_reason,
    lastError?.provider,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (text.includes('api_not_activated') || text.includes('not enabled') || text.includes('api is not enabled')) {
    return 'Enable API yang sesuai di TomTom Cloud: Routes/Geocoding untuk server, Maps SDK Android untuk mobile, atau Maps JavaScript untuk web.'
  }
  if (text.includes('billing')) {
    return 'Cek Billing Account TomTom Cloud dan payment method, lalu gunakan fallback OSM sampai billing sehat.'
  }
  if (text.includes('quota') || text.includes('over_query_limit') || text.includes('resource_exhausted')) {
    return 'Switch sementara ke OpenStreetMap/Text Only, tambah quota pada key restricted, lalu pantau fallback rate.'
  }
  if (text.includes('request_denied') || text.includes('permission_denied') || text.includes('forbidden')) {
    return 'Test server key di panel Secure Credential, cek API enablement, billing, dan restriction server IP VPS.'
  }
  if (text.includes('sha') || text.includes('package')) {
    return 'Cek package name dan signing SHA Android courier/customer, lalu update Android key restriction di TomTom Cloud.'
  }
  if (text.includes('circuit')) {
    return 'Tahan traffic di fallback, tunggu circuit cool-down, lalu validasi route/geocode sebelum mengaktifkan TomTom lagi.'
  }
  if (alert.code === 'maps_provider_failure_high') {
    return 'Gunakan Restore OpenStreetMap jika mobile/web mulai blank, lalu audit credential, timeout, dan konektivitas provider.'
  }
  if (alert.code === 'maps_latency_high') {
    return 'Pantau P95 latency, aktifkan fallback jika route/geocode mulai menghambat booking atau dispatch.'
  }
  return 'Buka Production Key Model dan Recent maps events untuk menentukan surface yang bermasalah, lalu gunakan failover bila perlu.'
}

const ProviderPill = ({ provider }: { provider: MapProviderId }) => {
  const className = provider === 'tomtom_maps'
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

const ProductionKeyCard = ({ item }: { item: MapsProductionKeyCheck }) => (
  <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-lg font-black text-white">{item.label}</div>
        <p className="mt-1 text-xs font-bold text-zinc-500">{item.alias || item.expected_alias}</p>
      </div>
      <span className={cn(
        'rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em]',
        item.configured ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
      )}>
        {item.configured ? 'Configured' : 'Missing'}
      </span>
    </div>

    <div className="mt-4 grid gap-3 text-xs font-bold text-zinc-500 sm:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <div className="uppercase tracking-[0.16em] text-zinc-600">Source</div>
        <div className="mt-1 text-zinc-300">{formatToken(item.source)}</div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <div className="uppercase tracking-[0.16em] text-zinc-600">Identity</div>
        <div className="mt-1 text-zinc-300">{item.key_identity || '-'}</div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <div className="uppercase tracking-[0.16em] text-zinc-600">Restriction</div>
        <div className="mt-1 text-zinc-300">
          {item.declared_application_restriction
            ? formatToken(item.declared_application_restriction)
            : `Expected ${formatToken(item.expected_application_restriction)}`}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <div className="uppercase tracking-[0.16em] text-zinc-600">Rotation</div>
        <div className={cn(
          'mt-1',
          item.rotation.status === 'overdue'
            ? 'text-red-300'
            : item.rotation.status === 'due_soon'
              ? 'text-amber-300'
              : item.rotation.status === 'current'
                ? 'text-emerald-300'
                : 'text-zinc-300'
        )}>
          {formatToken(item.rotation.status)}
          {item.rotation.age_days !== null ? ` · ${item.rotation.age_days}d` : ''}
        </div>
      </div>
    </div>

    {item.package_name && (
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-xs font-bold text-zinc-500">
        Package: <span className="text-zinc-300">{item.package_name}</span>
      </div>
    )}

    {item.issues.length > 0 && (
      <div className="mt-4 space-y-2">
        {item.issues.slice(0, 3).map((issue) => (
          <div key={`${item.id}-${issue.code}`} className={cn('rounded-2xl border p-3 text-xs leading-5', issueTone[issue.severity])}>
            <div className="font-black uppercase tracking-[0.16em] opacity-70">{issue.code}</div>
            <p className="mt-1 font-semibold">{issue.message}</p>
            <p className="mt-2 font-bold opacity-80">Tindakan: {issue.action}</p>
          </div>
        ))}
        {item.issues.length > 3 && (
          <div className="text-xs font-bold text-zinc-500">+{item.issues.length - 3} issue lain</div>
        )}
      </div>
    )}
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
  const [credentialForm, setCredentialForm] = useState({
    key_alias: 'staging-TomTom-server',
    api_key: '',
    restriction_type: 'server_ip',
    activate: true,
  })
  const [credentialValidation, setCredentialValidation] = useState<MapsCredentialValidation | null>(null)

  const { data, isLoading, isFetching } = useQuery<MapsProviderResponse>({
    queryKey: ['maps-provider-config'],
    queryFn: async () => {
      const response = await api.get('/admin/maps-provider-config')
      return response.data
    },
    refetchInterval: 30_000,
  })

  const credentialsQuery = useQuery<{ credentials: MapsCredentialSummary[] }>({
    queryKey: ['maps-provider-credentials'],
    queryFn: async () => {
      const response = await api.get('/admin/maps-provider-credentials')
      return response.data
    },
    retry: false,
  })

  const productionReadinessQuery = useQuery<MapsProductionReadiness>({
    queryKey: ['maps-production-readiness'],
    queryFn: async () => {
      const response = await api.get('/admin/maps-production-readiness')
      return response.data
    },
    refetchInterval: 60_000,
  })

  const updateMapsProviderMutation = useMutation({
    mutationFn: async (payload: Partial<MapsProviderValue>) => {
      const response = await api.patch('/admin/maps-provider-config', payload)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })
      queryClient.invalidateQueries({ queryKey: ['maps-production-readiness'] })
      queryClient.invalidateQueries({ queryKey: ['system-configs'] })
      toast.success('Maps runtime policy diperbarui')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Gagal memperbarui maps runtime policy')
    },
  })

  const testCredentialMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(
        '/admin/maps-provider-credentials/test',
        { api_key: credentialForm.api_key },
        { validateStatus: (status) => status < 500 }
      )
      return response.data.validation as MapsCredentialValidation
    },
    onSuccess: (validation) => {
      setCredentialValidation(validation)
      if (validation.status === 'valid') {
        toast.success('TomTom Maps key valid untuk server-side route dan geocode')
        return
      }
      toast.error(validation.message || 'TomTom Maps key belum valid')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Gagal mengetes TomTom Maps key')
    },
  })

  const createCredentialMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/admin/maps-provider-credentials', {
        provider: 'tomtom_maps',
        scope: 'server',
        key_alias: credentialForm.key_alias,
        api_key: credentialForm.api_key,
        restriction_type: credentialForm.restriction_type,
        enabled_apis: ['geocoding', 'routes'],
        activate: credentialForm.activate,
      })
      return response.data as MapsCredentialResponse
    },
    onSuccess: (result) => {
      setCredentialForm((current) => ({ ...current, api_key: '' }))
      setCredentialValidation(result.validation || null)
      queryClient.invalidateQueries({ queryKey: ['maps-provider-credentials'] })
      queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })
      queryClient.invalidateQueries({ queryKey: ['maps-production-readiness'] })
      toast.success(result.credential.is_active ? 'Credential valid dan aktif' : 'Credential tersimpan dengan status validasi')
    },
    onError: (error: any) => {
      setCredentialValidation(error?.response?.data?.validation || null)
      toast.error(error?.response?.data?.error || 'Gagal menyimpan maps credential')
    },
  })

  const activateCredentialMutation = useMutation({
    mutationFn: async (credentialId: string) => {
      const response = await api.post(`/admin/maps-provider-credentials/${credentialId}/activate`)
      return response.data as MapsCredentialResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps-provider-credentials'] })
      queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })
      queryClient.invalidateQueries({ queryKey: ['maps-production-readiness'] })
      toast.success('Maps credential aktif')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Credential gagal diaktifkan')
    },
  })

  const deactivateCredentialMutation = useMutation({
    mutationFn: async (credentialId: string) => {
      const response = await api.post(`/admin/maps-provider-credentials/${credentialId}/deactivate`, {
        reactivate_previous: true,
      })
      return response.data as MapsCredentialResponse
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['maps-provider-credentials'] })
      queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })
      queryClient.invalidateQueries({ queryKey: ['maps-production-readiness'] })
      toast.success(result.rollback_to ? `Rollback ke ${result.rollback_to.key_alias}` : 'Credential dinonaktifkan')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Credential gagal dinonaktifkan')
    },
  })

  const value = data?.value
  const ops = data?.ops

  const totalCache = (ops?.cache.hits || 0) + (ops?.cache.misses || 0)
  const cacheHitRate = totalCache === 0 ? 0 : Math.round(((ops?.cache.hits || 0) / totalCache) * 100)
  const selectedGlobalProvider = value?.active_provider || 'disabled'
  const tileTemplate = value?.providers.openstreetmap?.tile_url_template || ''
  const credentials = credentialsQuery.data?.credentials || []
  const productionReadiness = productionReadinessQuery.data
  const productionIssues = [
    ...(productionReadiness?.shared_key_findings || []).map((finding) => ({
      code: 'maps_key_shared_across_surfaces',
      severity: finding.severity,
      message: finding.message,
      action: finding.action,
    } as MapsProductionIssue)),
    ...(productionReadiness?.active_alerts || []),
  ]
  const canManageCredentials = credentialsQuery.error
    ? (credentialsQuery.error as any)?.response?.status !== 403
    : true

  const eventRows = useMemo(() => ops?.recent_events || [], [ops?.recent_events])

  const patchRuntime = (payload: Partial<MapsProviderValue>) => {
    updateMapsProviderMutation.mutate(payload)
  }

  const setGlobalProvider = (provider: MapProviderId) => {
    if (!value) return
    const next: Partial<MapsProviderValue> = {
      enabled: provider !== 'disabled',
      active_provider: provider,
      fallback_provider: provider === 'tomtom_maps' ? 'openstreetmap' : provider,
      tomtom_maps_enabled: provider === 'tomtom_maps' ? true : value.tomtom_maps_enabled,
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
      tomtom_maps_enabled: value.tomtom_maps_enabled,
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
                Switch TomTom Maps, OpenStreetMap, atau text-only secara runtime untuk customer app,
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
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })
                  queryClient.invalidateQueries({ queryKey: ['maps-production-readiness'] })
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.98]"
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
          value={`${ops.route_quality?.cache_hit_rate_percent ?? cacheHitRate}%`}
          caption={`${ops.cache.hits} hit / ${ops.cache.misses} miss`}
        />
        <MetricCard
          icon={ShieldAlert}
          label="Fallback"
          value={`${ops.fallback.total}`}
          caption={`${ops.fallback.osm_fallbacks} OSM, ${ops.fallback.haversine_fallbacks} haversine`}
        />
        <MetricCard
          icon={Route}
          label="Route"
          value={`${ops.route_quality?.road_route_successes || 0}/${ops.route_quality?.route_events || 0}`}
          caption={`${ops.route_quality?.distance_anomalies || 0} anomaly, ${ops.route_quality?.straight_line_fallbacks || 0} straight-line fallback`}
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
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-primary/15 p-3 text-primary-light">
                    <LockKeyhole className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Secure Credential</p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight text-white">TomTom server key</h2>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
                  Key diuji ke Geocoding dan Routes API sebelum bisa aktif. Plaintext key tidak pernah dikembalikan oleh backend.
                </p>
              </div>
              <ProviderPill provider="tomtom_maps" />
            </div>

            {!canManageCredentials ? (
              <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm font-bold leading-6 text-amber-100">
                Akses credential dibatasi untuk super admin atau ops security.
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
                <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                  <div className="grid gap-4">
                    <label className="block">
                      <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                        Key alias
                      </span>
                      <input
                        type="text"
                        value={credentialForm.key_alias}
                        onChange={(event) => setCredentialForm((current) => ({ ...current, key_alias: event.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition-all duration-200 focus:border-primary/50"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                        Server API key
                      </span>
                      <input
                        type="password"
                        value={credentialForm.api_key}
                        onChange={(event) => {
                          setCredentialForm((current) => ({ ...current, api_key: event.target.value }))
                          setCredentialValidation(null)
                        }}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition-all duration-200 focus:border-primary/50"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                        Restriction
                      </span>
                      <select
                        value={credentialForm.restriction_type}
                        onChange={(event) => setCredentialForm((current) => ({ ...current, restriction_type: event.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition-all duration-200 focus:border-primary/50"
                      >
                        <option value="server_ip">Server IP</option>
                        <option value="http_referrer">HTTP referrer</option>
                        <option value="android">Android</option>
                        <option value="ios">iOS</option>
                        <option value="unrestricted">Unrestricted</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <span className="text-sm font-bold text-zinc-300">Aktifkan setelah valid</span>
                      <input
                        type="checkbox"
                        checked={credentialForm.activate}
                        onChange={(event) => setCredentialForm((current) => ({ ...current, activate: event.target.checked }))}
                        className="h-5 w-5 accent-emerald-500"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!credentialForm.api_key.trim()) {
                            toast.error('Isi server API key dulu')
                            return
                          }
                          testCredentialMutation.mutate()
                        }}
                        disabled={testCredentialMutation.isPending || createCredentialMutation.isPending}
                        className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-black text-primary-light transition-all duration-200 hover:bg-primary/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {testCredentialMutation.isPending ? 'Testing...' : 'Test key'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!credentialForm.api_key.trim()) {
                            toast.error('Isi server API key dulu')
                            return
                          }
                          createCredentialMutation.mutate()
                        }}
                        disabled={createCredentialMutation.isPending || testCredentialMutation.isPending}
                        className="rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {createCredentialMutation.isPending ? 'Menyimpan...' : credentialForm.activate ? 'Save & activate' : 'Save credential'}
                      </button>
                    </div>
                  </div>

                  {credentialValidation && (
                    <div className={cn(
                      'mt-5 rounded-2xl border p-4',
                      credentialValidation.status === 'valid'
                        ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                        : 'border-red-400/20 bg-red-500/10 text-red-100'
                    )}>
                      <div className="text-sm font-black">
                        {credentialValidation.status === 'valid' ? 'Validation passed' : credentialValidation.error_code || 'Validation failed'}
                      </div>
                      <p className="mt-1 text-xs leading-5 opacity-80">{credentialValidation.message}</p>
                      <div className="mt-3 grid gap-2">
                        {credentialValidation.checks.map((check) => (
                          <div key={check.name} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-xs font-bold">
                            <span className="capitalize">{check.name}</span>
                            <span className={check.status === 'passed' ? 'text-emerald-300' : 'text-red-300'}>
                              {check.status} · {check.latency_ms}ms
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">Stored keys</p>
                      <h3 className="mt-1 text-lg font-black text-white">{credentials.length} credential</h3>
                    </div>
                    <KeyRound className="h-5 w-5 text-zinc-500" />
                  </div>
                  {credentialsQuery.isLoading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
                      ))}
                    </div>
                  ) : credentials.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm font-bold leading-6 text-zinc-500">
                      Belum ada credential tersimpan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {credentials.map((credential) => (
                        <div key={credential.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-black text-white">{credential.key_alias}</div>
                              <div className="mt-1 text-xs font-bold text-zinc-500">
                                {credential.key_mask} · {credential.restriction_type}
                              </div>
                            </div>
                            <span className={cn(
                              'rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em]',
                              credential.is_active
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : credential.last_validation_status === 'invalid'
                                  ? 'bg-red-500/10 text-red-300'
                                  : 'bg-zinc-500/10 text-zinc-300'
                            )}>
                              {credential.is_active ? 'Active' : credential.last_validation_status}
                            </span>
                          </div>
                          <div className="mt-3 text-xs leading-5 text-zinc-500">
                            Last validated: {formatDateTime(credential.last_validated_at)}
                            {credential.last_error_code ? ` · ${credential.last_error_code}` : ''}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {!credential.is_active && (
                              <button
                                type="button"
                                onClick={() => activateCredentialMutation.mutate(credential.id)}
                                disabled={activateCredentialMutation.isPending || credential.last_validation_status !== 'valid'}
                                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition-all duration-200 hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Activate
                              </button>
                            )}
                            {credential.is_active && (
                              <button
                                type="button"
                                onClick={() => deactivateCredentialMutation.mutate(credential.id)}
                                disabled={deactivateCredentialMutation.isPending}
                                className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-100 transition-all duration-200 hover:bg-amber-500/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Deactivate
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-zinc-900/60 p-6 shadow-xl shadow-black/10">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-500/15 p-3 text-blue-200">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Production Key Model</p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Platform key inventory</h2>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
                  Validasi apakah Android courier, Android customer, web browser, dan server sudah memakai key terpisah, restricted, dan siap dirotasi.
                </p>
              </div>
              {productionReadiness && (
                <div className={cn('rounded-2xl border px-5 py-4', productionStatusTone[productionReadiness.overall_status])}>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">
                    {productionReadiness.environment}
                  </div>
                  <div className="mt-1 text-xl font-black capitalize">{productionReadiness.overall_status}</div>
                </div>
              )}
            </div>

            {productionReadinessQuery.isLoading ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-64 rounded-3xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : productionReadiness ? (
              <div className="space-y-5">
                <div className="grid gap-4 xl:grid-cols-2">
                  {productionReadiness.key_inventory.map((item) => (
                    <ProductionKeyCard key={item.id} item={item} />
                  ))}
                </div>

                {productionIssues.length > 0 && (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {productionIssues.slice(0, 4).map((item, index) => (
                      <div key={`${item.code}-${index}`} className={cn('rounded-2xl border p-4 text-sm leading-6', issueTone[item.severity])}>
                        <div className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{item.code}</div>
                        <p className="mt-2 font-semibold">{item.message}</p>
                        <p className="mt-2 text-xs opacity-80">{item.action}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-zinc-500">Rotation runbook</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {productionReadiness.incident_response.rotation_steps.slice(0, 3).map((step, index) => (
                      <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm font-bold leading-6 text-zinc-300">
                        <span className="mr-2 text-primary-light">{index + 1}.</span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-sm font-bold leading-6 text-red-100">
                Production readiness belum bisa dimuat.
              </div>
            )}
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
                <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">TomTom quota</div>
                <div className="mt-1 text-sm font-bold capitalize text-zinc-300">
                  {ops.quota.status.replace('_', ' ')}
                  {ops.quota.tomtom_remaining_percent !== null ? ` · ${ops.quota.tomtom_remaining_percent}%` : ''}
                </div>
              </div>
              {ops.last_error && (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Last provider issue</div>
                  <div className="mt-2 text-sm font-bold text-amber-50">{ops.last_error.provider}</div>
                  <p className="mt-1 text-xs leading-5 text-amber-100/70">
                    {ops.last_error.error_message || formatReason(ops.last_error.fallback_reason)}
                  </p>
                  <p className="mt-3 rounded-xl bg-black/20 px-3 py-2 text-xs font-bold leading-5 text-amber-50">
                    Tindakan: {mapsOpsAlertAction({
                      code: ops.last_error.fallback_reason || 'maps_provider_last_issue',
                      severity: ops.last_error.status === 'failure' ? 'critical' : 'warning',
                      message: ops.last_error.error_message || ops.last_error.fallback_reason || 'Provider maps bermasalah.',
                    }, ops.last_error)}
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
                    <p className="mt-3 rounded-xl bg-black/20 px-3 py-2 text-xs font-bold leading-5 opacity-90">
                      Tindakan: {mapsOpsAlertAction(alert, ops.last_error)}
                    </p>
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
          <div className="grid grid-cols-[1fr_0.7fr_0.9fr_1fr_1fr_1fr_0.8fr] border-b border-white/10 bg-white/[0.035] px-5 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
            <span>Waktu</span>
            <span>Scope</span>
            <span>Service</span>
            <span>Provider</span>
            <span>Key alias</span>
            <span>Route</span>
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
                className="grid grid-cols-[1fr_0.7fr_0.9fr_1fr_1fr_1fr_0.8fr] items-center gap-3 border-b border-white/5 px-5 py-4 text-sm last:border-b-0"
              >
                <span className="font-medium text-zinc-300">{formatDateTime(event.recorded_at)}</span>
                <span className="font-bold text-zinc-400">{event.scope}</span>
                <span className="font-bold text-zinc-500">{event.service_code || '-'}</span>
                <span className="font-bold text-zinc-400">{event.provider}</span>
                <span className="font-bold text-zinc-500">{event.credential_alias || '-'}</span>
                <span className="font-bold text-zinc-500">
                  {event.distance_meters ? `${Math.round(event.distance_meters / 100) / 10}km` : '-'}
                  {event.duration_seconds ? ` · ${Math.ceil(event.duration_seconds / 60)}m` : ''}
                </span>
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
