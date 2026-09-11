import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Link } from 'react-router'
import { 
  TrendingUp, 
  Package, 
  Truck, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Clock,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Zap
} from 'lucide-react'
import { cn } from '../lib/utils'
import { RevenueChart, OrderDistributionChart } from '../components/Charts'
import LiveMap from '../components/LiveMap'
import { StatusBadge } from '../components/StatusBadge'

const StatCard = ({ title, value, change, icon: Icon, trend, loading }: any) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="glass-card p-6 rounded-2xl relative overflow-hidden group"
  >
    <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
      <Icon size={80} aria-hidden="true" />
    </div>
    <div className="flex items-center justify-between mb-4">
      <div className="p-2 rounded-lg bg-primary/10 text-primary-light">
        <Icon size={24} aria-hidden="true" />
      </div>
      {!loading && change !== undefined && (
        <div className={cn(
          "flex items-center text-xs font-medium px-2 py-1 rounded-full",
          trend === 'up' ? "bg-success-surface text-success" : "bg-error-surface text-error"
        )}>
          {trend === 'up' ? <ArrowUpRight size={14} className="mr-1" aria-hidden="true" /> : <ArrowDownRight size={14} className="mr-1" aria-hidden="true" />}
          {change}
        </div>
      )}
    </div>
    <p className="text-foreground-muted text-sm mb-1">{title}</p>
    {loading ? (
      <div className="h-8 w-24 bg-surface-subtle animate-pulse rounded-lg" />
    ) : (
      <p className="text-2xl font-bold text-foreground-muted">{value}</p>
    )}
  </motion.div>
)

const formatPercentChange = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return `${parsed > 0 ? '+' : ''}${parsed}%`
}

