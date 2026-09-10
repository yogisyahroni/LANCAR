import { useState, useEffect, useMemo } from 'react'
import { 
  Package, 
  Clock, 
  Calendar, 
  Download,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Map as MapIcon,
  Zap,
  Target,
  Plus,
  History as HistoryIcon,
  Users,
  Loader2,
  Trash2,
  Mail,
  X,
  AlertCircle,
  RefreshCw,
  Activity
} from 'lucide-react'
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend
} from 'recharts'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { clientLog } from '../lib/clientLogger'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CARTO_DARK_ATTRIBUTION,
  CARTO_DARK_TILE_URL,
  CARTO_LIGHT_ATTRIBUTION,
  CARTO_LIGHT_TILE_URL,
  TOMTOM_RASTER_ATTRIBUTION,
  TomTomRuntimeUnavailable,
  isTomTomRuntimeReady,
  tomTomRasterTileUrl,
  useMapsRuntimeConfig
} from '../components/TomTomMapsRuntime'
import { useTheme } from '../providers/ThemeProvider'
import { MapZoomControls } from '../components/MapZoomControls'
import { FocusTrap } from '../components/a11y/FocusTrap'
import { AttributionControl, MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'

// --- Leaflet Heatmap Component ---
function HeatLayer({ points }: { points: any[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;
    
    // @ts-expect-error - leaflet.heat is not in types
    if (typeof L.heatLayer !== 'function') {
      clientLog.warn('Leaflet heat layer is not available');
      return;
    }

    const validPoints = points
      .filter(p => p && p.lat !== null && p.lng !== null)
      .map(p => [p.lat, p.lng, parseFloat(p.weight) || 1]);

    if (validPoints.length === 0) return;

    let heat: any;
    try {
      heat = (L as any).heatLayer(
        validPoints, 
        { radius: 25, blur: 15, maxZoom: 17, gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' } }
      ).addTo(map);
    } catch (e) {
      clientLog.error('Heatmap layer failed', { error: e });
    }

    return () => {
      if (heat) map.removeLayer(heat);
    };
  }, [points, map]);

  return null;
}


// --- Sub-components ---

interface NewScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function NewScheduleModal({ isOpen, onClose, onSuccess }: NewScheduleModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    frequency: 'Daily',
    time_slot: '08:00',
    day_of_week: 'Monday',
    day_of_month: 1,
    recipient_emails: '',
  })

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/admin/analytics/reports', data),
    onSuccess: () => {
      toast.success('Report schedule created successfully')
      onSuccess()
      onClose()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create schedule')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...formData,
      recipient_emails: formData.recipient_emails.split(',').map(e => e.trim()).filter(Boolean),
      query_payload: { range: '7D' } // Default context
    }
    mutation.mutate(payload)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-scrim/60 backdrop-blur-sm"
          />
          <FocusTrap active={isOpen} className="relative w-full max-w-lg">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-report-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
            }}
            className="relative w-full max-w-lg glass-card p-8 rounded-[40px] border-border shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-success" />
            
            <div className="flex items-center justify-between mb-8">
              <h2 id="schedule-report-title" className="text-2xl font-black text-foreground-muted italic uppercase tracking-tight">Schedule Report</h2>
              <button type="button" onClick={onClose} aria-label="Tutup analitik" title="Tutup analitik" className="p-2 rounded-xl bg-surface-subtle hover:bg-surface-subtle text-foreground-muted hover:text-foreground transition-all">
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground-muted ml-1">Report Name</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Weekly SLA Summary"
                  className="w-full bg-surface-subtle border border-border rounded-2xl px-5 py-4 text-foreground-muted placeholder:text-foreground-muted focus:outline-none focus:border-primary/50 transition-all"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground-muted ml-1">Frequency</label>
                  <select 
                    className="w-full bg-surface-subtle border border-border rounded-2xl px-5 py-4 text-foreground-muted focus:outline-none focus:border-primary/50 transition-all appearance-none"
                    value={formData.frequency}
                    onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                  >
                    <option value="Daily" className="bg-surface text-foreground-muted">Daily</option>
                    <option value="Weekly" className="bg-surface text-foreground-muted">Weekly</option>
                    <option value="Monthly" className="bg-surface text-foreground-muted">Monthly</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground-muted ml-1">Time (UTC)</label>
                  <input 
                    type="time"
                    required
                    className="w-full bg-surface-subtle border border-border rounded-2xl px-5 py-4 text-foreground-muted focus:outline-none focus:border-primary/50 transition-all"
                    value={formData.time_slot}
                    onChange={e => setFormData({ ...formData, time_slot: e.target.value })}
                  />
                </div>
              </div>

              {formData.frequency === 'Weekly' && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground-muted ml-1">Preferred Day</label>
                  <select 
                    className="w-full bg-surface-subtle border border-border rounded-2xl px-5 py-4 text-foreground-muted focus:outline-none focus:border-primary/50 transition-all appearance-none"
                    value={formData.day_of_week}
                    onChange={e => setFormData({ ...formData, day_of_week: e.target.value })}
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                      <option key={d} value={d} className="bg-surface text-foreground-muted">{d}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground-muted ml-1">Recipients (Comma Separated)</label>
                <textarea 
                  required
                  placeholder="admin@tembus.id, analyst@tembus.id"
                  className="w-full bg-surface-subtle border border-border rounded-2xl px-5 py-4 text-foreground-muted placeholder:text-foreground-muted focus:outline-none focus:border-primary/50 transition-all min-h-[100px]"
                  value={formData.recipient_emails}
                  onChange={e => setFormData({ ...formData, recipient_emails: e.target.value })}
                />
              </div>

              <div className="pt-4">
                <button 
                  disabled={mutation.isPending}
                  className="w-full py-5 rounded-2xl bg-primary hover:bg-primary-light text-on-primary font-black uppercase tracking-wide shadow-xl shadow-primary/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {mutation.isPending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
                  Confirm Schedule
                </button>
              </div>
            </form>
          </motion.div>
          </FocusTrap>
        </div>
      )}
    </AnimatePresence>
  )
}

const getQueryErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

function DataState({
  title,
  message,
  onRetry,
  tone = 'muted',
}: {
  title: string
  message: string
  onRetry?: () => void
  tone?: 'muted' | 'error'
}) {
  const isError = tone === 'error'
  return (
    <div className={cn(
      "h-full min-h-[220px] rounded-[32px] border flex flex-col items-center justify-center text-center p-8 gap-4",
      isError ? "bg-error-surface border-error" : "bg-surface/[0.02] border-dashed border-border"
    )}>
      <AlertCircle className={cn("w-10 h-10", isError ? "text-error" : "text-foreground-muted")} aria-hidden="true" />
      <div>
        <p className="text-sm font-black uppercase tracking-wide text-foreground-muted">{title}</p>
        <p className="text-xs text-foreground-muted mt-2 max-w-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-2 px-5 py-3 rounded-2xl border text-xs font-black uppercase tracking-wide transition-all",
            isError ? "bg-error-surface border-error text-error hover:bg-error-surface" : "bg-surface-subtle border-border text-foreground-muted hover:text-foreground"
          )}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  )
}

function ChartSkeleton({ bars = 8 }: { bars?: number }) {
  return (
    <div className="h-full flex items-end gap-2">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="flex-1 bg-surface-subtle animate-pulse rounded-t-lg"
          style={{ height: `${35 + ((i * 17) % 55)}%` }}
        />
      ))}
    </div>
  )
}

const hasRows = (data: unknown) => Array.isArray(data) && data.length > 0

const serviceKpiLabels: Record<string, string> = {
  package_on_demand: 'Paket On-Demand',
  food: 'Food',
  tambal_ban: 'Tambal Ban',
  aggregator: 'Aggregator',
  towing: 'Towing',
}

const serviceKpiMetricLabel = (key: string) => key
  .replace(/_pct$/, '')
  .replace(/_minutes?$/, ' (menit)')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase())

const formatServiceKpiMetric = (key: string, value: unknown) => {
  if (value === null || value === undefined) return 'No data'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 'No data'
  const formatted = Number.isInteger(numeric) ? numeric.toLocaleString('id-ID') : numeric.toLocaleString('id-ID', { maximumFractionDigits: 2 })
  return key.endsWith('_pct') ? `${formatted}%` : formatted
}

const analyticsQueryOptions = {
  retry: 1,
  staleTime: 30_000,
  refetchOnWindowFocus: false,
} as const

// --- Main Component ---

