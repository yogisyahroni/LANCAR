import { motion } from 'framer-motion'
import { 
  TrendingUp, 
  Package, 
  Truck, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Clock
} from 'lucide-react'
import { cn } from '../lib/utils'
import { RevenueChart, OrderDistributionChart } from '../components/Charts'
import LiveMap from '../components/LiveMap'

const StatCard = ({ title, value, change, icon: Icon, trend }: any) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="glass-card p-6 rounded-2xl relative overflow-hidden group"
  >
    <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
      <Icon size={80} />
    </div>
    <div className="flex items-center justify-between mb-4">
      <div className="p-2 rounded-lg bg-primary/10 text-primary-light">
        <Icon size={24} />
      </div>
      <div className={cn(
        "flex items-center text-xs font-medium px-2 py-1 rounded-full",
        trend === 'up' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
      )}>
        {trend === 'up' ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
        {change}
      </div>
    </div>
    <p className="text-zinc-500 text-sm mb-1">{title}</p>
    <h3 className="text-2xl font-bold text-zinc-100">{value}</h3>
  </motion.div>
)

export default function Dashboard() {
  return (
    <div className="space-y-8 animate-in max-w-[1600px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">System Overview</h1>
          <p className="text-zinc-500 flex items-center gap-2 mt-1">
            <Activity className="h-4 w-4 text-primary-light" />
            Live data from Jakarta Logistics Hub
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white/5 p-1 rounded-xl border border-white/5">
          <button className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg shadow-lg shadow-primary/20 transition-all">Real-time</button>
          <button className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-all">Historical</button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Daily Orders" 
          value="1,429" 
          change="+12.5%" 
          icon={Package} 
          trend="up" 
        />
        <StatCard 
          title="Revenue" 
          value="Rp 84.2M" 
          change="+8.2%" 
          icon={TrendingUp} 
          trend="up" 
        />
        <StatCard 
          title="Active Couriers" 
          value="124" 
          change="+4.1%" 
          icon={Truck} 
          trend="up" 
        />
        <StatCard 
          title="SLA Compliance" 
          value="98.4%" 
          change="-0.2%" 
          icon={Clock} 
          trend="down" 
        />
      </div>

      {/* Main Grid: Map & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Live Operations Map */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="glass-card rounded-3xl overflow-hidden h-[500px] relative">
            <div className="absolute top-6 left-6 z-[1000] flex items-center gap-2">
              <div className="glass-card px-4 py-2 rounded-xl border-white/10 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary-light animate-ping" />
                <span className="text-xs font-bold tracking-wider uppercase">Live Tracking</span>
              </div>
            </div>
            <LiveMap />
          </div>
        </div>

        {/* Right Sidebar: Activity & Distribution */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-card p-6 rounded-3xl flex-1">
            <h3 className="font-bold text-zinc-100 flex items-center gap-2 mb-6">
              <TrendingUp className="h-4 w-4 text-primary-light" />
              Order Distribution
            </h3>
            <OrderDistributionChart />
          </div>
          
          <div className="glass-card p-6 rounded-3xl">
            <h3 className="font-bold text-zinc-100 mb-6">System Health</h3>
            <div className="space-y-4">
              {[
                { label: 'API Gateway', status: 'Optimal', color: 'bg-emerald-500' },
                { label: 'WebSocket Hub', status: 'Connected', color: 'bg-emerald-500' },
                { label: 'Matching Engine', status: 'Healthy', color: 'bg-emerald-500' },
                { label: 'Database Cluster', status: '94% Cap', color: 'bg-amber-500' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-200">{item.status}</span>
                    <div className={cn("h-1.5 w-1.5 rounded-full", item.color)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Revenue Trend & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-8">
        <div className="lg:col-span-8 glass-card p-8 rounded-3xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold text-zinc-100">Revenue Velocity</h3>
              <p className="text-sm text-zinc-500">Projected vs Actual revenue today</p>
            </div>
            <div className="flex items-center gap-2 text-primary-light text-sm font-bold bg-primary/10 px-3 py-1 rounded-lg">
              <TrendingUp size={16} />
              +14% vs Yesterday
            </div>
          </div>
          <RevenueChart />
        </div>

        <div className="lg:col-span-4 glass-card p-8 rounded-3xl">
          <h3 className="text-xl font-bold text-zinc-100 mb-6">Recent Events</h3>
          <div className="space-y-6">
            {[
              { type: 'order', msg: 'New large-haul order from UMKM-32', time: 'Just now' },
              { type: 'courier', msg: 'Kurir Andi reached Meeting Point A', time: '4m ago' },
              { type: 'alert', msg: 'SLA Warning: Route #LC-492 delayed', time: '12m ago' },
              { type: 'system', msg: 'Daily financial report generated', time: '1h ago' },
            ].map((item, i) => (
              <div key={i} className="flex gap-4 relative group cursor-pointer">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                  item.type === 'alert' ? "bg-red-500/10 text-red-400" : "bg-white/5 text-zinc-400 group-hover:text-primary-light"
                )}>
                  {item.type === 'order' && <Package size={18} />}
                  {item.type === 'courier' && <Truck size={18} />}
                  {item.type === 'alert' && <Activity size={18} />}
                  {item.type === 'system' && <TrendingUp size={18} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-zinc-200 group-hover:text-white transition-colors">{item.msg}</p>
                  <p className="text-xs text-zinc-500 mt-1">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-8 py-3 rounded-xl border border-white/5 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-all">
            View All Activity
          </button>
        </div>
      </div>
    </div>
  )
}
