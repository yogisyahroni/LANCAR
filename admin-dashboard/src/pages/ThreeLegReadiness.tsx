import { motion } from 'framer-motion'
import { 
  Target, 
  ArrowLeft, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  TrendingUp,
  Map,
  Users,
  Package,
  Calendar,
  Lock
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/utils'

const MetricCard = ({ title, status, current, target, unit, icon: Icon, description }: any) => (
  <div className="glass-card p-8 rounded-[32px] border-white/5 relative overflow-hidden group">
    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
      <Icon size={120} />
    </div>
    <div className="flex items-start justify-between mb-8">
      <div className="p-4 rounded-2xl bg-primary/10 text-primary-light">
        <Icon size={32} />
      </div>
      <div className={cn(
        "px-4 py-2 rounded-xl text-xs font-bold tracking-widest uppercase flex items-center gap-2",
        status === 'met' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
      )}>
        {status === 'met' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        {status === 'met' ? 'Target Met' : 'Not Ready'}
      </div>
    </div>
    
    <h3 className="text-xl font-bold text-zinc-100 mb-2">{title}</h3>
    <p className="text-sm text-zinc-500 mb-8 max-w-[280px]">{description}</p>

    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-zinc-600 uppercase font-bold tracking-wider mb-1">Current</p>
          <p className="text-3xl font-black text-zinc-100">{current}<span className="text-sm font-medium text-zinc-500 ml-1">{unit}</span></p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-600 uppercase font-bold tracking-wider mb-1">Goal</p>
          <p className="text-lg font-bold text-zinc-400">{target}{unit}</p>
        </div>
      </div>
      
      <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min((current/target) * 100, 100)}%` }}
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

export default function ThreeLegReadiness() {
  return (
    <div className="max-w-7xl mx-auto space-y-12 animate-in">
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
        
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2 text-zinc-400 text-sm font-bold mb-2">
            <Calendar size={16} />
            Updated Today, 09:41 WIB
          </div>
          <div className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm font-black text-zinc-100 uppercase tracking-widest">Ineligible for Launch</span>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <MetricCard 
          title="SLA Stability"
          description="Average 2-Kaki SLA over the last 4 weeks. High stability is required."
          status="not-ready"
          current={87.3}
          target={93.0}
          unit="%"
          icon={TrendingUp}
        />
        <MetricCard 
          title="Courier Density"
          description="Minimum courier count per key operational zone to support relays."
          status="not-ready"
          current={24}
          target={30}
          unit=" Avg"
          icon={Users}
        />
        <MetricCard 
          title="Daily Volume"
          description="Minimum total daily orders to ensure economical relay routes."
          status="met"
          current={212}
          target={200}
          unit=" Ord"
          icon={Package}
        />
      </div>

      {/* Detailed Zone Readiness */}
      <div className="glass-card p-10 rounded-[40px] border-white/5">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">Zone-Specific Readiness</h2>
            <p className="text-zinc-500 mt-1">Multi-hop depends on dense courier coverage in every relay node.</p>
          </div>
          <button className="px-6 py-3 rounded-2xl border border-white/10 text-sm font-bold hover:bg-white/5 transition-all flex items-center gap-2">
            <Map size={18} />
            View Heatmap
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { zone: 'Jakarta Pusat', courier: 32, ready: true },
            { zone: 'Jakarta Barat', courier: 28, ready: false },
            { zone: 'Jakarta Timur', courier: 19, ready: false },
            { zone: 'Jakarta Selatan', courier: 41, ready: true },
          ].map((z, i) => (
            <div key={i} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">{z.zone}</p>
                {z.ready ? <CheckCircle2 size={16} className="text-emerald-500" /> : <AlertCircle size={16} className="text-amber-500" />}
              </div>
              <p className="text-2xl font-bold text-zinc-100">{z.courier}</p>
              <p className="text-xs text-zinc-500 mt-1">Active Couriers</p>
              <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div className={cn("h-full", z.ready ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${(z.courier/30)*100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-10 rounded-[40px] bg-primary/5 border border-primary/10 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500">
             <Lock size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-100 italic">Launch Override Protected</h3>
            <p className="text-zinc-500 max-w-md">Activation is strictly blocked until all primary gates are green. Manual override requires CEO & CTO approval signatures.</p>
          </div>
        </div>
        <button disabled className="px-10 py-5 rounded-3xl bg-zinc-800 text-zinc-500 font-black uppercase tracking-[0.2em] cursor-not-allowed opacity-50 flex items-center gap-3">
          Launch 3-Leg Relay
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  )
}
