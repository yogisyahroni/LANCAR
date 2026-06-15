import { useMemo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
  Globe,
  Briefcase
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

// Socket.IO
import { io } from 'socket.io-client';
// Ensure backend base url for socket. The dashboard proxy usually handles `/socket.io`.

type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

type ApiRequest = {
  id: string
  company_name: string
  company_website: string
  contact_name: string
  contact_email: string
  contact_phone: string
  monthly_volume: string
  use_case: string
  status: RequestStatus
  reviewed_by_name: string | null
  reviewed_at: string | null
  notes: string | null
  created_at: string
}

function StatusPill({ status }: { status: RequestStatus }) {
  const styles = {
    PENDING: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    APPROVED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    REJECTED: 'bg-red-500/10 text-red-300 border-red-500/20',
  }[status]

  return (
    <span className={cn('rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest', styles)}>
      {status}
    </span>
  )
}

export default function BusinessApiRequests() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<RequestStatus | 'ALL'>('ALL')
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  // WebSocket for real-time notifications
  useEffect(() => {
    // Attempting to connect to the backend
    // Assumes proxy is setup to forward `/socket.io` to the admin service
    const socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] });
    
    socket.on('new_api_request', (data) => {
      toast.info(`Permintaan API baru dari ${data.company_name} (${data.contact_email})`);
      queryClient.invalidateQueries({ queryKey: ['business-api-requests'] });
    });

    return () => {
      socket.disconnect();
    }
  }, [queryClient]);

  const requestsQuery = useQuery({
    queryKey: ['business-api-requests', filterStatus],
    queryFn: async () => {
      const statusParam = filterStatus !== 'ALL' ? filterStatus : ''
      const res = await api.get('/admin/business-api-requests', { params: { limit: 100, status: statusParam } })
      return (res.data?.data || []) as ApiRequest[]
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: 'approve' | 'reject', notes: string }) => {
      return api.post(`/admin/business-api-requests/${id}/${action}`, { notes })
    },
    onSuccess: (_res, variables) => {
      toast.success(`Request berhasil di-${variables.action === 'approve' ? 'setujui' : 'tolak'}`)
      queryClient.invalidateQueries({ queryKey: ['business-api-requests'] })
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Gagal memproses request'
      toast.error(msg)
    },
  })

  const requests = requestsQuery.data || []

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return requests
    return requests.filter((req) => 
      `${req.company_name} ${req.contact_name} ${req.contact_email} ${req.status}`.toLowerCase().includes(term)
    )
  }, [requests, search])

  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  const handleReviewNoteChange = (id: string, note: string) => {
    setReviewNotes(prev => ({ ...prev, [id]: note }))
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-6 rounded-[40px] border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-orange-950/30 p-8 shadow-2xl shadow-black/20 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-orange-300">
            <ShieldAlert className="h-4 w-4" />
            Enterprise API Access
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white">B2B API Requests</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Kelola permohonan akses API dari mitra B2B/Enterprise. Tinjau kasus penggunaan dan setujui atau tolak permintaan untuk menerbitkan API Key.
          </p>
        </div>
        <button
          type="button"
          onClick={() => requestsQuery.refetch()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-widest text-zinc-200 transition-all hover:bg-white/10 active:scale-[0.98]"
        >
          <RefreshCw className={cn('h-4 w-4', requestsQuery.isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 shadow-sm flex items-center gap-4">
          <div className="rounded-2xl border border-amber-500/10 bg-amber-500/10 text-amber-300 p-3">
            <Loader2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">Menunggu Review</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-zinc-100">{pendingCount}</p>
          </div>
        </div>
      </div>

      <section className="rounded-[36px] border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-bold transition-all",
                  filterStatus === status ? "bg-orange-500 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"
                )}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari perusahaan atau email"
              className="w-full rounded-2xl border border-white/10 bg-zinc-950 py-3 pl-11 pr-4 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-700 focus:border-orange-400/50 focus:ring-2 focus:ring-orange-400/10"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5">
          {requestsQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-[32px] bg-white/[0.04]" />
            ))
          ) : filteredRequests.length === 0 ? (
            <div className="rounded-[32px] border border-dashed border-white/10 p-12 text-center">
              <Briefcase className="mx-auto h-10 w-10 text-zinc-700" />
              <p className="mt-4 text-sm font-black uppercase tracking-widest text-zinc-500">Tidak ada data permohonan</p>
            </div>
          ) : filteredRequests.map((req, index) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="rounded-[32px] border border-white/10 bg-zinc-950/80 p-6 shadow-xl shadow-black/10 flex flex-col xl:flex-row gap-6"
            >
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black text-white">{req.company_name}</h3>
                  <StatusPill status={req.status} />
                  <span className="text-xs text-zinc-500">{new Date(req.created_at).toLocaleString('id-ID')}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-zinc-300">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-zinc-500" />
                    <span>{req.contact_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-zinc-500" />
                    <a href={`mailto:${req.contact_email}`} className="text-orange-400 hover:underline">{req.contact_email}</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-zinc-500" />
                    <span>{req.contact_phone || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-zinc-500" />
                    {req.company_website ? (
                      <a href={req.company_website} target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">{req.company_website}</a>
                    ) : '-'}
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-4 mt-4">
                  <h4 className="text-xs font-black uppercase text-zinc-500 tracking-widest mb-2">Use Case</h4>
                  <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">{req.use_case}</p>
                </div>
                <div className="text-xs text-zinc-400 font-medium">
                  Estimasi Volume: <span className="text-white">{req.monthly_volume || '-'}</span>
                </div>
                
                {req.status !== 'PENDING' && (
                  <div className="bg-black/50 border border-white/5 rounded-2xl p-4 mt-4">
                    <p className="text-xs text-zinc-400">
                      Di-review oleh <span className="text-white font-bold">{req.reviewed_by_name || 'Admin'}</span> pada {new Date(req.reviewed_at!).toLocaleString('id-ID')}
                    </p>
                    {req.notes && (
                      <p className="mt-2 text-sm text-zinc-300 italic">" {req.notes} "</p>
                    )}
                  </div>
                )}
              </div>

              {req.status === 'PENDING' && (
                <div className="xl:w-72 bg-white/5 rounded-2xl p-5 border border-white/10 flex flex-col gap-4">
                  <h4 className="text-sm font-black uppercase text-zinc-300 tracking-widest text-center">Admin Review</h4>
                  <textarea
                    value={reviewNotes[req.id] || ''}
                    onChange={(e) => handleReviewNoteChange(req.id, e.target.value)}
                    placeholder="Catatan review (opsional)..."
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500 resize-none h-24"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => reviewMutation.mutate({ id: req.id, action: 'reject', notes: reviewNotes[req.id] })}
                      disabled={reviewMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 py-2.5 text-xs font-black text-red-400 hover:bg-red-500/20 transition-all"
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                    <button
                      onClick={() => reviewMutation.mutate({ id: req.id, action: 'approve', notes: reviewNotes[req.id] })}
                      disabled={reviewMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 border border-emerald-500/50 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-900/50 hover:bg-emerald-500 transition-all"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  )
}
