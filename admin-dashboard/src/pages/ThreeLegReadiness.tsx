import { motion } from 'framer-motion'
import { 
  Target, ArrowLeft, ChevronRight, CheckCircle2, XCircle, AlertCircle,
  TrendingUp, Map, Users, Package, Calendar, Lock, Loader2, RefreshCw
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MetricItem {
  title: string
  current: number
  target: number
  unit: string
  description: string
}

interface ZoneItem {
  zone: string
  courier: number
  ready: boolean
}

interface ReadinessData {
  metrics: MetricItem[]
  zones: ZoneItem[]
  overall_ready: boolean
  can_activate: boolean
  estimated_ready_in_weeks: number | null
}

interface ReadinessResponse {
  readiness_data: ReadinessData
  overall_ready: boolean
  can_activate: boolean
  estimated_ready_in_weeks: number | null
  last_updated: string
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const MetricSkeleton = () => (
  <div className="glass-card p-8 rounded-[32px] border-white/5 animate-pulse space-y-6">
    <div className="flex justify-between">
      <div className="h-16 w-16 rounded-2xl bg-white/5" />
      <div className="h-8 w-24 rounded-xl bg-white/5" />
    </div>
    <div className="h-6 w-2/3 bg-white/5 rounded-lg" />
    <div className="h-4 w-full bg-white/5 rounded-lg" />
    <div className="h-3 w-full bg-white/5 rounded-full" />
  </div>
)

// ─── Metric Card ─────────────────────────────────────────────────────────────
const ICONS: Record<string, any> = { TrendingUp, Users, Package, Map }

const MetricCard = ({ metric }: { metric: MetricItem }) => {
  const status = metric.current >= metric.target ? 'met' : 'not-ready'
  const pct = Math.min((metric.current / metric.target) * 100, 100)
  const IconComp = ICONS[metric.title === 'SLA Stability' ? 'TrendingUp' : metric.title === 'Courier Density' ? 'Users' : 'Package']

  return (
    <div className="glass-card p-8 rounded-[32px] border-white/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        {IconComp && <IconComp size={120} />}
      </div>
      <div className="flex items-start justify-between mb-8">
        <div className="p-4 rounded-2xl bg-primary/10 text-primary-light">
          {IconComp && <IconComp size={32} />}
        </div>
        <div className={cn(
          "px-4 py-2 rounded-xl text-xs font-bold tracking-widest uppercase flex items-center gap-2",
          status === 'met'
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : "bg-red-500/10 text-red-400 border border-red-500/20"
        )}>
          {status === 'met' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {status === 'met' ? 'Target Met' : 'Not Ready'}
        </div>
      </div>

      <h3 className="text-xl font-bold text-zinc-100 mb-2">{metric.title}</h3>
      <p className="text-sm text-zinc-500 mb-8 max-w-[280px]">{metric.description}</p>

      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-zinc-600 uppercase font-bold tracking-wider mb-1">Current</p>
            <p className="text-3xl font-black text-zinc-100">
              {metric.current}
              <span className="text-sm font-medium text-zinc-500 ml-1">{metric.unit}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-600 uppercase font-bold tracking-wider mb-1">Goal</p>
            <p className="text-lg font-bold text-zinc-400">{metric.target}{metric.unit}</p>
          </div>
        </div>

        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className={cn(
              "h-full rounded-full shadow-[0_0_15px_rgba(34,197,94,0.3)]",
              status === 'met' ? "bg-primary-light" : "bg-amber-500"
            )}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ThreeLegReadiness() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ReadinessResponse>({
    queryKey: ['three-legs-readiness'],
    queryFn: async () => {
      const res = await api.get('/admin/feature-flags/readiness/three-legs')
      return res.data
    },
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min (backend caches 5 min too)
    staleTime: 4 * 60 * 1000
  })

  const readinessData: ReadinessData | null = data?.readiness_data ?? null
  const canActivate = data?.can_activate ?? false
  const overallReady = data?.overall_ready ?? false
  const lastUpdated = data?.last_updated ? new Date(data.last_updated) : null

  // Fallback default metrics jika backend tidak mengembalikan field yang diharapkan
  const metrics: MetricItem[] = readinessData?.metrics ?? [
    { title: 'SLA Stability', current: 0, target: 93, unit: '%', description: 'Average 2-Kaki SLA over the last 4 weeks.' },
    { title: 'Courier Density', current: 0, target: 30, unit: ' Avg', description: 'Minimum courier count per key operational zone.' },
    { title: 'Daily Volume', current: 0, target: 200, unit: ' Ord', description: 'Minimum total daily orders for relay routes.' },
  ]
  const zones: ZoneItem[] = readinessData?.zones ?? []

  return (
    <div className="max-w-7xl mx-auto space-y-12 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <Link to="/feature-flags">
            <button className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all">
              <ArrowLeft size={24} />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Target className="h-6 w-6 text-primary-light" />
              <h1 className="text-4xl font-black text-zinc-100 tracking-tighter uppercase">3-Leg Readiness</h1>
            </div>
            <p className="text-zinc-500 font-medium">Strategic checklist for multi-hop relay activation</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-all disabled:opacity-40"
              title="Refresh data"
            >
              <RefreshCw size={16} className={cn(isFetching && 'animate-spin')} />
            </button>
            {lastUpdated && (
              <div className="flex items-center gap-2 text-zinc-400 text-sm font-bold">
                <Calendar size={16} />
                Updated {lastUpdated.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <div className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className={cn(
              "w-2.5 h-2.5 rounded-full",
              overallReady ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-pulse"
            )} />
            <span className="text-sm font-black text-zinc-100 uppercase tracking-widest">
              {overallReady ? 'Ready for Launch' : 'Ineligible for Launch'}
            </span>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[...Array(3)].map((_, i) => <MetricSkeleton key={i} />)}
        </div>
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <div className="glass-card p-12 rounded-[40px] border-red-500/20 bg-red-500/5 text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-zinc-100 mb-2">Failed to load readiness data</h3>
          <p className="text-zinc-500 text-sm mb-6">Materialized view may not have been refreshed yet.</p>
          <button
            onClick={() => refetch()}
            className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:scale-[1.02] transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Metrics Grid */}
      {!isLoading && !isError && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {metrics.map((metric, i) => (
              <motion.div
                key={metric.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <MetricCard metric={metric} />
              </motion.div>
            ))}
          </div>

          {/* Zone Readiness */}
          {zones.length > 0 && (
            <div className="glass-card p-10 rounded-[40px] border-white/5">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100">Zone-Specific Readiness</h2>
                  <p className="text-zinc-500 mt-1">Multi-hop depends on dense courier coverage in every relay node.</p>
                </div>
                <button className="px-6 py-3 rounded-2xl border border-white/10 text-sm font-bold hover:bg-white/5 transition-all flex items-center gap-2 text-zinc-400">
                  <Map size={18} />
                  View Heatmap
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {zones.map((z, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.07 }}
                    className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">{z.zone}</p>
                      {z.ready
                        ? <CheckCircle2 size={16} className="text-emerald-500" />
                        : <AlertCircle size={16} className="text-amber-500" />}
                    </div>
                    <p className="text-2xl font-bold text-zinc-100">{z.courier}</p>
                    <p className="text-xs text-zinc-500 mt-1">Active Couriers</p>
                    <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full", z.ready ? "bg-emerald-500" : "bg-amber-500")}
                        style={{ width: `${Math.min((z.courier / 30) * 100, 100)}%` }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="p-10 rounded-[40px] bg-primary/5 border border-primary/10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500">
                <Lock size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-100 italic">Launch Override Protected</h3>
                <p className="text-zinc-500 max-w-md">
                  Activation is strictly blocked until all primary gates are green.
                  {data?.estimated_ready_in_weeks
                    ? ` Estimated ready in ~${data.estimated_ready_in_weeks} weeks.`
                    : ' Manual override requires CEO & CTO approval signatures.'}
                </p>
              </div>
            </div>
            <Link to="/feature-flags">
              <button
                disabled={!canActivate}
                className={cn(
                  "px-10 py-5 rounded-3xl font-black uppercase tracking-[0.2em] flex items-center gap-3 transition-all",
                  canActivate
                    ? "bg-primary text-white shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50"
                )}
              >
                {canActivate ? 'Enable 3-Leg Relay' : 'Launch 3-Leg Relay'}
                <ChevronRight size={20} />
              </button>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
