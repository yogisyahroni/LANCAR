import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  MapPin, 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  Package,
  Calendar,
  AlertCircle,
  Filter,
  Loader2,
  Users,
  BarChart3,
  Truck
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { format } from 'date-fns'

const uploadUrl = (path?: string | null) => {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1').replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
  return `${apiBase}${path}`
}

export default function ActiveOrdersTable() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const limit = 10

  // Fetch Orders — auto-refetch every 10s for near-realtime updates
  const { data: ordersData, isLoading: isLoadingOrders } = useQuery({
    queryKey: ['admin-orders', page, searchTerm],
    queryFn: async () => {
      const res = await api.get('/admin/orders', {
        params: {
          page,
          limit,
          search: searchTerm
        }
      })
      return res.data
    },
    refetchInterval: 10000
  })

  // Fetch Order Detail when selected
  const { data: orderDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['admin-order-detail', selectedOrderId],
    queryFn: async () => {
      if (!selectedOrderId) return null
      const res = await api.get(`/admin/orders/${selectedOrderId}`)
      return res.data
    },
    enabled: !!selectedOrderId
  })

  // Mutations
  const reassignMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return api.post(`/admin/orders/${orderId}/reassign`, { courier_id: 'pending', reason: 'Admin manual trigger' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({ queryKey: ['admin-order-detail', selectedOrderId] })
      toast.success('Order reassignment triggered')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to reassign order')
    }
  })

  const flagIssueMutation = useMutation({
    mutationFn: async ({ orderId, type, description }: { orderId: string, type: string, description: string }) => {
      return api.post(`/admin/orders/${orderId}/flag`, { type, description })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({ queryKey: ['admin-order-detail', selectedOrderId] })
      toast.warning('Order flagged for investigation')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to flag order')
    }
  })

  // Dedup by id sebagai defensive layer — backend seharusnya sudah unik,
  // ini mencegah React key warning jika ada edge case duplikasi dari network.
  const rawOrders = ordersData?.data || []
  const orders = rawOrders.filter((order: any, index: number, self: any[]) =>
    index === self.findIndex((o: any) => o.id === order.id)
  )
  const total = ordersData?.total || 0
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search by ID, Customer, or Courier..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium text-zinc-200"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm font-black uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all">
            <Filter size={18} />
            Filters
          </button>
          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-orders'] })}
            className="p-3 bg-primary/10 border border-primary/20 rounded-2xl text-primary-light hover:bg-primary/20 transition-all"
          >
            <Clock size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        {isLoadingOrders ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-xs font-black text-zinc-500 uppercase tracking-widest">Scanning Grid...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center">
            <Package className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">No active orders found</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="px-6 py-4">ID & Model</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Courier</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((order: any, i: number) => (
                <motion.tr 
                  key={`order-${order.id}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="group hover:bg-white/[0.03] transition-all cursor-pointer border-l-2 border-transparent hover:border-primary"
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all shadow-lg",
                        order.model === 'P2P' ? "bg-emerald-500/10 text-emerald-400" :
                        order.model === '2-Leg' ? "bg-blue-500/10 text-blue-400" :
                        "bg-purple-500/10 text-purple-400"
                      )}>
                        <Package size={18} />
                      </div>
                      <div>
                        <span className="font-black text-zinc-100 block text-sm tracking-tight">{order.id}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{order.model}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-zinc-300">{order.customer_name || 'Anonymous'}</p>
                    <p className="text-[10px] text-zinc-600 font-medium">Verified Merchant</p>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-zinc-800 border border-white/10 overflow-hidden shadow-inner">
                        <img src={`https://ui-avatars.com/api/?name=${order.courier_name || 'U'}&background=random`} alt="" />
                      </div>
                      <span className="text-zinc-300 text-sm font-black">{order.courier_name || 'Assigning...'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        order.status === 'delivered' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                        order.status === 'delayed' || order.status === 'failed' ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                        "bg-primary animate-pulse shadow-[0_0_8px_rgba(0,100,55,0.5)]"
                      )} />
                      <span className={cn(
                        "text-xs font-black uppercase tracking-widest",
                        order.status === 'delayed' ? "text-red-400" : "text-zinc-200"
                      )}>{order.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="text-sm font-black text-zinc-100">Rp {parseInt(order.total_amount).toLocaleString()}</span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-8 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
        <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black">
          {isLoadingOrders ? 'Calculating Grid...' : `Displaying ${orders.length} of ${total} logical units`}
        </p>
        <div className="flex items-center gap-2">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 disabled:opacity-20 hover:text-white transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-1">
             {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => (
               <button
                 key={i}
                 onClick={() => setPage(i + 1)}
                 className={cn(
                   "w-10 h-10 rounded-xl text-xs font-black transition-all",
                   page === i + 1 ? "bg-primary text-white shadow-lg" : "text-zinc-500 hover:bg-white/5"
                 )}
               >
                 {i + 1}
               </button>
             ))}
          </div>
          <button 
            disabled={page === totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 disabled:opacity-20 hover:text-white transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrderId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrderId(null)}
              className="absolute inset-0 bg-zinc-950/90 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-[48px] relative z-10 border-white/10 flex flex-col shadow-2xl"
            >
              {isLoadingDetail ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-40">
                  <Loader2 className="w-16 h-16 text-primary animate-spin" />
                  <p className="text-sm font-black text-zinc-500 uppercase tracking-[0.3em]">Downloading Order Context...</p>
                </div>
              ) : orderDetail ? (
                <>
                  <div className="flex-1 overflow-y-auto p-12">
                    <div className="flex flex-col lg:flex-row justify-between gap-16">
                      <div className="flex-1 space-y-12">
                        <div className="flex items-start gap-8">
                          <div className={cn(
                            "h-20 w-20 rounded-[32px] flex items-center justify-center text-white shadow-2xl transition-all shrink-0",
                            orderDetail.model === 'P2P' ? "bg-emerald-500 shadow-emerald-500/20" :
                            orderDetail.model === '2-Leg' ? "bg-blue-500 shadow-blue-500/20" :
                            "bg-purple-500 shadow-purple-500/20"
                          )}>
                            <Package size={40} />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-4">
                              <h2 className="text-5xl font-black text-zinc-100 tracking-tighter">{orderDetail.id}</h2>
                              <div className="flex gap-2">
                                <span className="px-4 py-1.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 text-[10px] font-black uppercase tracking-widest">
                                  {orderDetail.model}
                                </span>
                                <span className={cn(
                                  "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                  orderDetail.status === 'delivered' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-primary/10 text-primary-light border-primary/20"
                                )}>
                                  {orderDetail.status}
                                </span>
                              </div>
                            </div>
                            <p className="text-zinc-500 font-bold flex items-center gap-2 tracking-tight">
                              <Calendar size={14} />
                              Created on {format(new Date(orderDetail.created_at), 'MMMM dd, yyyy HH:mm')}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-6 p-8 rounded-[40px] bg-white/[0.02] border border-white/5 shadow-inner">
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                              <Users size={14} className="text-primary-light" />
                              Participants
                            </p>
                            <div className="space-y-6">
                              <div className="flex items-center justify-between group">
                                <span className="text-sm text-zinc-500 font-bold italic group-hover:text-zinc-400 transition-colors">Customer</span>
                                <div className="text-right">
                                  <p className="text-sm font-black text-zinc-100">{orderDetail.customer_name}</p>
                                  <p className="text-[10px] text-zinc-600 font-medium">{orderDetail.customer_phone}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between group">
                                <span className="text-sm text-zinc-500 font-bold italic group-hover:text-zinc-400 transition-colors">Current Courier</span>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <p className="text-sm font-black text-zinc-100">{orderDetail.courier_name || 'Assigning...'}</p>
                                    <p className="text-[10px] text-zinc-600 font-medium">{orderDetail.courier_phone || '---'}</p>
                                  </div>
                                  <div className="h-10 w-10 rounded-2xl bg-zinc-800 overflow-hidden border border-white/10 shadow-lg shrink-0">
                                    <img src={`https://ui-avatars.com/api/?name=${orderDetail.courier_name || 'U'}&background=random`} alt="" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-6 p-8 rounded-[40px] bg-white/[0.02] border border-white/5 shadow-inner">
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                              <BarChart3 size={14} className="text-primary-light" />
                              Financial Overview
                            </p>
                            <div className="space-y-6">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-zinc-500 font-bold italic">Base Fare</span>
                                <span className="text-sm font-black text-zinc-100">Rp {parseInt(orderDetail.base_fare).toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-zinc-500 font-bold italic">Platform Fee</span>
                                <span className="text-sm font-black text-zinc-400">Rp {parseInt(orderDetail.platform_fee).toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                <span className="text-sm font-black text-primary-light uppercase tracking-widest">Total Amount</span>
                                <span className="text-xl font-black text-zinc-100">Rp {parseInt(orderDetail.total_amount).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-10">
                          <h3 className="text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-4">
                            <Clock className="text-primary-light" size={28} />
                            Logical Event Stream
                          </h3>
                          <div className="relative pl-12 space-y-12">
                            <div className="absolute left-5 top-2 bottom-2 w-[2px] bg-gradient-to-b from-primary via-primary/50 to-transparent" />
                            {orderDetail.events?.map((event: any, i: number) => (
                              <div key={i} className="relative">
                                <div className={cn(
                                  "absolute -left-[33px] top-1 w-4 h-4 rounded-full border-4 border-zinc-950",
                                  i === 0 ? "bg-primary shadow-[0_0_15px_rgba(0,100,55,0.8)]" : "bg-zinc-700"
                                )} />
                                <div className="flex items-start justify-between">
                                  <div className="space-y-1">
                                    <p className={cn("text-lg font-black tracking-tight", i === 0 ? "text-zinc-100" : "text-zinc-500")}>
                                      {event.event_type.replace(/_/g, ' ').toUpperCase()}
                                    </p>
                                    <p className="text-xs text-zinc-600 font-bold italic leading-relaxed">{event.description || 'System automatic log entry'}</p>
                                  </div>
                                  <p className="text-sm font-black text-zinc-600 font-mono bg-white/5 px-3 py-1 rounded-lg">
                                    {format(new Date(event.created_at), 'HH:mm:ss')}
                                  </p>
                                </div>
                              </div>
                            ))}
                            {!orderDetail.events?.length && (
                              <p className="text-zinc-600 font-bold italic text-sm">No events recorded yet.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="lg:w-96 space-y-10">
                        <div className="space-y-4">
                           <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                             <MapPin size={14} className="text-primary-light" />
                             Dynamic Map View
                           </p>
                           <div className="h-72 rounded-[40px] bg-zinc-900 border border-white/5 relative overflow-hidden group shadow-2xl">
                             <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/106.8456,-6.2088,12/600x600?access_token=mock')] bg-cover bg-center grayscale opacity-40 group-hover:scale-110 transition-all duration-1000" />
                             <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
                             <div className="absolute bottom-8 left-8 right-8">
                               <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Live Telemetry</p>
                               <p className="text-sm font-black text-white truncate leading-none">Last sync: Just now</p>
                             </div>
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                <div className="w-6 h-6 bg-primary rounded-full animate-ping opacity-75" />
                                <div className="w-4 h-4 bg-primary rounded-full relative z-10 border-2 border-white shadow-2xl shadow-primary/50" />
                             </div>
                           </div>
                        </div>

                        <div className="space-y-4">
                          <button 
                            onClick={() => {
                              if (confirm('Initiate manual courier reassignment?')) {
                                reassignMutation.mutate(orderDetail.id)
                              }
                            }}
                            disabled={reassignMutation.isPending}
                            className="w-full py-6 rounded-[32px] bg-primary text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                          >
                            {reassignMutation.isPending ? <Loader2 size={20} className="animate-spin" /> : <Truck size={20} />}
                            Manual Reassign
                          </button>
                          <button 
                            onClick={() => {
                              const description = prompt('Reason for flagging this order?')
                              if (description) {
                                flagIssueMutation.mutate({ orderId: orderDetail.id, type: 'manual_flag', description })
                              }
                            }}
                            disabled={flagIssueMutation.isPending}
                            className="w-full py-6 rounded-[32px] bg-red-500/10 text-red-400 border border-red-500/20 font-black uppercase tracking-[0.2em] text-[10px] hover:bg-red-500/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                          >
                            {flagIssueMutation.isPending ? <Loader2 size={20} className="animate-spin" /> : <AlertCircle size={20} />}
                            Flag Issue
                          </button>
                        </div>

                        <div className="p-8 rounded-[40px] bg-zinc-900 border border-white/5 space-y-6 shadow-inner">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Evidence Vault</p>
                            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-zinc-500">
                              {orderDetail.proofs?.length || 0} proof
                            </span>
                          </div>
                          {orderDetail.proofs?.length ? (
                            <div className="space-y-4">
                              {orderDetail.proofs.map((proof: any) => (
                                <div key={proof.id} className="rounded-[28px] bg-white/[0.03] border border-white/10 p-4 space-y-3">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <p className="text-sm font-black text-zinc-100">{proof.proof_label || proof.scan_type}</p>
                                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                                        {proof.proof_category || 'operational'} {proof.recorded_at ? `• ${format(new Date(proof.recorded_at), 'HH:mm')}` : ''}
                                      </p>
                                    </div>
                                    {proof.reason_code && (
                                      <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/20 text-[10px] font-black uppercase">
                                        {proof.reason_code.replace(/_/g, ' ')}
                                      </span>
                                    )}
                                  </div>
                                  {(proof.reason_note || proof.override_reason) && (
                                    <p className="text-xs text-zinc-400 leading-relaxed">
                                      {proof.reason_note || proof.override_reason}
                                    </p>
                                  )}
                                  {proof.photo_url ? (
                                    <button
                                      type="button"
                                      onClick={() => window.open(uploadUrl(proof.photo_url), '_blank', 'noopener,noreferrer')}
                                      className="w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-zinc-800"
                                    >
                                      <img src={uploadUrl(proof.photo_url)} className="w-full h-full object-cover" alt={proof.proof_label || proof.scan_type} />
                                    </button>
                                  ) : (
                                    <div className="rounded-2xl bg-zinc-800 border border-white/10 p-5 text-center">
                                      <Package size={24} className="mx-auto text-zinc-700 mb-2" />
                                      <span className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.2em] block">No Photo</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="aspect-square rounded-[32px] bg-zinc-800 border border-white/10 flex items-center justify-center group overflow-hidden relative">
                              <div className="text-center space-y-2">
                                <Package size={32} className="mx-auto text-zinc-700 group-hover:text-primary transition-colors" />
                                <span className="text-[10px] font-black text-zinc-700 group-hover:text-zinc-500 transition-colors uppercase tracking-[0.2em] block">No Photo</span>
                              </div>
                            </div>
                          )}
                          {orderDetail.safety_events?.length ? (
                            <div className="rounded-[28px] bg-red-500/5 border border-red-500/10 p-4 space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Operational Review</p>
                              <p className="text-xs text-zinc-400">
                                {orderDetail.safety_events[0].message || 'Ada event operasional terkait order ini.'}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-10 bg-white/[0.02] border-t border-white/5 flex justify-end">
                    <button 
                      onClick={() => setSelectedOrderId(null)}
                      className="px-12 py-5 rounded-2xl bg-zinc-800 text-zinc-400 font-black uppercase tracking-widest text-[10px] hover:bg-zinc-700 hover:text-white transition-all border border-white/5"
                    >
                      Close Context
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-20 text-center space-y-4">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                  <p className="text-zinc-500 font-black uppercase tracking-widest text-xs">Failed to load order metadata</p>
                  <button onClick={() => setSelectedOrderId(null)} className="text-primary-light font-bold text-xs uppercase tracking-widest">Return to Grid</button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
