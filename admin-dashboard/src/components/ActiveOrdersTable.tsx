import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  Filter, 
  Package, 
  Truck, 
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Users,
  BarChart3
} from 'lucide-react'
import { cn } from '../lib/utils'

const orders = [
  { id: 'LC-2024-1002', customer: 'UMKM Bakti', courier: 'Andi Wijaya', status: 'In Transit', type: 'P2P', amount: 'Rp 45,000', time: '12 mins left' },
  { id: 'LC-2024-1003', customer: 'Sari Rejeki', courier: 'Budi Santoso', status: 'Searching', type: '2-Kaki', amount: 'Rp 82,000', time: 'Searching...' },
  { id: 'LC-2024-1004', customer: 'Toko Maju', courier: 'Citra Dewi', status: 'Delivered', type: 'P2P', amount: 'Rp 35,000', time: 'Delivered' },
  { id: 'LC-2024-1005', customer: 'Warung Kita', courier: 'Dedi Kurnia', status: 'At Hub', type: '3-Kaki', amount: 'Rp 150,000', time: 'Waiting Relay' },
  { id: 'LC-2024-1006', customer: 'Pecel Lele 88', courier: 'Eka Putri', status: 'Delayed', type: 'P2P', amount: 'Rp 28,000', time: '+15 mins' },
]

