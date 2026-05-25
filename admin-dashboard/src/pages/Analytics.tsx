import { useState, useEffect } from 'react'
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
  RefreshCw
} from 'lucide-react'
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
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
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
      console.warn('L.heatLayer is not available');
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
      console.error('Heatmap layer failed:', e);
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg glass-card p-8 rounded-[40px] border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-emerald-500" />
            
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-zinc-100 italic uppercase tracking-tight">Schedule Report</h2>
              <button onClick={onClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white transition-all">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Report Name</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Weekly SLA Summary"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-all"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Frequency</label>
                  <select 
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-zinc-200 focus:outline-none focus:border-primary/50 transition-all appearance-none"
                    value={formData.frequency}
                    onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                  >
                    <option value="Daily" className="bg-zinc-900 text-zinc-200">Daily</option>
                    <option value="Weekly" className="bg-zinc-900 text-zinc-200">Weekly</option>
                    <option value="Monthly" className="bg-zinc-900 text-zinc-200">Monthly</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Time (UTC)</label>
                  <input 
                    type="time"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-zinc-200 focus:outline-none focus:border-primary/50 transition-all"
                    value={formData.time_slot}
                    onChange={e => setFormData({ ...formData, time_slot: e.target.value })}
                  />
                </div>
              </div>

              {formData.frequency === 'Weekly' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Preferred Day</label>
                  <select 
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-zinc-200 focus:outline-none focus:border-primary/50 transition-all appearance-none"
                    value={formData.day_of_week}
                    onChange={e => setFormData({ ...formData, day_of_week: e.target.value })}
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                      <option key={d} value={d} className="bg-zinc-900 text-zinc-200">{d}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Recipients (Comma Separated)</label>
                <textarea 
                  required
                  placeholder="admin@lancar.com, analyst@lancar.com"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-all min-h-[100px]"
                  value={formData.recipient_emails}
                  onChange={e => setFormData({ ...formData, recipient_emails: e.target.value })}
                />
              </div>

              <div className="pt-4">
                <button 
                  disabled={mutation.isPending}
                  className="w-full py-5 rounded-2xl bg-primary hover:bg-primary-light text-white font-black uppercase tracking-widest shadow-xl shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {mutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                  Confirm Schedule
                </button>
              </div>
            </form>
          </motion.div>
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
      isError ? "bg-red-500/5 border-red-500/20" : "bg-white/[0.02] border-dashed border-white/10"
    )}>
      <AlertCircle className={cn("w-10 h-10", isError ? "text-red-400" : "text-zinc-700")} />
      <div>
        <p className="text-sm font-black uppercase tracking-widest text-zinc-200">{title}</p>
        <p className="text-xs text-zinc-600 mt-2 max-w-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-2 px-5 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
            isError ? "bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
          )}
        >
          <RefreshCw size={14} />
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
          className="flex-1 bg-white/5 animate-pulse rounded-t-lg"
          style={{ height: `${35 + ((i * 17) % 55)}%` }}
        />
      ))}
    </div>
  )
}

const hasRows = (data: unknown) => Array.isArray(data) && data.length > 0

