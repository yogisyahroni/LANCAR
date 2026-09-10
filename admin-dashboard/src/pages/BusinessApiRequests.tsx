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
import { StatusBadge } from '../components/StatusBadge'

// Socket.IO
import { io } from 'socket.io-client';
// Ensure backend base url for socket. The dashboard proxy usually handles `/socket.io`.

type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

const requestStatusPresentation: Record<RequestStatus, { status: string; label: string; className: string }> = {
  PENDING: { status: 'pending_review', label: 'Menunggu review', className: 'border-warning bg-warning-surface' },
  APPROVED: { status: 'approved', label: 'Disetujui', className: 'border-success bg-success-surface' },
  REJECTED: { status: 'rejected', label: 'Ditolak', className: 'border-error bg-error-surface' },
}

const requestFilterLabels: Record<RequestStatus | 'ALL', string> = {
  ALL: 'Semua',
  PENDING: 'Menunggu review',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
}

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
  const presentation = requestStatusPresentation[status]
  return <StatusBadge status={presentation.status} labelPrefix="Business API request status" label={presentation.label} className={presentation.className} />
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
    const socketUrl = import.meta.env.VITE_SOCKET_URL || '/';
    const socket = io(socketUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
    
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
      <div className="flex flex-col gap-6 rounded-[40px] border border-border bg-gradient-to-br from-surface-subtle via-surface-subtle to-accent p-8 shadow-2xl shadow-scrim lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent-surface px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-accent">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Enterprise API Access
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-foreground">B2B API Requests</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground-muted">
            Kelola permohonan akses API dari mitra B2B/Enterprise. Tinjau kasus penggunaan dan setujui atau tolak permintaan untuk menerbitkan API Key.
          </p>
        </div>
        <button
          type="button"
          onClick={() => requestsQuery.refetch()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface-subtle px-5 py-3 text-xs font-black uppercase tracking-widest text-foreground-muted transition-all hover:bg-surface-subtle active:scale-[0.98]"
        >
          <RefreshCw className={cn('h-4 w-4', requestsQuery.isFetching && 'animate-spin')} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-[28px] border border-border bg-surface/[0.03] p-6 shadow-sm flex items-center gap-4">
          <div className="rounded-2xl border border-warning bg-warning-surface text-warning p-3">
            <Loader2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground-muted">Menunggu Review</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-foreground-muted">{pendingCount}</p>
          </div>
        </div>
      </div>

      <section className="rounded-[36px] border border-border bg-surface/[0.03] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                aria-pressed={filterStatus === status}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-bold transition-all",
                  filterStatus === status ? "bg-accent text-on-accent" : "bg-surface-subtle text-foreground-muted hover:bg-surface-subtle"
                )}
              >
                {requestFilterLabels[status]}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" aria-hidden="true" />
            <input
              aria-label="Search business API requests by company or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari perusahaan atau email"
              className="w-full rounded-2xl border border-border bg-background py-3 pl-11 pr-4 text-sm text-foreground-muted outline-none transition-all placeholder:text-foreground-muted focus:border-accent focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5">
          {requestsQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-[32px] bg-surface/[0.04]" />
            ))
          ) : filteredRequests.length === 0 ? (
            <div className="rounded-[32px] border border-dashed border-border p-12 text-center">
              <Briefcase className="mx-auto h-10 w-10 text-foreground-muted" aria-hidden="true" />
              <p className="mt-4 text-sm font-black uppercase tracking-widest text-foreground-muted">Tidak ada data permohonan</p>
            </div>
          ) : filteredRequests.map((req, index) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="rounded-[32px] border border-border bg-surface-subtle p-6 shadow-xl shadow-scrim flex flex-col xl:flex-row gap-6"
            >
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black text-foreground">{req.company_name}</h3>
                  <StatusPill status={req.status} />
                  <span className="text-xs text-foreground-muted">{new Date(req.created_at).toLocaleString('id-ID')}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-foreground-muted">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-foreground-muted" aria-hidden="true" />
                    <span>{req.contact_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-foreground-muted" aria-hidden="true" />
                    <a href={`mailto:${req.contact_email}`} className="text-accent hover:underline">{req.contact_email}</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-foreground-muted" aria-hidden="true" />
                    <span>{req.contact_phone || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-foreground-muted" aria-hidden="true" />
                    {req.company_website ? (
                      <a href={req.company_website} target="_blank" rel="noreferrer" className="text-accent hover:underline">{req.company_website}</a>
                    ) : '-'}
                  </div>
                </div>

                <div className="bg-surface-subtle rounded-2xl p-4 mt-4">
                  <h4 className="text-xs font-black uppercase text-foreground-muted tracking-widest mb-2">Use Case</h4>
                  <p className="text-sm leading-relaxed text-foreground-muted whitespace-pre-wrap">{req.use_case}</p>
                </div>
                <div className="text-xs text-foreground-muted font-medium">
                  Estimasi Volume: <span className="text-foreground">{req.monthly_volume || '-'}</span>
                </div>
                
                {req.status !== 'PENDING' && (
                  <div className="bg-scrim/50 border border-border rounded-2xl p-4 mt-4">
                    <p className="text-xs text-foreground-muted">
                      Di-review oleh <span className="text-foreground font-bold">{req.reviewed_by_name || 'Admin'}</span> pada {new Date(req.reviewed_at!).toLocaleString('id-ID')}
                    </p>
                    {req.notes && (
                      <p className="mt-2 text-sm text-foreground-muted italic">" {req.notes} "</p>
                    )}
                  </div>
                )}
              </div>

              {req.status === 'PENDING' && (
                <div className="xl:w-72 bg-surface-subtle rounded-2xl p-5 border border-border flex flex-col gap-4">
                  <h4 className="text-sm font-black uppercase text-foreground-muted tracking-widest text-center">Admin Review</h4>
                  <textarea
                    value={reviewNotes[req.id] || ''}
                    onChange={(e) => handleReviewNoteChange(req.id, e.target.value)}
                    placeholder="Catatan review (opsional)..."
                    className="w-full bg-scrim/50 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent resize-none h-24"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => reviewMutation.mutate({ id: req.id, action: 'reject', notes: reviewNotes[req.id] })}
                      disabled={reviewMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-error-surface border border-error py-2.5 text-xs font-black text-error hover:bg-error-surface transition-all"
                    >
                      <XCircle className="h-4 w-4" aria-hidden="true" /> Reject
                    </button>
                    <button
                      onClick={() => reviewMutation.mutate({ id: req.id, action: 'approve', notes: reviewNotes[req.id] })}
                      disabled={reviewMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-success border border-success py-2.5 text-xs font-black text-on-success shadow-lg shadow-success hover:bg-success transition-all"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve
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