const healthItems = (health: any) => {
  if (Array.isArray(health?.components)) {
    return health.components.map((component: any) => {
      const normalized = String(component.status || '').toLowerCase()
      const isUp = ['ready', 'healthy', 'live', 'writable'].includes(normalized)
      const isDown = normalized === 'error'
      return {
        label: component.label,
        status: component.status || 'Unknown',
        color: isUp ? 'bg-success' : isDown ? 'bg-error' : 'bg-warning'
      }
    })
  }
  return []
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/dashboard/stats')
      return res.data
    },
    refetchInterval: 30000 // Refetch every 30s
  })

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['dashboard-events'],
    queryFn: async () => {
      const res = await api.get('/admin/dashboard/events')
      return res.data
    }
  })

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await api.get('/admin/health')
      return res.data
    }
  })

  const { data: revenueData } = useQuery({
    queryKey: ['revenue-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/stats')
      return res.data.model_breakdown?.map((item: any) => ({
        service_type: 'P2P',
        orders: parseInt(item.count),
        revenue: parseInt(item.revenue)
      })) || []
    }
  })

  const activeCourierCount = Number(stats?.active_couriers ?? 0)
  const hasActiveCourier = activeCourierCount > 0

  return (
    <div className="space-y-8 animate-in max-w-[1600px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground-muted tracking-tight">System Overview</h1>
          <p className="text-foreground-muted flex items-center gap-2 mt-1">
            <Activity className="h-4 w-4 text-primary-light" aria-hidden="true" />
            Live data from Jakarta Logistics Hub
          </p>
        </div>
        <div className="flex items-center gap-3 bg-surface-subtle p-1 rounded-xl border border-border">
          <button 
            onClick={() => refetchStats()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg shadow-lg shadow-primary/20 transition-all hover:brightness-110 active:scale-95"
          >
            <RefreshCw size={14} className={cn(statsLoading && "animate-spin")} aria-hidden="true" />
            Real-time
          </button>
          <button className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground-muted transition-all">Historical</button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Daily Orders"
          value={stats?.total_orders_today?.toLocaleString() ?? 'No data'}
          change={formatPercentChange(stats?.orders_growth)}
          trend={stats?.orders_growth >= 0 ? 'up' : 'down'}
          icon={Package}
          loading={statsLoading}
        />
        <StatCard
          title="Revenue"
          value={`Rp ${(stats?.revenue_today / 1000000 || 0).toFixed(1)}M`}
          change={formatPercentChange(stats?.revenue_growth)}
          trend={stats?.revenue_growth >= 0 ? 'up' : 'down'}
          icon={TrendingUp}
          loading={statsLoading}
        />
        <StatCard
          title="Active Couriers"
          value={stats?.active_couriers ?? 'No data'}
          change={formatPercentChange(stats?.courier_growth)}
          trend={stats?.courier_growth >= 0 ? 'up' : 'down'}
          icon={Truck}
          loading={statsLoading}
        />
        <StatCard
          title="SLA Compliance"
          value={stats?.sla_compliance === null || stats?.sla_compliance === undefined ? 'No data' : `${stats.sla_compliance}%`}
          change={formatPercentChange(stats?.sla_growth)}
          trend={stats?.sla_growth >= 0 ? 'up' : 'down'}
          icon={Clock}
          loading={statsLoading}
        />
      </div>

      {/* Main Grid: Map & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Live Operations Map */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="glass-card rounded-3xl overflow-hidden h-[500px] relative">
            <div className="absolute top-6 left-6 z-[1000] flex items-center gap-2">
              <div className="glass-card px-4 py-2 rounded-xl border-border flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  hasActiveCourier ? "bg-primary-light animate-ping" : "bg-surface-subtle"
                )} />
                <span className="text-xs font-bold tracking-wider uppercase">
                  {hasActiveCourier ? 'Live Tracking' : 'Tracking Standby'}
                </span>
              </div>
            </div>
            <LiveMap />
          </div>
        </div>

        {/* Right Sidebar: Activity & Distribution */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-card p-6 rounded-3xl flex-1">
            <h2 className="font-bold text-foreground-muted flex items-center gap-2 mb-6">
              <Zap className="h-4 w-4 text-primary-light" aria-hidden="true" />
              Service Performance
            </h2>
            <OrderDistributionChart data={revenueData?.map((d: any) => ({ name: d.service_type, value: d.orders }))} />
          </div>
          
          <div className="glass-card p-6 rounded-3xl">
            <h2 className="font-bold text-foreground-muted mb-6 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary-light" aria-hidden="true" />
              System Health
            </h2>
            <div className="space-y-4">
              {healthLoading ? (
                Array(4).fill(0).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="h-4 w-24 bg-surface-subtle animate-pulse rounded" />
                    <div className="h-4 w-12 bg-surface-subtle animate-pulse rounded" />
                  </div>
                ))
              ) : (
                healthItems(health).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-foreground-muted">{item.label}</span>
                    <StatusBadge status={item.status} labelPrefix={`${item.label} status`} className="text-xs" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Revenue Trend & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-8">
        <div className="lg:col-span-8 glass-card p-8 rounded-3xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-foreground-muted">Revenue Velocity</h2>
              <p className="text-sm text-foreground-muted">Actual revenue breakdown by service</p>
            </div>
            <div className="flex items-center gap-2 text-primary-light text-sm font-bold bg-primary/10 px-3 py-1 rounded-lg">
              <TrendingUp size={16}  aria-hidden="true"/>
              {formatPercentChange(stats?.revenue_growth) || 'No comparison'}
            </div>
          </div>
          <RevenueChart data={revenueData?.map((d: any) => ({ name: d.service_type, value: d.revenue / 1000 }))} />
        </div>

        <div className="lg:col-span-4 glass-card p-8 rounded-3xl flex flex-col">
          <h2 className="text-xl font-bold text-foreground-muted mb-6 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary-light" aria-hidden="true" />
            Recent Events
          </h2>
          <div className="space-y-6 flex-1 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
            {eventsLoading ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-10 w-10 bg-surface-subtle animate-pulse rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-full bg-surface-subtle animate-pulse rounded" />
                    <div className="h-3 w-1/4 bg-surface-subtle animate-pulse rounded" />
                  </div>
                </div>
              ))
            ) : events?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-foreground-muted">
                <AlertCircle size={40} className="mb-4 opacity-20" aria-hidden="true" />
                <p>No recent events</p>
              </div>
            ) : (
              events?.map((item: any, i: number) => (
                <div key={i} className="flex gap-4 relative group cursor-pointer">
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                    item.type === 'system' ? "bg-warning-surface text-warning" : "bg-primary/10 text-primary-light"
                  )}>
                    {item.type === 'order' ? <Package size={18} aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-foreground-muted">{item.title}</p>
                      <p className="text-xs text-foreground-muted uppercase">{item.type}</p>
                    </div>
                    <p className="text-xs text-foreground-muted mt-0.5 line-clamp-1" title={item.description}>{item.description}</p>
                    <p className="text-xs text-foreground-muted mt-1">{new Date(item.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <Link 
            to="/audit-logs"
            className="w-full mt-8 py-3 rounded-xl border border-border text-sm font-medium text-center text-foreground-muted hover:bg-surface-subtle hover:text-foreground transition-all active:scale-[0.98]"
          >
            View All Activity
          </Link>
        </div>
      </div>
    </div>
  )
}