export default function Analytics() {
  const { resolvedTheme } = useTheme()
  const [timeRange, setTimeRange] = useState('7D')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: kpis, isLoading: kpisLoading, isError: kpisError, error: kpisQueryError, refetch: refetchKpis } = useQuery({
    queryKey: ['analytics', 'kpis', timeRange],
    queryFn: () => api.get(`/admin/analytics/kpis?range=${timeRange}`).then(res => res.data),
    ...analyticsQueryOptions,
  })

  const { data: serviceKpiPayload, isLoading: serviceKpisLoading, isError: serviceKpisError, error: serviceKpisQueryError, refetch: refetchServiceKpis } = useQuery({
    queryKey: ['analytics', 'service-kpis', timeRange],
    queryFn: () => api.get(`/admin/analytics/service-kpis?range=${timeRange}`).then(res => res.data?.data),
    ...analyticsQueryOptions,
  })

  const { data: canonicalAnalyticsPayload } = useQuery({
    queryKey: ['analytics', 'canonical-definitions'],
    queryFn: () => api.get('/admin/analytics/definitions').then(res => res.data?.data),
    ...analyticsQueryOptions,
  })

  const { data: experienceObservabilityPayload, isLoading: experienceObservabilityLoading, isError: experienceObservabilityError, error: experienceObservabilityQueryError, refetch: refetchExperienceObservability } = useQuery({
    queryKey: ['analytics', 'experience-observability', timeRange],
    queryFn: () => api.get(`/admin/experience/observability?range=${timeRange}&market_code=id-jk`).then(res => res.data?.data),
    ...analyticsQueryOptions,
  })

  const { data: slaData, isLoading: slaLoading, isError: slaError, error: slaQueryError, refetch: refetchSla } = useQuery({
    queryKey: ['analytics', 'sla', timeRange],
    queryFn: () => api.get(`/admin/analytics/sla?range=${timeRange}`).then(res => res.data),
    ...analyticsQueryOptions,
  })

  const { data: surgeData, isLoading: surgeLoading, isError: surgeError, error: surgeQueryError, refetch: refetchSurge } = useQuery({
    queryKey: ['analytics', 'surge', timeRange],
    queryFn: () => api.get(`/admin/analytics/surge?range=${timeRange}`).then(res => res.data),
    ...analyticsQueryOptions,
  })

  const { data: accuracyData, isLoading: accuracyLoading, isError: accuracyError, error: accuracyQueryError, refetch: refetchAccuracy } = useQuery({
    queryKey: ['analytics', 'accuracy', timeRange],
    queryFn: () => api.get(`/admin/analytics/scan-accuracy?range=${timeRange}`).then(res => res.data),
    ...analyticsQueryOptions,
  })

  const { data: retentionData, isLoading: retentionLoading, isError: retentionError, error: retentionQueryError, refetch: refetchRetention } = useQuery({
    queryKey: ['analytics', 'retention', timeRange],
    queryFn: () => api.get(`/admin/analytics/retention?range=${timeRange}`).then(res => res.data),
    ...analyticsQueryOptions,
  })

  const { data: heatData, isError: heatError, error: heatQueryError, refetch: refetchHeat } = useQuery({
    queryKey: ['analytics', 'heat'],
    queryFn: () => api.get('/admin/analytics/heat-data').then(res => res.data),
    ...analyticsQueryOptions,
    refetchInterval: 30000 // Refresh every 30s
  })
  const { data: mapsRuntimeConfig } = useMapsRuntimeConfig('web_admin')
  const shouldRenderTomTomMap = isTomTomRuntimeReady(mapsRuntimeConfig)
  const heatmapTileUrl = shouldRenderTomTomMap
    ? tomTomRasterTileUrl(mapsRuntimeConfig?.tomtom_maps?.browser_api_key || '', 'night')
    : resolvedTheme === 'dark' ? CARTO_DARK_TILE_URL : CARTO_LIGHT_TILE_URL
  const heatmapTileAttribution = shouldRenderTomTomMap
    ? TOMTOM_RASTER_ATTRIBUTION
    : resolvedTheme === 'dark' ? CARTO_DARK_ATTRIBUTION : CARTO_LIGHT_ATTRIBUTION


  const { data: reports, isLoading: reportsLoading, isError: reportsError, error: reportsQueryError, refetch: refetchReports } = useQuery({
    queryKey: ['analytics', 'reports'],
    queryFn: () => api.get('/admin/analytics/reports').then(res => res.data),
    ...analyticsQueryOptions,
  })

  const deleteReport = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/analytics/reports/${id}`),
    onSuccess: () => {
      toast.success('Report schedule removed')
      queryClient.invalidateQueries({ queryKey: ['analytics', 'reports'] })
    },
    onError: () => {
      toast.error('Failed to delete report schedule')
    }
  })

  const exportAnalytics = async () => {
    const toastId = toast.loading('Preparing CSV export...')
    try {
      const res = await api.get(`/admin/analytics/export?range=${timeRange}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `tembus-analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Data exported successfully', { id: toastId })
    } catch (err) {
      toast.error('Export failed. Please try again.', { id: toastId })
    }
  }

  if (kpisLoading) {
    return <AdminPageSkeleton />
  }

  const kpiItems = Array.isArray(kpis) ? kpis : [];
  const experienceSummary = experienceObservabilityPayload?.summary;
  const experienceBreakdown = Array.isArray(experienceObservabilityPayload?.breakdown) ? experienceObservabilityPayload.breakdown : [];

  return (
    <div className="space-y-10 animate-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight italic uppercase">Business Intelligence</h1>
          <p className="text-foreground-muted mt-1">Real-time performance metrics and predictive analytics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-surface-subtle p-1 rounded-xl border border-border">
            {['24H', '7D', '30D', '1Y'].map(r => (
              <button 
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide transition-all",
                  timeRange === r ? "bg-primary text-on-primary shadow-lg shadow-primary/20" : "text-foreground-muted hover:text-foreground-muted"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <button 
            onClick={exportAnalytics}
            type="button"
            aria-label="Unduh laporan analitik"
            title="Unduh laporan analitik"
            className="p-3 rounded-xl bg-surface-subtle border border-border text-foreground-muted hover:text-foreground transition-all"
          >
            <Download size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {kpisError ? (
          <div className="md:col-span-2 lg:col-span-4">
            <DataState
              title="KPI gagal dimuat"
              message={getQueryErrorMessage(kpisQueryError, 'Metrik KPI belum bisa diambil dari API analytics.')}
              onRetry={() => refetchKpis()}
              tone="error"
            />
          </div>
        ) : kpiItems.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-4">
            <DataState
              title="Belum ada KPI"
              message="API analytics belum mengirim data KPI untuk rentang waktu ini."
              onRetry={() => refetchKpis()}
            />
          </div>
        ) : kpiItems.map((stat: any, i: number) => {
          const Icon = i === 0 ? Target : i === 1 ? Zap : i === 2 ? Users : Clock;
          return (
            <div key={i} className="glass-card p-8 rounded-[40px] border-border group hover:border-border transition-all">
               <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-surface-subtle text-foreground-muted group-hover:text-primary-light transition-colors">
                     <Icon size={24} aria-hidden="true" />
                  </div>
                  <div className={cn(
                    "flex items-center gap-1 text-xs font-black px-2 py-1 rounded-full",
                    stat.up ? "bg-success-surface text-success" : "bg-error-surface text-error"
                  )}>
                     {stat.up ? <ArrowUpRight size={10} aria-hidden="true" /> : <ArrowDownRight size={10} aria-hidden="true" />}
                     {stat.change}
                  </div>
               </div>
               <div className="mt-6">
                  <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">{stat.label}</p>
                  <p className="text-3xl font-black text-foreground-muted mt-1 tracking-tighter">{stat.value}</p>
               </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-8 rounded-[40px] border-border">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground-muted italic uppercase flex items-center gap-3">
              <Activity className="text-primary-light" size={22} aria-hidden="true" />
              Canonical metric definitions
            </h2>
            <p className="text-xs text-foreground-muted mt-2">Semua metrik global berasal dari governed event stream dan memakai definisi kontrak yang sama.</p>
          </div>
          <span className="text-xs font-black uppercase tracking-wide text-foreground-muted">Contract {canonicalAnalyticsPayload?.contract_version || '—'}</span>
        </div>
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {(canonicalAnalyticsPayload?.definitions || []).map((definition: any) => (
            <div key={definition.name} className="rounded-2xl border border-border bg-surface/[0.02] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-foreground-muted">{definition.name}</p>
                <span className="text-xs font-bold text-primary-light">{definition.unit}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-foreground-muted">{definition.description}</p>
              <p className="mt-2 text-xs text-foreground-muted">Source: {definition.source_of_truth}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card p-8 rounded-[40px] border-border space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground-muted italic uppercase flex items-center gap-3">
              <Activity className="text-primary-light" size={22} aria-hidden="true" />
              Experience reliability guardrails
            </h2>
            <p className="text-xs text-foreground-muted mt-2">Fetch, render, asset, deeplink, startup, dan network metrics per revision. Impression/click/dismiss dipisahkan dari guardrail reliability.</p>
          </div>
          <span className="text-xs font-black uppercase tracking-wide text-foreground-muted">Window {timeRange}</span>
        </div>
        {experienceObservabilityLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-8 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => <div key={item} className="h-24 rounded-2xl bg-surface-subtle animate-pulse" />)}
          </div>
        ) : experienceObservabilityError ? (
          <DataState
            title="Experience observability gagal dimuat"
            message={getQueryErrorMessage(experienceObservabilityQueryError, 'Metrik runtime experience belum bisa diambil dari API.')}
            onRetry={() => refetchExperienceObservability()}
            tone="error"
          />
        ) : !experienceSummary ? (
          <DataState
            title="Belum ada telemetry experience"
            message="Belum ada event runtime experience pada window ini."
            onRetry={() => refetchExperienceObservability()}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-8 gap-3">
              {[
                ['Fetch success', experienceSummary.fetch_success],
                ['Fetch failure', experienceSummary.fetch_failure],
                ['Cache hit', experienceSummary.cache_hit],
                ['Parse failure', experienceSummary.parse_failure],
                ['Schema fallback', experienceSummary.schema_fallback],
                ['Startup regression', experienceSummary.startup_regression],
                ['Network regression', experienceSummary.network_regression],
                ['Failure rate', `${experienceSummary.reliability_failure_rate_pct}%`],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-border bg-surface/[0.02] p-4">
                  <p className="text-xs font-bold text-foreground-muted">{label}</p>
                  <p className="mt-2 text-xl font-black text-foreground-muted">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-wide text-foreground-muted">
              <span className="rounded-full bg-success-surface px-3 py-2 text-success">Core guardrail: {experienceSummary.reliability_failures}/{experienceSummary.reliability_total} failures</span>
              <span className="rounded-full bg-primary/10 px-3 py-2 text-primary-light">Fetch latency p95: {experienceSummary.fetch_latency_p95_ms} ms</span>
              <span className="rounded-full bg-surface-subtle px-3 py-2">Marketing: {experienceSummary.impressions} imp • {experienceSummary.clicks} click • {experienceSummary.dismissals} dismiss</span>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full text-left text-xs">
              <thead className="bg-surface/[0.03] text-xs font-bold text-foreground-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">Revision</th>
                    <th scope="col" className="px-4 py-3">Market</th>
                    <th scope="col" className="px-4 py-3">App</th>
                    <th scope="col" className="px-4 py-3">Reliability</th>
                    <th scope="col" className="px-4 py-3">Events</th>
                    <th scope="col" className="px-4 py-3">Marketing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {experienceBreakdown.slice(0, 20).map((row: any) => (
                    <tr key={`${row.manifest_id}-${row.manifest_revision}-${row.market_code}-${row.app_version}`} className="text-foreground-muted">
                      <td className="px-4 py-3 font-bold">{row.manifest_id} / {row.manifest_revision}</td>
                      <td className="px-4 py-3">{row.market_code}</td>
                      <td className="px-4 py-3">{row.app_version}</td>
                      <td className={cn('px-4 py-3 font-black', Number(row.reliability_failure_rate_pct) >= 10 ? 'text-error' : 'text-success')}>{row.reliability_failure_rate_pct}%</td>
                      <td className="px-4 py-3">{row.reliability_failures}/{row.reliability_total}</td>
                      <td className="px-4 py-3">{row.impressions}/{row.clicks}/{row.dismissals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="glass-card p-10 rounded-[48px] border-border space-y-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground-muted italic uppercase flex items-center gap-3">
              <Activity className="text-primary-light" size={24} aria-hidden="true" />
              Service KPI Health
            </h2>
            <p className="text-xs text-foreground-muted mt-2">Metrik dihitung dari fakta order, leg, proof, merchant, provider, dan finance pada window yang dipilih.</p>
          </div>
          <span className="text-xs font-black uppercase tracking-wide text-foreground-muted">{serviceKpiPayload?.window?.range || timeRange} • no-data = belum ada fakta</span>
        </div>
        {serviceKpisLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-48 rounded-3xl bg-surface-subtle animate-pulse" />)}
          </div>
        ) : serviceKpisError ? (
          <DataState
            title="Service KPI gagal dimuat"
            message={getQueryErrorMessage(serviceKpisQueryError, 'Metrik per layanan belum bisa diambil dari API analytics.')}
            onRetry={() => refetchServiceKpis()}
            tone="error"
          />
        ) : !hasRows(serviceKpiPayload?.services) ? (
          <DataState
            title="Belum ada service KPI"
            message="API analytics belum mengirim metrik per layanan untuk rentang waktu ini."
            onRetry={() => refetchServiceKpis()}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {serviceKpiPayload.services.map((service: any) => (
              <div key={service.service_category} className="rounded-3xl border border-border bg-surface/[0.02] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-foreground-muted">{serviceKpiLabels[service.service_category] || service.service_category}</p>
                    <p className="mt-1 text-xs font-bold text-foreground-muted">{service.sample_size.toLocaleString('id-ID')} order</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary-light">Server</span>
                </div>
                <div className="space-y-2">
                  {Object.entries(service.metrics || {}).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
                      <span className="text-xs font-bold capitalize text-foreground-muted">{serviceKpiMetricLabel(key)}</span>
                      <span className={cn('text-xs font-black text-right', value === null || value === undefined ? 'text-foreground-muted' : 'text-foreground-muted')}>
                        {formatServiceKpiMetric(key, value)}
                      </span>
                    </div>
                  ))}
                </div>
                {service.provider_mix?.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-bold text-foreground-muted">Provider mix</p>
                    <p className="mt-1 text-xs text-foreground-muted">{service.provider_mix.map((provider: any) => `${provider.provider} ${provider.share_pct ?? 'No data'}%`).join(' • ')}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SLA Compliance by Zone Line Chart */}
        <div className="lg:col-span-2 glass-card p-10 rounded-[48px] border-border space-y-8">
           <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-foreground-muted italic uppercase flex items-center gap-3">
                 <Target className="text-primary-light" size={24} aria-hidden="true" />
                 Zonal SLA Compliance
              </h2>
              <div className="flex gap-4">
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-xs font-black text-foreground-muted uppercase tracking-wide">South</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-success" />
                    <span className="text-xs font-black text-foreground-muted uppercase tracking-wide">Central</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-info" />
                    <span className="text-xs font-black text-foreground-muted uppercase tracking-wide">West</span>
                 </div>
              </div>
           </div>
           <div className="h-[350px] w-full" role="group" aria-label="Grafik persentase SLA per wilayah" aria-describedby="sla-chart-summary">
              <p id="sla-chart-summary" className="sr-only">Grafik SLA menampilkan perbandingan wilayah South, Central, dan West berdasarkan data analytics.</p>
              {slaLoading ? (
                <ChartSkeleton bars={7} />
              ) : slaError ? (
                <DataState
                  title="SLA gagal dimuat"
                  message={getQueryErrorMessage(slaQueryError, 'Data SLA belum bisa diambil dari API analytics.')}
                  onRetry={() => refetchSla()}
                  tone="error"
                />
              ) : !hasRows(slaData) ? (
                <DataState
                  title="Belum ada data SLA"
                  message="Database belum memiliki agregasi SLA untuk rentang waktu ini."
                  onRetry={() => refetchSla()}
                />
              ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                 <LineChart data={slaData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis 
                       dataKey="name" 
                       stroke="var(--color-foreground-muted)"
                       fontSize={12} 
                       tickLine={false} 
                       axisLine={false}
                       tickMargin={15}
                    />
                    <YAxis 
                       stroke="var(--color-foreground-muted)"
                       fontSize={10} 
                       tickLine={false} 
                       axisLine={false}
                       domain={[80, 100]}
                       tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                       contentStyle={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)', borderRadius: '16px', color: 'var(--color-foreground)' }}
                    />
                    <Line type="monotone" dataKey="south" stroke="var(--color-success)" strokeWidth={3} dot={{ fill: 'var(--color-success)' }} activeDot={{ r: 8 }} />
                    <Line type="monotone" dataKey="central" stroke="var(--color-primary-light)" strokeWidth={3} dot={{ fill: 'var(--color-primary-light)' }} />
                    <Line type="monotone" dataKey="west" stroke="var(--color-info)" strokeWidth={3} dot={{ fill: 'var(--color-info)' }} strokeDasharray="5 5" />
                 </LineChart>
              </ResponsiveContainer>
              )}
           </div>
        </div>

        {/* Heatmap Placeholder */}
        <div className="glass-card p-10 rounded-[48px] border-border space-y-8 relative overflow-hidden">
            <h2 className="text-xl font-black text-foreground-muted italic uppercase">Demand Density</h2>
            <div
              className="h-[400px] w-full bg-surface rounded-[32px] border border-border relative overflow-hidden"
              role="region"
              aria-label="Demand density map"
              aria-describedby="demand-density-map-summary"
            >
              <p id="demand-density-map-summary" className="sr-only">
                Demand density map. Operational status is also provided by the visible map status label and the data state message.
              </p>
              <MapContainer
                center={[-6.2088, 106.8456]}
                zoom={12}
                className="h-full w-full z-0"
                zoomControl={false}
                attributionControl={false}
              >
                <AttributionControl prefix={false} />
                <TileLayer
                  url={heatmapTileUrl}
                  attribution={heatmapTileAttribution}
                />
                <MapZoomControls label="Kontrol zoom demand density" />
                {hasRows(heatData) && <HeatLayer points={heatData} />}
              </MapContainer>
              {mapsRuntimeConfig?.active_provider === 'tomtom_maps' && !shouldRenderTomTomMap && (
                <TomTomRuntimeUnavailable message="TomTom Maps aktif, tetapi browser key runtime belum tersedia. Demand density memakai fallback map sementara." />
              )}
              {(heatError || !hasRows(heatData)) && (
                <div className="absolute inset-4 z-10 rounded-[28px] bg-scrim/70 backdrop-blur-md border border-border flex items-center justify-center p-6">
                  <DataState
                    title={heatError ? 'Heatmap gagal dimuat' : 'Belum ada heatmap'}
                    message={heatError ? getQueryErrorMessage(heatQueryError, 'Data demand density belum bisa diambil dari API analytics.') : 'Database belum memiliki titik demand density aktif.'}
                    onRetry={() => refetchHeat()}
                    tone={heatError ? 'error' : 'muted'}
                  />
                </div>
              )}
              <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
                <div className="px-3 py-1.5 rounded-lg bg-scrim/60 backdrop-blur-md border border-border text-xs font-black text-foreground-muted uppercase tracking-wide">
                  {hasRows(heatData) ? 'Live Courier Density' : 'Waiting for Database Points'}
                </div>
              </div>
           </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Dynamic Pricing Surge Analytics */}
        <div className="glass-card p-10 rounded-[48px] border-border space-y-8">
           <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-foreground-muted italic uppercase flex items-center gap-3">
                 <Zap className="text-warning" size={24} aria-hidden="true" />
                 Surge Intelligence
              </h2>
              <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">Peak Frequency vs Impact</p>
           </div>
          <div className="h-[350px] w-full" role="group" aria-label="Grafik frekuensi dan dampak surge" aria-describedby="surge-chart-summary">
              <p id="surge-chart-summary" className="sr-only">Grafik membandingkan frekuensi surge dan impact multiplier dari data pricing analytics.</p>
              {surgeLoading ? (
                <ChartSkeleton bars={10} />
              ) : surgeError ? (
                <DataState
                  title="Surge gagal dimuat"
                  message={getQueryErrorMessage(surgeQueryError, 'Data surge belum bisa diambil dari API analytics.')}
                  onRetry={() => refetchSurge()}
                  tone="error"
                />
              ) : !hasRows(surgeData) ? (
                <DataState
                  title="Belum ada data surge"
                  message="Database belum memiliki agregasi surge untuk rentang waktu ini."
                  onRetry={() => refetchSurge()}
                />
              ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                 <BarChart data={surgeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="time" stroke="var(--color-foreground-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke="var(--color-foreground-muted)" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fill: 'var(--color-foreground-muted)', fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="var(--color-foreground-muted)" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Impact Multiplier', angle: 90, position: 'insideRight', fill: 'var(--color-foreground-muted)', fontSize: 10 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)', borderRadius: '16px', color: 'var(--color-foreground)' }}
                      itemStyle={{ color: 'var(--color-foreground)' }}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    <Bar yAxisId="left" name="Frequency" dataKey="frequency" fill="var(--color-warning)" radius={[10, 10, 0, 0]} barSize={30} />
                    <Bar yAxisId="right" name="Impact" dataKey="impact" fill="var(--color-success)" radius={[10, 10, 0, 0]} barSize={30} />
                 </BarChart>
              </ResponsiveContainer>
              )}
           </div>
        </div>

        {/* Volumetric Accuracy Histogram */}
        <div className="glass-card p-10 rounded-[48px] border-border space-y-8">
           <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-foreground-muted italic uppercase flex items-center gap-3">
                 <Package className="text-primary-light" size={24}  aria-hidden="true"/>
                 Scan Reliability
              </h2>
              <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">Confidence Distribution</p>
           </div>
           <div className="h-[350px] w-full" role="group" aria-label="Histogram reliabilitas hasil scan" aria-describedby="accuracy-chart-summary">
              <p id="accuracy-chart-summary" className="sr-only">Histogram menampilkan distribusi confidence hasil scan dimensi.</p>
              {accuracyLoading ? (
                <ChartSkeleton bars={8} />
              ) : accuracyError ? (
                <DataState
                  title="Akurasi scan gagal dimuat"
                  message={getQueryErrorMessage(accuracyQueryError, 'Data scan reliability belum bisa diambil dari API analytics.')}
                  onRetry={() => refetchAccuracy()}
                  tone="error"
                />
              ) : !hasRows(accuracyData) ? (
                <DataState
                  title="Belum ada data scan"
                  message="Database belum memiliki distribusi confidence scan untuk rentang waktu ini."
                  onRetry={() => refetchAccuracy()}
                />
              ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                 <BarChart data={accuracyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="confidence" stroke="var(--color-foreground-muted)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-foreground-muted)" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)', borderRadius: '16px', color: 'var(--color-foreground)' }} />
                    <Bar dataKey="count" fill="var(--color-primary-light)" radius={[8, 8, 0, 0]} />
                 </BarChart>
              </ResponsiveContainer>
              )}
           </div>
        </div>
      </div>

      {/* Customer Retention Cohort Table */}
      <div className="glass-card p-10 rounded-[48px] border-border space-y-10">
         <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-foreground-muted italic uppercase">Retention Cohort</h2>
            <span className="px-4 py-2 rounded-full bg-primary/10 text-primary-light text-xs font-black uppercase tracking-wide">Retention Matrix %</span>
         </div>
         {retentionLoading ? (
           <div className="space-y-3">
             {[...Array(4)].map((_,i) => (
               <div key={i} className="h-12 w-full bg-surface-subtle animate-pulse rounded-xl" />
             ))}
           </div>
         ) : retentionError ? (
           <DataState
             title="Retention gagal dimuat"
             message={getQueryErrorMessage(retentionQueryError, 'Data retention cohort belum bisa diambil dari API analytics.')}
             onRetry={() => refetchRetention()}
             tone="error"
           />
         ) : !hasRows(retentionData) ? (
           <DataState
             title="Belum ada retention cohort"
             message="Database belum memiliki cohort retention untuk rentang waktu ini."
             onRetry={() => refetchRetention()}
           />
         ) : (
         <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-y-2">
               <thead>
                  <tr>
                     <th scope="col" className="pb-4 pl-4 text-xs font-black text-foreground-muted uppercase tracking-wide">Cohort</th>
                     <th scope="col" className="pb-4 text-xs font-black text-foreground-muted uppercase tracking-wide">Size</th>
                     {['M1', 'M2', 'M3', 'M4', 'M5'].map(m => (
                       <th scope="col" key={m} className="pb-4 text-center text-xs font-black text-foreground-muted uppercase tracking-wide">{m}</th>
                     ))}
                  </tr>
               </thead>
               <tbody className="divide-y divide-border">
                  {(retentionData || []).map((row: any, i: number) => (
                    <tr key={i} className="group hover:bg-surface/[0.01]">
                       <td className="py-6 pl-4 font-bold text-foreground-muted">{row.month}</td>
                       <td className="py-6 font-black text-foreground-muted text-xs">{row.size?.toLocaleString()}</td>
                       {[row.m1, row.m2, row.m3, row.m4, row.m5].map((val, idx) => (
                         <td key={idx} className="py-4 px-1">
                            {val !== undefined ? (
                              <div 
                                className="h-10 w-full rounded-lg flex items-center justify-center text-xs font-black text-foreground-secondary"
                                style={{ 
                                  backgroundColor: `rgba(0, 100, 55, ${val / 100})`,
                                  border: '1px solid rgba(255,255,255,0.05)'
                                }}
                              >
                                {val}%
                              </div>
                            ) : (
                              <div className="h-10 w-full rounded-lg bg-surface-subtle border border-dashed border-border" />
                            )}
                         </td>
                       ))}
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
         )}
      </div>

      {/* Scheduled Reports Management */}
      <div className="glass-card p-10 rounded-[48px] border-border space-y-10">
         <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-foreground-muted italic uppercase flex items-center gap-4">
               <Calendar className="text-foreground-muted" size={24} aria-hidden="true" />
               Scheduled Automation
            </h2>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-3 rounded-2xl bg-primary text-on-primary font-black text-xs uppercase tracking-wide hover:bg-primary-light transition-all flex items-center gap-2"
            >
              <Plus size={16} aria-hidden="true" />
              New Schedule
            </button>
         </div>

         {reportsLoading ? (
           <div className="flex items-center justify-center py-20">
             <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
           </div>
         ) : reportsError ? (
           <DataState
             title="Schedule report gagal dimuat"
             message={getQueryErrorMessage(reportsQueryError, 'Jadwal automation belum bisa diambil dari API analytics.')}
             onRetry={() => refetchReports()}
             tone="error"
           />
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(reports || []).map((report: any) => (
                <div key={report.id} className="p-8 rounded-[40px] bg-surface/[0.02] border border-border hover:border-border transition-all space-y-6 group">
                   <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-surface border border-border group-hover:border-primary/20 transition-all">
                         <HistoryIcon size={20} className="text-foreground-muted group-hover:text-primary-light" aria-hidden="true" />
                      </div>
                      <button type="button" aria-label={`Delete scheduled report ${report.name}`} title={`Delete scheduled report ${report.name}`}
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this schedule?')) {
                            deleteReport.mutate(report.id)
                          }
                        }}
                        className="p-2 rounded-lg bg-error-surface text-error opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                   </div>
                   <div>
                      <h3 className="font-bold text-foreground-muted">{report.name}</h3>
                      <div className="flex items-center gap-4 mt-2">
                         <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">{report.frequency}</p>
                         <div className="h-1 w-1 rounded-full bg-surface-raised" />
                         <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">{report.time_slot}</p>
                      </div>
                   </div>
                   <div className="flex items-center justify-between pt-4 border-t border-border">
                      <div className="flex items-center gap-2">
                         <Mail size={12} className="text-foreground-muted" aria-hidden="true" />
                         <span className="text-xs font-bold text-foreground-muted">{report.recipient_emails?.length} Recipients</span>
                      </div>
                      <button type="button" aria-label={`Open scheduled report ${report.name}`} title={`Open scheduled report ${report.name}`} className="p-2 text-foreground-muted hover:text-foreground-muted transition-colors">
                         <ChevronRight size={18} aria-hidden="true" />
                      </button>
                   </div>
                </div>
              ))}
              {reports?.length === 0 && (
                <div className="col-span-full py-20 text-center space-y-4">
                  <Calendar className="mx-auto text-foreground-muted" size={48} aria-hidden="true" />
                  <p className="text-foreground-muted font-bold uppercase tracking-wide text-xs">No active automation schedules</p>
                </div>
              )}
           </div>
         )}
      </div>

      <NewScheduleModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['analytics', 'reports'] })}
      />
    </div>
  )
}
