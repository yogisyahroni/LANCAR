import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, Clock, ExternalLink, FileCheck2, Store, XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'

const docTypeLabels: Record<string, string> = {
  ktp_pemilik: 'KTP Pemilik',
  foto_tempat_usaha: 'Foto Tempat Usaha',
  rekening_bank: 'Rekening Bank',
  nib: 'NIB / Izin Usaha (opsional)',
}

const resolveUploadUrl = (fileUrl?: string) => {
  if (!fileUrl) return ''
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  try {
    const base = new URL(api.defaults.baseURL || window.location.origin)
    return `${base.origin}${fileUrl}`
  } catch {
    return fileUrl
  }
}

const formatIDR = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v)

export default function Merchants() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('pending')
  const [selected, setSelected] = useState<any>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-merchants', status],
    queryFn: async () => {
      const res = await api.get('/admin/merchants', { params: { status } })
      return res.data.merchants || []
    }
  })

  const { data: detail } = useQuery({
    queryKey: ['admin-merchant-detail', selected?.id],
    queryFn: async () => {
      const res = await api.get(`/admin/merchants/${selected.id}`)
      return res.data
    },
    enabled: Boolean(selected?.id)
  })

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/merchants/${id}/approve`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-merchants'] })
      setSelected(null)
      toast.success('Merchant disetujui')
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message)
  })

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.post(`/admin/merchants/${id}/reject`, { reason })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-merchants'] })
      setSelected(null)
      setShowReject(false)
      setRejectReason('')
      toast.success('Merchant ditolak')
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message)
  })

  const merchants = data || []
  const active = selected || merchants[0]
  const documents = active ? (detail?.documents || []) : []
  const menuItems = active ? (detail?.menu_items || []) : []
  const hasMenu = Array.isArray(menuItems) && menuItems.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Merchant Review</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Review pendaftaran merchant food delivery sebelum toko bisa terima order.
          </p>
        </div>
        <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {['pending', 'approved', 'rejected', 'all'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setStatus(item); setSelected(null) }}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-bold capitalize transition',
                status === item ? 'bg-primary text-white' : 'text-zinc-400 hover:text-white'
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 p-5">
            <p className="text-sm font-bold text-zinc-100">{merchants.length} merchant</p>
            <p className="mt-1 text-xs text-zinc-500">Klik merchant untuk membuka detail review.</p>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-3">
            {isLoading ? (
              <div className="p-6 text-sm text-zinc-500">Loading merchants...</div>
            ) : merchants.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">Belum ada merchant pada status ini.</div>
            ) : merchants.map((item: any) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={cn(
                  'mb-2 w-full rounded-2xl border p-4 text-left transition',
                  active?.id === item.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-zinc-950/50 hover:bg-white/[0.06]'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-zinc-100">{item.nama_toko}</p>
                    <p className="mt-1 text-xs text-zinc-500">{item.phone || item.email || '—'}</p>
                  </div>
                  {item.verification_status === 'approved'
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    : item.verification_status === 'rejected'
                      ? <XCircle className="h-5 w-5 text-red-400" />
                      : <AlertTriangle className="h-5 w-5 text-amber-300" />}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase">
                  <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">{item.verification_status}</span>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">{item.is_open ? 'Buka' : 'Tutup'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          {!active ? (
            <div className="flex min-h-[520px] items-center justify-center text-zinc-500">Pilih merchant untuk review.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">Merchant</p>
                  <h2 className="mt-1 text-2xl font-bold text-zinc-100">{active.nama_toko}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{active.alamat}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">
                      <Clock className="mr-1 inline h-3 w-3" />
                      {active.jam_buka || '?'} – {active.jam_tutup || '?'}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">
                      Completion {active.completion_rate_pct ?? 0}%
                    </span>
                    {active.lokasi_lat != null && (
                      <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-400">
                        {active.lokasi_lat.toFixed(4)}, {active.lokasi_lng?.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {active.verification_status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => approve.mutate(active.id)}
                        disabled={approve.isPending}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {approve.isPending ? 'Menyetujui...' : 'Setujui'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowReject(true); setRejectReason('') }}
                        className="rounded-xl bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/20"
                      >
                        Tolak
                      </button>
                    </>
                  )}
                  {active.verification_status !== 'pending' && (
                    <span className={cn(
                      'rounded-xl px-4 py-2 text-sm font-bold',
                      active.verification_status === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                    )}>
                      {active.verification_status === 'approved' ? '✓ Disetujui' : '✗ Ditolak'}
                    </span>
                  )}
                </div>
              </div>

              {showReject && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                  <p className="text-sm font-bold text-red-300">Alasan penolakan</p>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950 p-3 text-sm text-zinc-100 outline-none focus:border-red-400"
                    placeholder="Contoh: dokumen tidak jelas, nama toko menyesatkan..."
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => reject.mutate({ id: active.id, reason: rejectReason })}
                      disabled={reject.isPending || !rejectReason.trim()}
                      className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-400 disabled:opacity-50"
                    >
                      {reject.isPending ? 'Menolak...' : 'Konfirmasi Tolak'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReject(false)}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-zinc-400 hover:text-white"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">Dokumen Verifikasi</p>
                {documents.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">Belum ada dokumen.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {documents.map((doc: any) => (
                      <a
                        key={doc.id}
                        href={resolveUploadUrl(doc.file_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/50 p-3 transition hover:bg-white/[0.06]"
                      >
                        <FileCheck2 className="h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-zinc-100">{docTypeLabels[doc.doc_type] || doc.doc_type}</p>
                          <p className="text-xs text-zinc-500">{new Date(doc.uploaded_at).toLocaleString('id-ID')}</p>
                        </div>
                        <ExternalLink className="h-4 w-4 shrink-0 text-zinc-500" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">Menu ({(Array.isArray(menuItems) ? menuItems.length : 0)} item)</p>
                {!hasMenu ? (
                  <p className="mt-2 text-sm text-zinc-500">Belum ada menu.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {menuItems.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-zinc-950/50 p-3">
                        <div>
                          <p className="text-sm font-bold text-zinc-100">{item.nama}</p>
                          <p className="text-xs text-zinc-500">{item.kategori || 'Tanpa kategori'} • prep {item.prep_time_minutes || 15} mnt</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            'rounded-full px-2 py-1 text-[10px] font-bold uppercase',
                            item.is_available ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-700/40 text-zinc-400'
                          )}>
                            {item.is_available ? 'Tersedia' : 'Habis'}
                          </span>
                          <span className="text-sm font-bold text-zinc-100">{formatIDR(item.harga)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
