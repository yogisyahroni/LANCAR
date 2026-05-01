import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Users, 
  Search, 
  ShieldCheck, 
  Clock, 
  MapPin, 
  Star,
  ExternalLink,
  Ban,
  CheckCircle,
  FileText,
  Truck
} from 'lucide-react'
import { cn } from '../lib/utils'

const couriers = [
  { 
    id: 'CR-1029', 
    name: 'Ahmad Subarjo', 
    phone: '+62 812-9981-1221',
    plate: 'B 1234 ABC',
    status: 'Active', 
    score: 4.8, 
    relayScore: 92,
    location: 'Jakarta Selatan', 
    joinedAt: '12 Jan 2024',
    type: 'Motor'
  },
  { 
    id: 'CR-1035', 
    name: 'Siti Aminah', 
    phone: '+62 813-1122-3344',
    plate: 'B 5678 XYZ',
    status: 'Pending', 
    score: 0, 
    relayScore: 0,
    location: 'Jakarta Barat', 
    joinedAt: 'Today, 10:15',
    type: 'Motor'
  },
  { 
    id: 'CR-1041', 
    name: 'Budi Hartono', 
    phone: '+62 815-5566-7788',
    plate: 'B 9012 DEF',
    status: 'Suspended', 
    score: 3.2, 
    relayScore: 45,
    location: 'Jakarta Timur', 
    joinedAt: '5 Des 2023',
    type: 'Motor'
  },
  { 
    id: 'CR-1050', 
    name: 'Dedi Kusuma', 
    phone: '+62 817-8899-0011',
    plate: 'B 3456 GHI',
    status: 'Active', 
    score: 4.9, 
    relayScore: 98,
    location: 'Jakarta Pusat', 
    joinedAt: '1 Feb 2024',
    type: 'Motor'
  },
]