// --- Main Component ---

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('7D')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: kpis, isLoading: kpisLoading, isError: kpisError, error: kpisQueryError, refetch: refetchKpis } = useQuery({
    queryKey: ['analytics', 'kpis', timeRange],
    queryFn: () => api.get(`/admin/analytics/kpis?range=${timeRange}`).then(res => res.data)
  })

  const { data: slaData, isLoading: slaLoading, isError: slaError, error: slaQueryError, refetch: refetchSla } = useQuery({
    queryKey: ['analytics', 'sla', timeRange],
    queryFn: () => api.get(`/admin/analytics/sla?range=${timeRange}`).then(res => res.data)
  })

  const { data: surgeData, isLoading: surgeLoading, isError: surgeError, error: surgeQueryError, refetch: refetchSurge } = useQuery({
    queryKey: ['analytics', 'surge', timeRange],
    queryFn: () => api.get(`/admin/analytics/surge?range=${timeRange}`).then(res => res.data)
  })

  const { data: accuracyData, isLoading: accuracyLoading, isError: accuracyError, error: accuracyQueryError, refetch: refetchAccuracy } = useQuery({
    queryKey: ['analytics', 'accuracy', timeRange],
    queryFn: () => api.get(`/admin/analytics/scan-accuracy?range=${timeRange}`).then(res => res.data)
  })

  const { data: retentionData, isLoading: retentionLoading, isError: retentionError, error: retentionQueryError, refetch: refetchRetention } = useQuery({
    queryKey: ['analytics', 'retention', timeRange],
    queryFn: () => api.get(`/admin/analytics/retention?range=${timeRange}`).then(res => res.data)
  })

  const { data: heatData, isError: heatError, error: heatQueryError, refetch: refetchHeat } = useQuery({
    queryKey: ['analytics', 'heat'],
    queryFn: () => api.get('/admin/analytics/heat-data').then(res => res.data),
    refetchInterval: 30000 // Refresh every 30s
  })


  const { data: reports, isLoading: reportsLoading, isError: reportsError, error: reportsQueryError, refetch: refetchReports } = useQuery({
    queryKey: ['analytics', 'reports'],
    queryFn: () => api.get('/admin/analytics/reports').then(res => res.data)
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
      link.setAttribute('download', `lancar-analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Data exported successfully', { id: toastId })
    } catch (err) {
      toast.error('Export failed. Please try again.', { id: toastId })
    }
  }

  if (kpisLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const kpiItems = Array.isArray(kpis) ? kpis : [];

  return (
    <div className="space-y-10 animate-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">Business Intelligence</h1>
          <p className="text-zinc-500 mt-1">Real-time performance metrics and predictive analytics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            {['24H', '7D', '30D', '1Y'].map(r => (
              <button 
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  timeRange === r ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-zinc-600 hover:text-zinc-300"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <button 
            onClick={exportAnalytics}
            className="p-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-all"
          >
            <Download size={20} />
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
            <div key={i} className="glass-card p-8 rounded-[40px] border-white/5 group hover:border-white/10 transition-all">
               <div className="flex items-start justify-between">
                  <div className="p-3 rounded-2xl bg-white/5 text-zinc-500 group-hover:text-primary-light transition-colors">
                     <Icon size={24} />
                  </div>
                  <div className={cn(
                    "flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full",
                    stat.up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  )}>
                     {stat.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                     {stat.change}
                  </div>
               </div>
               <div className="mt-6">
                  <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                  <p className="text-3xl font-black text-zinc-100 mt-1 tracking-tighter">{stat.value}</p>
               </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SLA Compliance by Zone Line Chart */}
        <div className="lg:col-span-2 glass-card p-10 rounded-[48px] border-white/5 space-y-8">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
                 <Target className="text-primary-light" size={24} />
                 Zonal SLA Compliance
              </h3>
              <div className="flex gap-4">
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">South</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Central</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-violet-400" />
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">West</span>
                 </div>
              </div>
           </div>
           <div className="h-[350px] w-full">
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
              <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={slaData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis 
                       dataKey="name" 
                       stroke="#52525b" 
                       fontSize={12} 
                       tickLine={false} 
                       axisLine={false}
                       tickMargin={15}
                    />
                    <YAxis 
                       stroke="#52525b" 
                       fontSize={10} 
                       tickLine={false} 
                       axisLine={false}
                       domain={[80, 100]}
                       tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '16px' }}
                    />
                    <Line type="monotone" dataKey="south" stroke="#006437" strokeWidth={3} dot={{ fill: '#006437' }} activeDot={{ r: 8 }} />
                    <Line type="monotone" dataKey="central" stroke="#34d399" strokeWidth={3} dot={{ fill: '#34d399' }} />
                    <Line type="monotone" dataKey="west" stroke="#a78bfa" strokeWidth={3} dot={{ fill: '#a78bfa' }} strokeDasharray="5 5" />
                 </LineChart>
              </ResponsiveContainer>
              )}
           </div>
        </div>

        {/* Heatmap Placeholder */}
        <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8 relative overflow-hidden">
           <h3 className="text-xl font-black text-zinc-100 italic uppercase">Demand Density</h3>
           <div className="h-[400px] w-full bg-zinc-900 rounded-[32px] border border-white/5 relative overflow-hidden">
              <MapContainer 
                center={[-6.2088, 106.8456]} 
                zoom={12} 
                className="h-full w-full z-0"
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                />
                {hasRows(heatData) && <HeatLayer points={heatData} />}
              </MapContainer>
              {(heatError || !hasRows(heatData)) && (
                <div className="absolute inset-4 z-10 rounded-[28px] bg-black/70 backdrop-blur-md border border-white/10 flex items-center justify-center p-6">
                  <DataState
                    title={heatError ? 'Heatmap gagal dimuat' : 'Belum ada heatmap'}
                    message={heatError ? getQueryErrorMessage(heatQueryError, 'Data demand density belum bisa diambil dari API analytics.') : 'Database belum memiliki titik demand density aktif.'}
                    onRetry={() => refetchHeat()}
                    tone={heatError ? 'error' : 'muted'}
                  />
                </div>
              )}
              <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
                <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                  {hasRows(heatData) ? 'Live Courier Density' : 'Waiting for Database Points'}
                </div>
              </div>
           </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Dynamic Pricing Surge Analytics */}
        <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
                 <Zap className="text-amber-400" size={24} />
                 Surge Intelligence
              </h3>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Peak Frequency vs Impact</p>
           </div>
          <div className="h-[350px] w-full">
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
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={surgeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fill: '#52525b', fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Impact Multiplier', angle: 90, position: 'insideRight', fill: '#52525b', fontSize: 10 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '16px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend verticalAlign="top" height={36}/>
                    <Bar yAxisId="left" name="Frequency" dataKey="frequency" fill="#f59e0b" radius={[10, 10, 0, 0]} barSize={30} />
                    <Bar yAxisId="right" name="Impact" dataKey="impact" fill="#006437" radius={[10, 10, 0, 0]} barSize={30} />
                 </BarChart>
              </ResponsiveContainer>
              )}
           </div>
        </div>

        {/* Volumetric Accuracy Histogram */}
        <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
                 <Package className="text-primary-light" size={24} />
                 Scan Reliability
              </h3>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Confidence Distribution</p>
           </div>
           <div className="h-[350px] w-full">
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
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={accuracyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="confidence" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '16px' }} />
                    <Bar dataKey="count" fill="#34d399" radius={[8, 8, 0, 0]} />
                 </BarChart>
              </ResponsiveContainer>
              )}
           </div>
        </div>
      </div>

      {/* Customer Retention Cohort Table */}
      <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
         <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase">Retention Cohort</h3>
            <span className="px-4 py-2 rounded-full bg-primary/10 text-primary-light text-[10px] font-black uppercase tracking-widest">Retention Matrix %</span>
         </div>
         {retentionLoading ? (
           <div className="space-y-3">
             {[...Array(4)].map((_,i) => (
               <div key={i} className="h-12 w-full bg-white/5 animate-pulse rounded-xl" />
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
                     <th className="pb-4 pl-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest">Cohort</th>
                     <th className="pb-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest">Size</th>
                     {['M1', 'M2', 'M3', 'M4', 'M5'].map(m => (
                       <th key={m} className="pb-4 text-center text-[10px] font-black text-zinc-600 uppercase tracking-widest">{m}</th>
                     ))}
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {(retentionData || []).map((row: any, i: number) => (
                    <tr key={i} className="group hover:bg-white/[0.01]">
                       <td className="py-6 pl-4 font-bold text-zinc-300">{row.month}</td>
                       <td className="py-6 font-black text-zinc-500 text-xs">{row.size?.toLocaleString()}</td>
                       {[row.m1, row.m2, row.m3, row.m4, row.m5].map((val, idx) => (
                         <td key={idx} className="py-4 px-1">
                            {val !== undefined ? (
                              <div 
                                className="h-10 w-full rounded-lg flex items-center justify-center text-xs font-black text-white/80"
                                style={{ 
                                  backgroundColor: `rgba(0, 100, 55, ${val / 100})`,
                                  border: '1px solid rgba(255,255,255,0.05)'
                                }}
                              >
                                {val}%
                              </div>
                            ) : (
                              <div className="h-10 w-full rounded-lg bg-zinc-900/50 border border-dashed border-white/5" />
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
      <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
         <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase flex items-center gap-4">
               <Calendar className="text-zinc-500" size={24} />
               Scheduled Automation
            </h3>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light transition-all flex items-center gap-2"
            >
              <Plus size={16} />
              New Schedule
            </button>
         </div>

         {reportsLoading ? (
           <div className="flex items-center justify-center py-20">
             <Loader2 className="w-8 h-8 text-primary animate-spin" />
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
                <div key={report.id} className="p-8 rounded-[40px] bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all space-y-6 group">
                   <div className="flex items-start justify-between">
                      <div className="p-3 rounded-2xl bg-zinc-900 border border-white/5 group-hover:border-primary/20 transition-all">
                         <HistoryIcon size={20} className="text-zinc-600 group-hover:text-primary-light" />
                      </div>
                      <button 
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this schedule?')) {
                            deleteReport.mutate(report.id)
                          }
                        }}
                        className="p-2 rounded-lg bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                   </div>
                   <div>
                      <h4 className="font-bold text-zinc-200">{report.name}</h4>
                      <div className="flex items-center gap-4 mt-2">
                         <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{report.frequency}</p>
                         <div className="h-1 w-1 rounded-full bg-zinc-800" />
                         <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{report.time_slot}</p>
                      </div>
                   </div>
                   <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2">
                         <Mail size={12} className="text-zinc-600" />
                         <span className="text-[10px] font-bold text-zinc-500">{report.recipient_emails?.length} Recipients</span>
                      </div>
                      <button className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors">
                         <ChevronRight size={18} />
                      </button>
                   </div>
                </div>
              ))}
              {reports?.length === 0 && (
                <div className="col-span-full py-20 text-center space-y-4">
                  <Calendar className="mx-auto text-zinc-800" size={48} />
                  <p className="text-zinc-600 font-bold uppercase tracking-[0.2em] text-xs">No active automation schedules</p>
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
