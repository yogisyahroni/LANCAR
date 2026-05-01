import { motion } from 'framer-motion'
import { TrendingUp, Package, Truck, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react'

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

import { cn } from '../lib/utils'

export default function Dashboard() {
  return (
    <div className="space-y-8 animate-in">
      <div>
        <h1 className="text-3xl font-bold text-zinc-100 mb-2">Operations Dashboard</h1>
        <p className="text-zinc-500">Real-time overview of your logistics network status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Orders" 
          value="1,284" 
          change="+12.5%" 
          icon={Package} 
          trend="up" 
        />
        StatCard 
        <StatCard 
          title="Revenue" 
          value="Rp 42.5M" 
          change="+8.2%" 
          icon={TrendingUp} 
          trend="up" 
        />
        <StatCard 
          title="Active Couriers" 
          value="86" 
          change="-2.4%" 
          icon={Truck} 
          trend="down" 
        />
        <StatCard 
          title="New Customers" 
          value="156" 
          change="+18.7%" 
          icon={Users} 
          trend="up" 
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-6 rounded-2xl min-h-[400px] flex items-center justify-center border-dashed border-2 border-white/5 bg-transparent">
          <div className="text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-zinc-700 mb-4" />
            <p className="text-zinc-500 italic">Advanced Charts Coming Soon (Recharts Integration)</p>
          </div>
        </div>
        <div className="glass-card p-6 rounded-2xl">
          <h3 className="text-xl font-bold mb-6">Recent Activity</h3>
          <div className="space-y-6">
            {[1, 2, 3, 4, 5].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm text-zinc-200">Order #LC-2024-{1000 + i} delivered successfully</p>
                  <p className="text-xs text-zinc-500 mt-1">2 mins ago</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

import { BarChart3 } from 'lucide-react'
