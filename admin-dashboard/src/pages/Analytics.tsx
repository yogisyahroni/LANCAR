import { useState } from 'react'
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
  Loader2
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
  Line
} from 'recharts'
import { cn } from '../lib/utils'

import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('7D')

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['analytics', 'kpis', timeRange],
    queryFn: () => api.get(`/admin/analytics/kpis?range=${timeRange}`).then(res => res.data)
  })

  const { data: slaData } = useQuery({
    queryKey: ['analytics', 'sla'],
    queryFn: () => api.get('/admin/analytics/sla').then(res => res.data)
  })

  const { data: surgeData } = useQuery({
    queryKey: ['analytics', 'surge'],
    queryFn: () => api.get('/admin/analytics/surge').then(res => res.data)
  })

  const { data: accuracyData } = useQuery({
    queryKey: ['analytics', 'accuracy'],
    queryFn: () => api.get('/admin/analytics/scan-accuracy').then(res => res.data)
  })

  const { data: retentionData } = useQuery({
    queryKey: ['analytics', 'retention'],
    queryFn: () => api.get('/admin/analytics/retention').then(res => res.data)
  })

  if (kpisLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const kpiItems = kpis || [
    { label: 'SLA Compliance', value: '92.4%', change: '+2.5%', up: true, icon: Target },
    { label: 'Demand Gap', value: '4.2%', change: '-1.2%', up: true, icon: Zap },
    { label: 'Active Couriers', value: '412', change: '-2.4%', up: false, icon: Users },
    { label: 'Avg. Delivery', value: '24m', change: '-4m', up: true, icon: Clock },
  ];

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
          <button className="p-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-all">
            <Download size={20} />
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {kpiItems.map((stat: any, i: number) => {
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
              </div>
           </div>
           <div className="h-[350px] w-full">
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
                    <Line type="monotone" dataKey="west" stroke="#18181b" strokeWidth={3} dot={{ fill: '#18181b' }} strokeDasharray="5 5" />
                 </LineChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* Heatmap Placeholder */}
        <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8 relative overflow-hidden">
           <h3 className="text-xl font-black text-zinc-100 italic uppercase">Demand Density</h3>
           <div className="h-full w-full bg-zinc-900 rounded-[32px] border border-white/5 relative flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(0,100,55,0.4),transparent_50%),radial-gradient(circle_at_70%_60%,rgba(16,185,129,0.3),transparent_50%),radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.2),transparent_40%)]" />
              <div className="relative z-10 text-center space-y-4">
                 <MapIcon className="mx-auto text-zinc-700" size={48} />
                 <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Live Geo-Heatmap</p>
                 <button className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all">
                    Initialize Map View
                 </button>
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
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Peak Hour Frequency</p>
           </div>
           <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={surgeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '16px' }} />
                    <Bar yAxisId="left" dataKey="frequency" fill="#f59e0b" radius={[10, 10, 0, 0]} barSize={40} />
                    <Bar yAxisId="right" dataKey="impact" fill="#006437" radius={[10, 10, 0, 0]} barSize={40} />
                 </BarChart>
              </ResponsiveContainer>
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
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={accuracyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="confidence" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '16px' }} />
                    <Bar dataKey="count" fill="#34d399" radius={[8, 8, 0, 0]} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* Customer Retention Cohort Table */}
      <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
         <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase">Retention Cohort</h3>
            <span className="px-4 py-2 rounded-full bg-primary/10 text-primary-light text-[10px] font-black uppercase tracking-widest">Retention Matrix %</span>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="border-b border-white/5">
                     <th className="pb-6 text-[10px] font-black text-zinc-600 uppercase tracking-widest">Cohort</th>
                     <th className="pb-6 text-[10px] font-black text-zinc-600 uppercase tracking-widest">Size</th>
                     {['M1', 'M2', 'M3', 'M4', 'M5'].map(m => (
                       <th key={m} className="pb-6 text-center text-[10px] font-black text-zinc-600 uppercase tracking-widest">{m}</th>
                     ))}
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {(retentionData || []).map((row: any, i: number) => (
                    <tr key={i} className="group hover:bg-white/[0.01]">
                       <td className="py-6 font-bold text-zinc-300">{row.month}</td>
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
      </div>

      {/* Scheduled Reports Management */}
      <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
         <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase flex items-center gap-4">
               <Calendar className="text-zinc-500" size={24} />
               Scheduled Automation
            </h3>
            <button className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light transition-all flex items-center gap-2">
               <Plus size={16} />
               New Schedule
            </button>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: 'Daily Ops Summary', freq: 'Daily', time: '06:00 AM', recipients: 4 },
              { name: 'Financial Audit', freq: 'Weekly', time: 'Mon, 08:00 AM', recipients: 2 },
              { name: 'SLA Compliance Report', freq: 'Monthly', time: '1st, 09:00 AM', recipients: 12 },
            ].map((report, i) => (
              <div key={i} className="p-8 rounded-[40px] bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all space-y-6">
                 <div className="flex items-start justify-between">
                    <div className="p-3 rounded-2xl bg-zinc-900 border border-white/5">
                       <HistoryIcon size={20} className="text-zinc-600" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-white/5 text-[9px] font-black uppercase text-zinc-500 tracking-widest">Active</span>
                 </div>
                 <div>
                    <h4 className="font-bold text-zinc-200">{report.name}</h4>
                    <div className="flex items-center gap-4 mt-2">
                       <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{report.freq}</p>
                       <div className="h-1 w-1 rounded-full bg-zinc-800" />
                       <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{report.time}</p>
                    </div>
                 </div>
                 <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex -space-x-2">
                       {[...Array(3)].map((_, j) => (
                         <div key={j} className="h-6 w-6 rounded-full bg-zinc-800 border-2 border-zinc-950 flex items-center justify-center text-[8px] font-bold text-zinc-500">
                            {j+1}
                         </div>
                       ))}
                       <div className="h-6 w-6 rounded-full bg-primary/20 border-2 border-zinc-950 flex items-center justify-center text-[8px] font-black text-primary-light">
                          +{report.recipients - 3}
                       </div>
                    </div>
                    <button className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors">
                       <ChevronRight size={18} />
                    </button>
                 </div>
              </div>
            ))}
         </div>
      </div>
    </div>
  )
}