export default function ActiveOrdersTable() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Filter orders by ID, Customer, or Courier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 transition-all">
          <Filter size={16} />
          Filters
        </button>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/5 text-zinc-500 text-xs font-semibold uppercase tracking-wider">
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Courier</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {orders.map((order, i) => (
              <motion.tr 
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => setSelectedOrder(order)}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary-light group-hover:bg-primary group-hover:text-white transition-all">
                      <Package size={16} />
                    </div>
                    <span className="font-medium text-zinc-200">{order.id}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-zinc-400 text-sm">{order.customer}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-zinc-800 border border-white/10 overflow-hidden">
                      <img src={`https://ui-avatars.com/api/?name=${order.courier}&background=random`} alt="" />
                    </div>
                    <span className="text-zinc-300 text-sm">{order.courier}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-md border uppercase tracking-wider",
                    order.type === 'P2P' ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" :
                    order.type === '2-Kaki' ? "border-blue-500/20 text-blue-400 bg-blue-500/5" :
                    "border-purple-500/20 text-purple-400 bg-purple-500/5"
                  )}>
                    {order.type}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    {order.status === 'In Transit' && <Clock size={14} className="text-primary-light animate-pulse" />}
                    {order.status === 'Searching' && <Search size={14} className="text-zinc-500 animate-bounce" />}
                    {order.status === 'Delivered' && <CheckCircle2 size={14} className="text-emerald-500" />}
                    {order.status === 'Delayed' && <AlertCircle size={14} className="text-red-500" />}
                    <span className={cn(
                      "text-xs font-medium",
                      order.status === 'Delayed' ? "text-red-400" : "text-zinc-200"
                    )}>{order.status}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <button className="p-2 text-zinc-500 hover:text-white transition-colors">
                    <ExternalLink size={18} />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
        <p className="text-xs text-zinc-500 uppercase tracking-[0.1em] font-black">Showing 5 of 124 active orders</p>
        <button className="flex items-center gap-1 text-xs font-bold text-primary-light hover:text-emerald-400 transition-colors uppercase tracking-widest">
          View All Orders
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[48px] relative z-10 border-white/10 flex flex-col"
            >
              <div className="flex-1 overflow-y-auto p-12">
                <div className="flex flex-col md:flex-row justify-between gap-10">
                  <div className="flex-1 space-y-10">
                    <div className="flex items-start gap-6">
                      <div className="h-16 w-16 rounded-[24px] bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30">
                        <Package size={32} />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-4xl font-black text-zinc-100 tracking-tighter">{selectedOrder.id}</h2>
                          <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
                            {selectedOrder.type}
                          </span>
                        </div>
                        <p className="text-zinc-500 font-bold mt-1 tracking-tight">Created on April 12, 2024 at 14:22</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-4 p-8 rounded-[32px] bg-white/[0.02] border border-white/5">
                        <p className="text-xs font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                          <Users size={14} className="text-zinc-700" />
                          Participants
                        </p>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-500 italic">Customer</span>
                            <span className="text-sm font-black text-zinc-100">{selectedOrder.customer}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-500 italic">Current Courier</span>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-zinc-800 overflow-hidden">
                                <img src={`https://ui-avatars.com/api/?name=${selectedOrder.courier}&background=random`} alt="" />
                              </div>
                              <span className="text-sm font-black text-zinc-100">{selectedOrder.courier}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4 p-8 rounded-[32px] bg-white/[0.02] border border-white/5">
                        <p className="text-xs font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                          <BarChart3 size={14} className="text-zinc-700" />
                          Financials
                        </p>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-500 italic">Service Fare</span>
                            <span className="text-sm font-black text-zinc-100">{selectedOrder.amount}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-500 italic">Insurance</span>
                            <span className="text-sm font-black text-emerald-400">Rp 1,500</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <h3 className="text-xl font-black text-zinc-100 tracking-tight flex items-center gap-3">
                        <Clock className="text-primary-light" size={24} />
                        Order Timeline
                      </h3>
                      <div className="relative pl-10 space-y-10">
                        <div className="absolute left-4 top-2 bottom-2 w-px bg-white/10" />
                        {[
                          { title: 'Order Created', time: '14:22', desc: 'System received order from UMKM portal', done: true },
                          { title: 'Courier Assigned', time: '14:25', desc: 'Andi Wijaya accepted the request', done: true },
                          { title: 'Picked Up', time: '14:35', desc: 'Package verified and secured', done: true },
                          { title: 'In Transit', time: 'Now', desc: 'Courier is moving towards destination', done: false, active: true },
                          { title: 'Delivered', time: 'Est. 15:05', desc: 'Package arrival at drop-off', done: false },
                        ].map((step, i) => (
                          <div key={i} className="relative">
                            <div className={cn(
                              "absolute -left-7 top-1 w-2.5 h-2.5 rounded-full border-2",
                              step.done ? "bg-emerald-500 border-emerald-500" : 
                              step.active ? "bg-primary border-primary animate-pulse shadow-[0_0_10px_rgba(0,100,55,0.5)]" : 
                              "bg-zinc-900 border-zinc-700"
                            )} />
                            <div className="flex items-start justify-between">
                              <div>
                                <p className={cn("text-base font-black tracking-tight", step.done ? "text-zinc-100" : step.active ? "text-primary-light" : "text-zinc-500")}>
                                  {step.title}
                                </p>
                                <p className="text-xs text-zinc-600 mt-1 font-bold italic">{step.desc}</p>
                              </div>
                              <p className="text-sm font-black text-zinc-600 font-mono">{step.time}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="md:w-80 space-y-8">
                    <div className="h-64 rounded-[32px] bg-zinc-900 border border-white/5 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/106.8456,-6.2088,12/400x300?access_token=mock')] bg-cover bg-center grayscale opacity-50" />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
                      <div className="absolute bottom-6 left-6 right-6">
                        <p className="text-xs font-black text-white/40 uppercase tracking-widest mb-1">Current Location</p>
                        <p className="text-sm font-black text-white truncate">Sudirman Central Business District</p>
                      </div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                         <div className="w-4 h-4 bg-primary rounded-full animate-ping opacity-75" />
                         <div className="w-3 h-3 bg-primary rounded-full relative z-10 border-2 border-white shadow-xl shadow-primary/40" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <button className="w-full py-5 rounded-[24px] bg-primary text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                        <Truck size={20} />
                        Manual Reassign
                      </button>
                      <button className="w-full py-5 rounded-[24px] bg-red-500/10 text-red-400 border border-red-500/20 font-black uppercase tracking-widest text-xs hover:bg-red-500/20 transition-all flex items-center justify-center gap-3">
                        <AlertCircle size={20} />
                        Flag Issue
                      </button>
                    </div>

                    <div className="p-8 rounded-[32px] bg-zinc-900 border border-white/5">
                      <p className="text-xs font-black text-zinc-600 uppercase tracking-widest mb-6">Delivery Evidence</p>
                      <div className="aspect-video rounded-2xl bg-zinc-800 border border-white/10 flex items-center justify-center group overflow-hidden cursor-pointer">
                        <span className="text-xs font-black text-zinc-700 group-hover:text-zinc-500 transition-colors uppercase tracking-widest">Awaiting Photo</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-8 bg-white/[0.01] border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="px-10 py-4 rounded-2xl bg-zinc-800 text-zinc-400 font-black uppercase tracking-widest text-xs hover:bg-zinc-700 hover:text-white transition-all"
                >
                  Close Detail
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
