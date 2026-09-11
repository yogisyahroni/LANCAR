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
import { StatusBadge } from '../components/StatusBadge'

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
  operational: 'border-success bg-success-surface text-success',
  degraded: 'border-warning bg-warning-surface text-warning',
  disabled: 'border-border bg-surface-subtle text-foreground-muted',
  critical: 'border-error bg-error-surface text-error',
}

const productionStatusTone: Record<MapsProductionReadiness['overall_status'], string> = {
  ready: 'border-success bg-success-surface text-success',
  degraded: 'border-warning bg-warning-surface text-warning',
  blocked: 'border-error bg-error-surface text-error',
}

const issueTone: Record<MapsProductionIssue['severity'], string> = {
  info: 'border-info bg-info-surface text-info',
  warning: 'border-warning bg-warning-surface text-warning',
  critical: 'border-error bg-error-surface text-error',
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
    ? 'border-info bg-info-surface text-info'
    : provider === 'openstreetmap'
      ? 'border-success bg-success-surface text-success'
      : 'border-border bg-surface-subtle text-foreground-muted'

  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide', className)}>
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
  <div className="rounded-2xl border border-border bg-surface/[0.035] p-5 shadow-sm">
    <div className="mb-5 flex items-center justify-between">
      <div className="rounded-2xl bg-primary/15 p-3 text-primary-light">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <span className="text-xs font-black uppercase tracking-wide text-foreground-muted">{label}</span>
    </div>
    <div className="text-3xl font-black tracking-tight text-foreground">{value}</div>
    <p className="mt-2 text-sm text-foreground-muted">{caption}</p>
  </div>
)

const ProductionKeyCard = ({ item }: { item: MapsProductionKeyCheck }) => (
  <div className="rounded-3xl border border-border bg-surface-subtle p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-lg font-black text-foreground">{item.label}</div>
        <p className="mt-1 text-xs font-bold text-foreground-muted">{item.alias || item.expected_alias}</p>
      </div>
      <span className={cn(
        'rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide',
        item.configured ? 'bg-success-surface text-success' : 'bg-error-surface text-error'
      )}>
        {item.configured ? 'Configured' : 'Missing'}
      </span>
    </div>

    <div className="mt-4 grid gap-3 text-xs font-bold text-foreground-muted sm:grid-cols-2">
      <div className="rounded-2xl border border-border bg-surface/[0.025] p-3">
        <div className="uppercase tracking-wide text-foreground-muted">Source</div>
        <div className="mt-1 text-foreground-muted">{formatToken(item.source)}</div>
      </div>
      <div className="rounded-2xl border border-border bg-surface/[0.025] p-3">
        <div className="uppercase tracking-wide text-foreground-muted">Identity</div>
        <div className="mt-1 text-foreground-muted">{item.key_identity || '-'}</div>
      </div>
      <div className="rounded-2xl border border-border bg-surface/[0.025] p-3">
        <div className="uppercase tracking-wide text-foreground-muted">Restriction</div>
        <div className="mt-1 text-foreground-muted">
          {item.declared_application_restriction
            ? formatToken(item.declared_application_restriction)
            : `Expected ${formatToken(item.expected_application_restriction)}`}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface/[0.025] p-3">
        <div className="uppercase tracking-wide text-foreground-muted">Rotation</div>
        <div className={cn(
          'mt-1',
          item.rotation.status === 'overdue'
            ? 'text-error'
            : item.rotation.status === 'due_soon'
              ? 'text-warning'
              : item.rotation.status === 'current'
                ? 'text-success'
                : 'text-foreground-muted'
        )}>
          {formatToken(item.rotation.status)}
          {item.rotation.age_days !== null ? ` · ${item.rotation.age_days}d` : ''}
        </div>
      </div>
    </div>

    {item.package_name && (
      <div className="mt-3 rounded-2xl border border-border bg-surface/[0.025] p-3 text-xs font-bold text-foreground-muted">
        Package: <span className="text-foreground-muted">{item.package_name}</span>
      </div>
    )}

    {item.issues.length > 0 && (
      <div className="mt-4 space-y-2">
        {item.issues.slice(0, 3).map((issue) => (
          <div key={`${item.id}-${issue.code}`} className={cn('rounded-2xl border p-3 text-xs leading-5', issueTone[issue.severity])}>
            <div className="font-black uppercase tracking-wide opacity-70">{issue.code}</div>
            <p className="mt-1 font-semibold">{issue.message}</p>
            <p className="mt-2 font-bold opacity-80">Tindakan: {issue.action}</p>
          </div>
        ))}
        {item.issues.length > 3 && (
          <div className="text-xs font-bold text-foreground-muted">+{item.issues.length - 3} issue lain</div>
        )}
      </div>
    )}
  </div>
)