export default function Couriers() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [selectedCourier, setSelectedCourier] = useState<any>(null)

  const filteredCouriers = couriers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.id.includes(search)
    const matchesFilter = filter === 'All' || c.status === filter
    return matchesSearch && matchesFilter
  })

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Courier Management</h1>
          <p className="text-zinc-500 mt-1">Manage, verify, and monitor courier performance across the fleet.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-6 py-3 rounded-2xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2">
            <Users size={18} />
            Export List
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Couriers', value: '1,248', icon: Users, color: 'text-zinc-400' },
          { label: 'Active Now', value: '412', icon: Truck, color: 'text-emerald-400' },
          { label: 'Pending Verification', value: '28', icon: Clock, color: 'text-amber-400' },
          { label: 'Suspended', value: '5', icon: Ban, color: 'text-red-400' },
        ].map((stat, i) => (
          <div key={i} className="glass-card p-6 rounded-3xl border-white/5">
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl bg-white/5", stat.color)}>
                <stat.icon size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                <p className="text-2xl font-black text-zinc-100 mt-1">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/[0.02] p-4 rounded-[32px] border border-white/5">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary-light transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search name, ID, or plate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
          />
        </div>
        <div className="flex items-center gap-2">
          {['All', 'Active', 'Pending', 'Suspended'].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                filter === t ? "bg-primary/20 text-primary-light border border-primary/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Courier Table */}
      <div className="glass-card rounded-[40px] border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01]">
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Courier</th>
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Status</th>
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Relay Score</th>
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Location</th>
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredCouriers.map((courier, i) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={courier.id} 
                  className="hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-600 font-bold text-lg border border-white/5 group-hover:border-primary/20 transition-all uppercase">
                        {courier.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-zinc-100">{courier.name}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 border border-white/5 uppercase font-bold">
                            {courier.type}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">{courier.id} • {courier.plate}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className={cn(
                      "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      courier.status === 'Active' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                      courier.status === 'Pending' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                      "bg-red-500/10 text-red-400 border border-red-500/20"
                    )}>
                      <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", 
                        courier.status === 'Active' ? "bg-emerald-400" :
                        courier.status === 'Pending' ? "bg-amber-400" : "bg-red-400"
                      )} />
                      {courier.status}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center text-sm font-black text-zinc-100">
                        {courier.relayScore}
                      </div>
                      <div className="flex-1 max-w-[100px] h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full", courier.relayScore > 80 ? "bg-emerald-500" : courier.relayScore > 50 ? "bg-amber-500" : "bg-red-500")} 
                          style={{ width: `${courier.relayScore}%` }} 
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <MapPin size={14} className="text-zinc-600" />
                      <span className="text-sm font-medium">{courier.location}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setSelectedCourier(courier)}
                        className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
                      >
                        <ExternalLink size={18} />
                      </button>
                      <button className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <Ban size={18} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Mock */}
        <div className="px-8 py-6 border-t border-white/5 flex items-center justify-between">
          <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest">Showing 4 of 1,248 Couriers</p>
          <div className="flex items-center gap-2">
            <button disabled className="px-4 py-2 rounded-xl bg-white/5 text-zinc-700 font-bold text-sm">Previous</button>
            <button className="px-4 py-2 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20">1</button>
            <button className="px-4 py-2 rounded-xl bg-white/5 text-zinc-400 font-bold text-sm hover:bg-white/10 transition-all">2</button>
            <button className="px-4 py-2 rounded-xl bg-white/5 text-zinc-400 font-bold text-sm hover:bg-white/10 transition-all">Next</button>
          </div>
        </div>
      </div>

      {/* Courier Detail Modal */}
      <AnimatePresence>
        {selectedCourier && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCourier(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-10 rounded-[48px] relative z-10 border-white/10"
            >
              <div className="flex flex-col md:flex-row gap-10">
                <div className="md:w-1/3 space-y-6">
                  <div className="aspect-square rounded-[32px] bg-zinc-900 border border-white/10 flex items-center justify-center text-6xl font-black text-zinc-700 uppercase">
                    {selectedCourier.name.charAt(0)}
                  </div>
                  <div className="space-y-4">
                    <button className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                      <CheckCircle size={20} />
                      Verify Courier
                    </button>
                    <button className="w-full py-4 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 font-black uppercase tracking-widest text-sm hover:bg-red-500/20 transition-all flex items-center justify-center gap-3">
                      <Ban size={20} />
                      Suspend Access
                    </button>
                  </div>
                </div>

                <div className="md:w-2/3 space-y-10">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-4xl font-black text-zinc-100 tracking-tighter">{selectedCourier.name}</h2>
                      <p className="text-zinc-500 font-medium mt-1">{selectedCourier.id} • {selectedCourier.plate}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-zinc-600 uppercase tracking-widest mb-1">Relay Rating</p>
                      <div className="flex items-center gap-2">
                        <div className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary-light border border-primary/20 flex items-center gap-2">
                          <Star size={16} fill="currentColor" />
                          <span className="font-black text-lg">{selectedCourier.score || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                      <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-3">Performance Data</p>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-400 italic">Total Deliveries</span>
                          <span className="text-sm font-bold text-zinc-100">142</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-400 italic">Ontime Rate</span>
                          <span className="text-sm font-bold text-emerald-400">98.2%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-400 italic">Cancel Rate</span>
                          <span className="text-sm font-bold text-red-400">1.2%</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                      <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-3">Identity & Docs</p>
                      <div className="space-y-3">
                        <button className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all group">
                          <div className="flex items-center gap-3">
                            <FileText size={16} className="text-zinc-500" />
                            <span className="text-sm text-zinc-300">Identity Card (KTP)</span>
                          </div>
                          <CheckCircle size={14} className="text-emerald-500" />
                        </button>
                        <button className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all group">
                          <div className="flex items-center gap-3">
                            <FileText size={16} className="text-zinc-500" />
                            <span className="text-sm text-zinc-300">Vehicle Permit (STNK)</span>
                          </div>
                          <CheckCircle size={14} className="text-emerald-500" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-zinc-100 mb-6 flex items-center gap-2">
                      <ShieldCheck className="text-primary-light" size={20} />
                      Operation History
                    </h3>
                    <div className="space-y-4">
                      {[
                        { event: 'Successfully completed 3-Kaki Relay', time: '2h ago', status: 'Success' },
                        { event: 'Route optimization alert triggered', time: '1d ago', status: 'Warning' },
                        { event: 'Monthly insurance payout processed', time: '3d ago', status: 'Info' },
                      ].map((log, i) => (
                        <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.01] border border-white/5">
                          <div className="w-2 h-2 rounded-full bg-zinc-700" />
                          <div className="flex-1">
                            <p className="text-sm text-zinc-300 font-medium">{log.event}</p>
                            <p className="text-xs text-zinc-600 mt-0.5">{log.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
