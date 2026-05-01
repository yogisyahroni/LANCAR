import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  AlertTriangle, 
  MessageSquare, 
  User, 
  Clock, 
  CheckCircle, 
  XCircle,
  ExternalLink,
  Image as ImageIcon,
  ShieldAlert
} from 'lucide-react'
import { cn } from '../lib/utils'

const disputes = [
  { 
    id: 'DSP-2024-001', 
    orderId: 'LC-2024-1002', 
    customer: 'UMKM Bakti', 
    courier: 'Andi Wijaya',
    reason: 'Damaged Goods', 
    severity: 'High', 
    status: 'Pending',
    createdAt: '2h ago',
    description: 'The package arrived with the seal broken and the content was leaking.'
  },
  { 
    id: 'DSP-2024-002', 
    orderId: 'LC-2024-1005', 
    customer: 'Warung Kita', 
    courier: 'Dedi Kurnia',
    reason: 'Missing Item', 
    severity: 'Medium', 
    status: 'Investigating',
    createdAt: '5h ago',
    description: 'Customer claims 2 out of 5 items are missing from the package.'
  },
  { 
    id: 'DSP-2024-003', 
    orderId: 'LC-2024-1006', 
    customer: 'Pecel Lele 88', 
    courier: 'Eka Putri',
    reason: 'Late Delivery', 
    severity: 'Low', 
    status: 'Resolved',
    createdAt: '1d ago',
    description: 'Delivery was delayed by 2 hours due to rain.'
  },
]

export default function Disputes() {
  const [selectedDispute, setSelectedDispute] = useState<any>(null)
  const [filter, setFilter] = useState('All')

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Dispute Management</h1>
          <p className="text-zinc-500 mt-1">Review and resolve claims, damages, and delivery issues.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle size={14} />
            8 Unresolved
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 bg-white/[0.02] p-1.5 rounded-2xl border border-white/5 w-fit">
        {['All', 'Pending', 'Investigating', 'Resolved'].map(t => (
          <button 
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              filter === t ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {disputes.filter(d => filter === 'All' || d.status === filter).map((dispute, i) => (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            key={dispute.id}
            className="glass-card p-8 rounded-[32px] border-white/5 hover:border-white/10 transition-all group relative overflow-hidden"
          >
            <div className={cn(
              "absolute left-0 top-0 bottom-0 w-1.5",
              dispute.severity === 'High' ? "bg-red-500" : dispute.severity === 'Medium' ? "bg-amber-500" : "bg-primary"
            )} />
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-zinc-600 uppercase tracking-[0.2em]">{dispute.id}</span>
                  <span className="text-zinc-800">•</span>
                  <span className="text-xs font-black text-primary-light uppercase tracking-widest">{dispute.orderId}</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-100">{dispute.reason}</h3>
                  <p className="text-zinc-500 text-sm mt-1 max-w-2xl italic leading-relaxed">"{dispute.description}"</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-zinc-600" />
                    <span className="text-xs font-bold text-zinc-400">{dispute.customer}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-zinc-600" />
                    <span className="text-xs font-bold text-zinc-400">{dispute.createdAt}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-10">
                <div className="text-center">
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2">Severity</p>
                  <span className={cn(
                    "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                    dispute.severity === 'High' ? "border-red-500/20 text-red-400 bg-red-500/5" :
                    dispute.severity === 'Medium' ? "border-amber-500/20 text-amber-400 bg-amber-500/5" :
                    "border-primary/20 text-primary-light bg-primary/5"
                  )}>
                    {dispute.severity}
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2">Status</p>
                  <span className={cn(
                    "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                    dispute.status === 'Pending' ? "border-zinc-700 text-zinc-500" :
                    dispute.status === 'Investigating' ? "border-amber-500/20 text-amber-400" :
                    "border-emerald-500/20 text-emerald-400"
                  )}>
                    {dispute.status}
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedDispute(dispute)}
                  className="p-4 rounded-2xl bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all border border-white/5"
                >
                  <ExternalLink size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Dispute Detail Modal */}
      <AnimatePresence>
        {selectedDispute && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDispute(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-12 rounded-[48px] relative z-10 border-white/10"
            >
              <div className="space-y-12">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                       <span className="text-xs font-black text-zinc-600 uppercase tracking-widest">{selectedDispute.id}</span>
                       <span className="text-zinc-800">/</span>
                       <span className="text-xs font-black text-primary-light uppercase tracking-widest">{selectedDispute.orderId}</span>
                    </div>
                    <h2 className="text-4xl font-black text-zinc-100 tracking-tighter">{selectedDispute.reason}</h2>
                  </div>
                  <button onClick={() => setSelectedDispute(null)} className="p-3 rounded-2xl bg-white/5 text-zinc-500 hover:text-white transition-all">
                    <XCircle size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <div>
                      <h4 className="text-xs font-black text-zinc-600 uppercase tracking-widest mb-4">Evidence & Photos</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="aspect-square rounded-3xl bg-zinc-900 border border-white/5 flex items-center justify-center group cursor-pointer overflow-hidden relative">
                           <ImageIcon size={32} className="text-zinc-800 group-hover:scale-110 transition-transform" />
                           <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="aspect-square rounded-3xl bg-zinc-900 border border-white/5 flex items-center justify-center group cursor-pointer overflow-hidden relative">
                           <ImageIcon size={32} className="text-zinc-800 group-hover:scale-110 transition-transform" />
                        </div>
                      </div>
                    </div>
                    <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5">
                      <p className="text-sm text-zinc-300 italic leading-relaxed">
                        "{selectedDispute.description}"
                      </p>
                    </div>
                  </div>

                  <div className="space-y-10">
                     <div className="space-y-4">
                        <h4 className="text-xs font-black text-zinc-600 uppercase tracking-widest">Assign Specialist</h4>
                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-900 border border-white/5">
                           <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary-light">
                              <User size={20} />
                           </div>
                           <select className="bg-transparent border-none text-zinc-200 text-sm font-bold focus:ring-0 w-full cursor-pointer">
                              <option>Sarah Johnson (CS Lead)</option>
                              <option>Mike Ross (Ops Specialist)</option>
                              <option>Unassigned</option>
                           </select>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <h4 className="text-xs font-black text-zinc-600 uppercase tracking-widest">Resolution Actions</h4>
                        <div className="space-y-3">
                           <button className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                              <CheckCircle size={18} />
                              Resolve & Close
                           </button>
                           <button className="w-full py-4 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black uppercase tracking-widest text-xs hover:bg-amber-500/20 transition-all flex items-center justify-center gap-3">
                              <MessageSquare size={18} />
                              Contact Customer
                           </button>
                           <button className="w-full py-4 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 font-black uppercase tracking-widest text-xs hover:bg-red-500/20 transition-all flex items-center justify-center gap-3">
                              <ShieldAlert size={18} />
                              Escalate to Legal
                           </button>
                        </div>
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