const MapsRuntimeSkeleton = () => (
  <div className="space-y-6 p-8">
    <div className="h-24 rounded-3xl bg-surface-subtle animate-pulse" />
    <div className="grid gap-4 xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-36 rounded-2xl bg-surface-subtle animate-pulse" />
      ))}
    </div>
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="h-[520px] rounded-3xl bg-surface-subtle animate-pulse" />
      <div className="h-[520px] rounded-3xl bg-surface-subtle animate-pulse" />
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
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="mb-8 overflow-hidden rounded-[2rem] border border-border bg-surface/[0.035] shadow-2xl shadow-scrim">
        <div className="relative p-7 md:p-8">
          <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-success to-transparent" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-primary/15 p-3 text-primary-light">
                  <Map className="h-6 w-6" aria-hidden="true" />
                </div>
                <span className="text-xs font-black uppercase tracking-wide text-primary-light">
                  Runtime Maps Control
                </span>
              </div>
              <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl">
                Maps Provider Operations
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-foreground-muted">
                Switch TomTom Maps, OpenStreetMap, atau text-only secara runtime untuk customer app,
                courier app, web tracking, dan ETA tanpa rebuild aplikasi mobile.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className={cn('rounded-2xl border px-5 py-4', statusTone[ops.status])}>
                <div className="text-xs font-black uppercase tracking-wide text-foreground">Status</div>
                <StatusBadge status={ops.status} labelPrefix="Maps provider status" className="mt-1 text-sm uppercase !text-foreground" />
              </div>
              <button
                type="button"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })
                  queryClient.invalidateQueries({ queryKey: ['maps-production-readiness'] })
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface-subtle px-5 py-4 text-sm font-bold text-foreground transition-all duration-200 hover:bg-surface-subtle active:scale-[0.98]"
              >
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden="true" />
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
          <section className="rounded-[2rem] border border-border bg-surface-subtle p-6 shadow-xl shadow-scrim">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Global Provider</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">Provider utama platform</h2>
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
                        : 'border-border bg-surface/[0.025] hover:border-border hover:bg-surface/[0.055]'
                    )}
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <div className={cn('rounded-2xl p-3', active ? 'bg-primary text-on-primary' : 'bg-surface-subtle text-foreground-muted')}>
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      {active && <CheckCircle2 className="h-5 w-5 text-primary-light" aria-hidden="true" />}
                    </div>
                    <div className="text-lg font-black text-foreground">{provider.title}</div>
                    <p className="mt-2 text-sm leading-6 text-foreground-muted">{provider.description}</p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-border bg-surface-subtle p-6 shadow-xl shadow-scrim">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-primary/15 p-3 text-primary-light">
                    <LockKeyhole className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Secure Credential</p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground">TomTom server key</h2>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-muted">
                  Key diuji ke Geocoding dan Routes API sebelum bisa aktif. Plaintext key tidak pernah dikembalikan oleh backend.
                </p>
              </div>
              <ProviderPill provider="tomtom_maps" />
            </div>

            {!canManageCredentials ? (
              <div className="rounded-3xl border border-warning bg-warning-surface p-5 text-sm font-bold leading-6 text-warning">
                Akses credential dibatasi untuk super admin atau ops security.
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
                <div className="rounded-3xl border border-border bg-surface/[0.025] p-5">
                  <div className="grid gap-4">
                    <label className="block">
                      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-foreground-muted">
                        Key alias
                      </span>
                      <input
                        type="text"
                        value={credentialForm.key_alias}
                        onChange={(event) => setCredentialForm((current) => ({ ...current, key_alias: event.target.value }))}
                        className="w-full rounded-2xl border border-border bg-scrim/30 px-4 py-3 text-sm font-bold text-foreground outline-none transition-all duration-200 focus:border-primary/50"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-foreground-muted">
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
                        className="w-full rounded-2xl border border-border bg-scrim/30 px-4 py-3 text-sm font-bold text-foreground outline-none transition-all duration-200 focus:border-primary/50"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-foreground-muted">
                        Restriction
                      </span>
                      <select
                        value={credentialForm.restriction_type}
                        onChange={(event) => setCredentialForm((current) => ({ ...current, restriction_type: event.target.value }))}
                        className="w-full rounded-2xl border border-border bg-scrim/30 px-4 py-3 text-sm font-bold text-foreground outline-none transition-all duration-200 focus:border-primary/50"
                      >
                        <option value="server_ip">Server IP</option>
                        <option value="http_referrer">HTTP referrer</option>
                        <option value="android">Android</option>
                        <option value="ios">iOS</option>
                        <option value="unrestricted">Unrestricted</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-subtle px-4 py-3">
                      <span className="text-sm font-bold text-foreground-muted">Aktifkan setelah valid</span>
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
                        className="rounded-2xl bg-primary px-4 py-3 text-sm font-black text-on-primary transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {createCredentialMutation.isPending ? 'Menyimpan...' : credentialForm.activate ? 'Save & activate' : 'Save credential'}
                      </button>
                    </div>
                  </div>

                  {credentialValidation && (
                    <div className={cn(
                      'mt-5 rounded-2xl border p-4',
                      credentialValidation.status === 'valid'
                        ? 'border-success bg-success-surface text-success'
                        : 'border-error bg-error-surface text-error'
                    )}>
                      <StatusBadge
                        status={credentialValidation.status === 'valid' ? 'valid' : 'failed'}
                        label={credentialValidation.status === 'valid' ? 'Validation passed' : credentialValidation.error_code || 'Validation failed'}
                        labelPrefix="Credential validation status"
                        className="border-0 bg-transparent p-0 text-sm font-black"
                      />
                      <p className="mt-1 text-xs leading-5 opacity-80">{credentialValidation.message}</p>
                      <div className="mt-3 grid gap-2">
                        {credentialValidation.checks.map((check) => (
                          <div key={check.name} className="flex items-center justify-between rounded-xl bg-surface-subtle px-3 py-2 text-xs font-bold">
                            <span className="capitalize">{check.name}</span>
                            <StatusBadge
                              status={check.status === 'passed' ? 'passed' : 'failed'}
                              label={`${check.status} · ${check.latency_ms}ms`}
                              labelPrefix={`${check.name} credential check`}
                              className="border-0 bg-transparent px-0 py-0"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-border bg-surface/[0.025] p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                    <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Stored keys</p>
                      <h3 className="mt-1 text-lg font-black text-foreground">{credentials.length} credential</h3>
                    </div>
                    <KeyRound className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
                  </div>
                  {credentialsQuery.isLoading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="h-24 rounded-2xl bg-surface-subtle animate-pulse" />
                      ))}
                    </div>
                  ) : credentials.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-surface-subtle p-5 text-sm font-bold leading-6 text-foreground-muted">
                      Belum ada credential tersimpan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {credentials.map((credential) => (
                        <div key={credential.id} className="rounded-2xl border border-border bg-surface-subtle p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-black text-foreground">{credential.key_alias}</div>
                              <div className="mt-1 text-xs font-bold text-foreground-muted">
                                {credential.key_mask} · {credential.restriction_type}
                              </div>
                            </div>
                            <span className={cn(
                              'rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide',
                              credential.is_active
                                ? 'bg-success-surface text-success'
                                : credential.last_validation_status === 'invalid'
                                  ? 'bg-error-surface text-error'
                                  : 'bg-surface-subtle text-foreground-muted'
                            )}>
                              {credential.is_active ? 'Active' : credential.last_validation_status}
                            </span>
                          </div>
                          <div className="mt-3 text-xs leading-5 text-foreground-muted">
                            Last validated: {formatDateTime(credential.last_validated_at)}
                            {credential.last_error_code ? ` · ${credential.last_error_code}` : ''}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {!credential.is_active && (
                              <button
                                type="button"
                                onClick={() => activateCredentialMutation.mutate(credential.id)}
                                disabled={activateCredentialMutation.isPending || credential.last_validation_status !== 'valid'}
                                className="rounded-xl bg-success px-3 py-2 text-xs font-black text-on-success transition-all duration-200 hover:bg-success active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Activate
                              </button>
                            )}
                            {credential.is_active && (
                              <button
                                type="button"
                                onClick={() => deactivateCredentialMutation.mutate(credential.id)}
                                disabled={deactivateCredentialMutation.isPending}
                                className="rounded-xl border border-warning bg-warning-surface px-3 py-2 text-xs font-black text-warning transition-all duration-200 hover:bg-warning-surface active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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

          <section className="rounded-[2rem] border border-border bg-surface-subtle p-6 shadow-xl shadow-scrim">
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-info-surface p-3 text-info">
                    <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Production Key Model</p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight text-foreground">Platform key inventory</h2>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground-muted">
                  Validasi apakah Android courier, Android customer, web browser, dan server sudah memakai key terpisah, restricted, dan siap dirotasi.
                </p>
              </div>
              {productionReadiness && (
                <div className={cn('rounded-2xl border px-5 py-4', productionStatusTone[productionReadiness.overall_status])}>
                <div className="text-xs font-black uppercase tracking-wide text-foreground">
                    {productionReadiness.environment}
                  </div>
                  <div className="mt-1 text-xl font-black capitalize">{productionReadiness.overall_status}</div>
                </div>
              )}
            </div>

            {productionReadinessQuery.isLoading ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-64 rounded-3xl bg-surface-subtle animate-pulse" />
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
                        <div className="text-xs font-black uppercase tracking-wide opacity-70">{item.code}</div>
                        <p className="mt-2 font-semibold">{item.message}</p>
                        <p className="mt-2 text-xs opacity-80">{item.action}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-3xl border border-border bg-surface-subtle p-5">
                  <div className="mb-3 text-xs font-black uppercase tracking-wide text-foreground-muted">Rotation runbook</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {productionReadiness.incident_response.rotation_steps.slice(0, 3).map((step, index) => (
                      <div key={step} className="rounded-2xl border border-border bg-surface/[0.025] p-4 text-sm font-bold leading-6 text-foreground-muted">
                        <span className="mr-2 text-primary-light">{index + 1}.</span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-error bg-error-surface p-5 text-sm font-bold leading-6 text-error">
                Production readiness belum bisa dimuat.
              </div>
            )}
          </section>

          <section className="rounded-[2rem] border border-border bg-surface-subtle p-6 shadow-xl shadow-scrim">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Client Scopes</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">Kontrol per aplikasi</h2>
              <p className="mt-2 text-sm text-foreground-muted">
                Perubahan ini dibaca oleh mobile customer, mobile kurir, customer web, dan tracking saat config TTL habis atau socket config berubah.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {scopeOptions.map((scope) => {
                const Icon = scope.icon
                const policy = value.scopes[scope.id] || { enabled: true, provider: value.active_provider }
                const resolved = data.resolved?.[scope.id]
                return (
                  <div key={scope.id} className="rounded-3xl border border-border bg-surface/[0.025] p-5">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div className="flex gap-4">
                        <div className="rounded-2xl bg-primary/15 p-3 text-primary-light">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="text-lg font-black text-foreground">{scope.title}</div>
                          <p className="mt-1 text-sm leading-6 text-foreground-muted">{scope.description}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleScope(scope.id)}
                        disabled={updateMapsProviderMutation.isPending}
                        className={cn(
                          'rounded-full p-1 transition-all duration-200 active:scale-[0.98]',
                          policy.enabled ? 'text-success hover:bg-success-surface' : 'text-foreground-muted hover:bg-surface-subtle'
                        )}
                        aria-label={`${policy.enabled ? 'Disable' : 'Enable'} ${scope.title}`}
                        aria-pressed={policy.enabled}
                        title={`${policy.enabled ? 'Disable' : 'Enable'} ${scope.title}`}
                      >
                        {policy.enabled ? <ToggleRight className="h-8 w-8" aria-hidden="true" /> : <ToggleLeft className="h-8 w-8" aria-hidden="true" />}
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
                            'rounded-full border px-3 py-2 text-xs font-black uppercase tracking-wide transition-all duration-200 active:scale-[0.98]',
                            policy.provider === provider.id
                              ? 'border-primary/60 bg-primary/20 text-primary-light'
                              : 'border-border bg-surface/[0.025] text-foreground-muted hover:border-border hover:text-foreground'
                          )}
                        >
                          {provider.title}
                        </button>
                      ))}
                    </div>

                    <div className="rounded-2xl border border-border bg-surface-subtle p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Resolved runtime</p>
                          <p className="mt-1 text-sm font-bold text-foreground-muted">
                            {resolved ? providerLabel[resolved.active_provider] : providerLabel[policy.provider]}
                          </p>
                        </div>
                        <span className={cn(
                          'rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide',
                          policy.enabled ? 'bg-success-surface text-success' : 'bg-surface-subtle text-foreground-muted'
                        )}>
                          {policy.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-foreground-muted">
                        {formatReason(resolved?.reason)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-border bg-surface-subtle p-6 shadow-xl shadow-scrim">
            <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Provider Detail</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">Runtime parameters</h2>
              </div>
              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-wide text-foreground-muted">
                    Config TTL seconds
                  </span>
                  <input
                    type="number"
                    min={30}
                    max={3600}
                    defaultValue={value.config_ttl_seconds}
                    onBlur={(event) => updateTtl(Number(event.target.value))}
                    className="w-full rounded-2xl border border-border bg-scrim/30 px-4 py-3 text-sm font-bold text-foreground outline-none transition-all duration-200 focus:border-primary/50"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-wide text-foreground-muted">
                    OpenStreetMap tile URL
                  </span>
                  <input
                    type="text"
                    defaultValue={tileTemplate}
                    onBlur={(event) => updateTileTemplate(event.target.value)}
                    className="w-full rounded-2xl border border-border bg-scrim/30 px-4 py-3 text-sm font-bold text-foreground outline-none transition-all duration-200 focus:border-primary/50"
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-error bg-error/[0.055] p-6 shadow-xl shadow-error">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-error-surface p-3 text-error">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-error">Emergency</p>
                <h2 className="text-xl font-black tracking-tight text-foreground">Failover control</h2>
              </div>
            </div>
            <p className="mb-5 text-sm leading-6 text-error">
              Gunakan saat provider maps gagal, quota habis, atau mobile harus tetap berjalan tanpa visual map.
            </p>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={restoreOpenStreetMap}
                disabled={updateMapsProviderMutation.isPending}
                className="rounded-2xl bg-success px-4 py-3 text-sm font-black text-on-success transition-all duration-200 hover:bg-success active:scale-[0.98]"
              >
                Restore OpenStreetMap
              </button>
              <button
                type="button"
                onClick={emergencyTextOnly}
                disabled={updateMapsProviderMutation.isPending}
                className="rounded-2xl border border-error bg-error-surface px-4 py-3 text-sm font-black text-error transition-all duration-200 hover:bg-error-surface active:scale-[0.98]"
              >
                Activate Text-Only Mode
              </button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-border bg-surface-subtle p-6 shadow-xl shadow-scrim">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Observability</p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-foreground">Provider health</h2>
              </div>
              <Clock3 className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-surface-subtle p-4">
                <div className="text-xs font-black uppercase tracking-wide text-foreground-muted">Last sync</div>
                <div className="mt-1 text-sm font-bold text-foreground-muted">{formatDateTime(ops.generated_at)}</div>
              </div>
              <div className="rounded-2xl border border-border bg-surface-subtle p-4">
                <div className="text-xs font-black uppercase tracking-wide text-foreground-muted">TomTom quota</div>
                <StatusBadge status={ops.quota.status} label={ops.quota.tomtom_remaining_percent !== null ? `${ops.quota.status.replace('_', ' ')} · ${ops.quota.tomtom_remaining_percent}%` : ops.quota.status.replace('_', ' ')} labelPrefix="TomTom quota status" className="mt-1 text-sm capitalize" />
              </div>
              {ops.last_error && (
                <div className="rounded-2xl border border-warning bg-warning-surface p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-warning">Last provider issue</div>
                  <div className="mt-2 text-sm font-bold text-warning">{ops.last_error.provider}</div>
                  <p className="mt-1 text-xs leading-5 text-warning">
                    {ops.last_error.error_message || formatReason(ops.last_error.fallback_reason)}
                  </p>
                  <p className="mt-3 rounded-xl bg-surface-subtle px-3 py-2 text-xs font-bold leading-5 text-warning">
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

          <section className="rounded-[2rem] border border-border bg-surface-subtle p-6 shadow-xl shadow-scrim">
            <div className="mb-5 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
              <h2 className="text-xl font-black tracking-tight text-foreground">Active alerts</h2>
            </div>
            <div className="space-y-3">
              {ops.active_alerts.length === 0 ? (
                <div className="rounded-2xl border border-success bg-success-surface p-4 text-sm font-bold text-success">
                  Tidak ada alert aktif.
                </div>
              ) : (
                ops.active_alerts.map((alert) => (
                  <div
                    key={alert.code}
                    className={cn(
                      'rounded-2xl border p-4',
                      alert.severity === 'critical'
                        ? 'border-error bg-error-surface text-error'
                        : alert.severity === 'warning'
                          ? 'border-warning bg-warning-surface text-warning'
                          : 'border-info bg-info-surface text-info'
                    )}
                  >
                    <div className="text-xs font-black uppercase tracking-wide opacity-70">{alert.code}</div>
                    <p className="mt-2 text-sm leading-6">{alert.message}</p>
                    <p className="mt-3 rounded-xl bg-surface-subtle px-3 py-2 text-xs font-bold leading-5 opacity-90">
                      Tindakan: {mapsOpsAlertAction(alert, ops.last_error)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="mt-6 rounded-[2rem] border border-border bg-surface-subtle p-6 shadow-xl shadow-scrim">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Audit Signal</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">Recent maps events</h2>
          </div>
          <span className="text-sm text-foreground-muted">{eventRows.length} event terakhir</span>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border">
          <div className="grid grid-cols-[1fr_0.7fr_0.9fr_1fr_1fr_1fr_0.8fr] border-b border-border bg-surface/[0.035] px-5 py-3 text-xs font-black uppercase tracking-wide text-foreground-muted">
            <span>Waktu</span>
            <span>Scope</span>
            <span>Service</span>
            <span>Provider</span>
            <span>Key alias</span>
            <span>Route</span>
            <span>Status</span>
          </div>
          {eventRows.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-foreground-muted">
              Belum ada event runtime. Event akan muncul setelah client memanggil config, route, geocode, atau reverse geocode.
            </div>
          ) : (
            eventRows.map((event, index) => (
              <div
                key={`${event.recorded_at}-${event.scope}-${index}`}
                className="grid grid-cols-[1fr_0.7fr_0.9fr_1fr_1fr_1fr_0.8fr] items-center gap-3 border-b border-border px-5 py-4 text-sm last:border-b-0"
              >
                <span className="font-medium text-foreground-muted">{formatDateTime(event.recorded_at)}</span>
                <span className="font-bold text-foreground-muted">{event.scope}</span>
                <span className="font-bold text-foreground-muted">{event.service_code || '-'}</span>
                <span className="font-bold text-foreground-muted">{event.provider}</span>
                <span className="font-bold text-foreground-muted">{event.credential_alias || '-'}</span>
                <span className="font-bold text-foreground-muted">
                  {event.distance_meters ? `${Math.round(event.distance_meters / 100) / 10}km` : '-'}
                  {event.duration_seconds ? ` · ${Math.ceil(event.duration_seconds / 60)}m` : ''}
                </span>
                <StatusBadge status={event.status} labelPrefix="Maps event status" className="w-fit text-xs uppercase tracking-wide" />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
