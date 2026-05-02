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
  ShieldAlert,
  Loader2
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'

export default function Disputes() {
  const [selectedDispute, setSelectedDispute] = useState<any>(null)
  const [filter, setFilter] = useState('All')
  const [page, setPage] = useState(1)
  const LIMIT = 10
  const queryClient = useQueryClient()

  const { data: disputeRes = { data: [], total: 0 }, isLoading } = useQuery({
    queryKey: ['disputes', filter, page],
    queryFn: async () => {
      const res = await api.get('/admin/disputes', {
        params: { status: filter, page, limit: LIMIT }
      })
      return res.data // { data: [], total, page, limit }
    },
    placeholderData: (prev) => prev
  })

  const { data: stats } = useQuery({
    queryKey: ['dispute-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/disputes/stats')
      return res.data
    }
  })

  const { data: admins = [] } = useQuery({
    queryKey: ['admins'],
    queryFn: async () => {
      const res = await api.get('/admin/admins')
      return res.data
    }
  })

  const assignMutation = useMutation({
    mutationFn: async ({ id, adminId }: { id: string, adminId: string }) => {
      await api.post(`/admin/disputes/${id}/assign`, { admin_id: adminId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
      toast.success('Dispute assigned successfully')
    },
    onError: () => toast.error('Failed to assign dispute')
  })

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string, status: string, note?: string }) => {
      await api.patch(`/admin/disputes/${id}/status`, { status, resolution_note: note })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
      queryClient.invalidateQueries({ queryKey: ['dispute-stats'] })
      setSelectedDispute(null)
      toast.success('Dispute status updated')
    },
    onError: () => toast.error('Failed to update dispute status')
  })

  const disputes = (disputeRes as any).data || []
  const total = (disputeRes as any).total || 0
  const totalPages = Math.ceil(total / LIMIT)

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
            {stats?.pending || 0} Pending
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 bg-white/[0.02] p-1.5 rounded-2xl border border-white/5 w-fit">
        {['All', 'Open', 'Investigating', 'Resolved'].map(t => (
          <button 
            key={t}
            onClick={() => { setFilter(t); setPage(1) }}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              filter === t ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-4">
          <Loader2 className="animate-spin text-primary" size={40} />
          <p className="text-sm font-bold uppercase tracking-[0.2em]">Loading disputes...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {disputes.map((dispute: any, i: number) => (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              key={dispute.id}
              className="glass-card p-8 rounded-[32px] border-white/5 hover:border-white/10 transition-all group relative overflow-hidden"
            >
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-1.5",
                dispute.category?.toLowerCase().includes('damage') ? "bg-red-500" : 
                dispute.category?.toLowerCase().includes('late') ? "bg-amber-500" : "bg-primary"
              )} />
              
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-zinc-600 uppercase tracking-[0.2em]">{dispute.id.slice(0, 8)}</span>
                    <span className="text-zinc-800">•</span>
                    <span className="text-xs font-black text-primary-light uppercase tracking-widest">{dispute.order_number}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-100">{dispute.category}</h3>
                    <p className="text-zinc-500 text-sm mt-1 max-w-2xl italic leading-relaxed">"{dispute.description}"</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-zinc-600" />
                      <span className="text-xs font-bold text-zinc-400">{dispute.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-zinc-600" />
                      <span className="text-xs font-bold text-zinc-400">{new Date(dispute.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-10">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2">Assignee</p>
                    <span className="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-zinc-700 text-zinc-500">
                      {dispute.assigned_to_name || 'Unassigned'}
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2">Status</p>
                    <span className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                      dispute.status === 'open' ? "border-zinc-700 text-zinc-500" :
                      dispute.status === 'investigating' ? "border-amber-500/20 text-amber-400" :
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
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-zinc-500">
            Showing <span className="text-zinc-300 font-bold">{((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)}</span> of <span className="text-zinc-300 font-bold">{total}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="px-4 py-2 text-sm text-zinc-400">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}

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
                       <span className="text-xs font-black text-zinc-600 uppercase tracking-widest">{selectedDispute.id.slice(0, 8)}</span>
                       <span className="text-zinc-800">/</span>
                       <span className="text-xs font-black text-primary-light uppercase tracking-widest">{selectedDispute.order_number}</span>
                    </div>
                    <h2 className="text-4xl font-black text-zinc-100 tracking-tighter">{selectedDispute.category}</h2>
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
                        {selectedDispute.evidence_urls && selectedDispute.evidence_urls.length > 0 ? (
                          selectedDispute.evidence_urls.map((url: string, i: number) => (
                            <div key={i} className="aspect-square rounded-3xl bg-zinc-900 border border-white/5 flex items-center justify-center group cursor-pointer overflow-hidden relative">
                              <img src={url} alt={`Evidence ${i}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                            </div>
                          ))
                        ) : (
                          <div className="aspect-square rounded-3xl bg-zinc-900 border border-white/5 flex items-center justify-center group cursor-pointer overflow-hidden relative">
                             <ImageIcon size={32} className="text-zinc-800 group-hover:scale-110 transition-transform" />
                             <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                             <p className="absolute bottom-4 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">No photos provided</p>
                          </div>
                        )}
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
                           <select 
                            value={selectedDispute.assigned_to || ''}
                            onChange={(e) => assignMutation.mutate({ id: selectedDispute.id, adminId: e.target.value })}
                            className="bg-transparent border-none text-zinc-200 text-sm font-bold focus:ring-0 w-full cursor-pointer"
                           >
                              <option value="">Unassigned</option>
                              {admins.map((admin: any) => (
                                <option key={admin.id} value={admin.id}>{admin.full_name} ({admin.role})</option>
                              ))}
                           </select>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <h4 className="text-xs font-black text-zinc-600 uppercase tracking-widest">Resolution Actions</h4>
                        <div className="space-y-3">
                           <button 
                            disabled={resolveMutation.isPending}
                            onClick={() => resolveMutation.mutate({ id: selectedDispute.id, status: 'resolved' })}
                            className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                           >
                              {resolveMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                              Resolve & Close
                           </button>
                           <button className="w-full py-4 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black uppercase tracking-widest text-xs hover:bg-amber-500/20 transition-all flex items-center justify-center gap-3">
                              <MessageSquare size={18} />
                              Contact Customer
                           </button>
                           <button 
                            onClick={() => resolveMutation.mutate({ id: selectedDispute.id, status: 'investigating' })}
                            className="w-full py-4 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 font-black uppercase tracking-widest text-xs hover:bg-red-500/20 transition-all flex items-center justify-center gap-3"
                           >
                              <ShieldAlert size={18} />
                              Escalate / Investigate
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
