import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, XCircle, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { AdminPageSkeleton } from '../components/ui/Skeleton'

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

export default function CourierFaceVerifications() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('pending_review')
  const [selected, setSelected] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['courier-face-verifications', status],
    queryFn: async () => {
      const res = await api.get(`/admin/couriers/face-verifications`, { params: { status } })
      return res.data.data || []
    }
  })

  const reviewVerification = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' }) => {
      const res = await api.post(`/admin/couriers/face-verifications/${id}/review`, { action })
      return res.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['courier-face-verifications'] })
      setSelected(null)
      toast.success(variables.action === 'approve' ? 'Verifikasi disetujui' : 'Verifikasi ditolak')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || 'Terjadi kesalahan')
    }
  })

  const verifications = data || []
  const active = selected || verifications[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Face Verifications</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Tinjau antrean verifikasi wajah kurir yang tertunda atau gagal otomatis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            {[
              { key: 'pending_review', label: 'Pending Review' },
              { key: 'verified', label: 'Verified' },
              { key: 'failed', label: 'Failed' }
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setStatus(item.key)
                  setSelected(null)
                }}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-bold transition',
                  status === item.key ? 'bg-primary text-white' : 'text-zinc-400 hover:text-white'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? <AdminPageSkeleton /> : <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col h-[680px]">
          <div className="border-b border-white/10 p-5">
            <p className="text-sm font-bold text-zinc-100">{verifications.length} antrean verifikasi</p>
            <p className="mt-1 text-xs text-zinc-500">Klik item untuk membuka detail verifikasi.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-zinc-500">Memuat antrean...</div>
            ) : verifications.length === 0 ? (
              <div className="flex flex-col h-48 items-center justify-center text-zinc-500 gap-2">
                <UserCheck className="h-8 w-8 opacity-20" />
                <p className="text-sm">Belum ada antrean verifikasi pada status ini.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {verifications.map((item: any) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                    className={cn(
                      'w-full text-left rounded-2xl border p-4 transition flex items-start gap-3',
                      active?.id === item.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-zinc-950/50 hover:bg-white/[0.06]'
                    )}
                  >
                    <div className="mt-0.5 rounded-full bg-white/10 p-2 shrink-0">
                      <UserCheck className="h-4 w-4 text-zinc-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-100 text-sm truncate">{item.full_name || 'Tanpa Nama'}</p>
                      <p className="text-xs text-zinc-500 mt-1">NIK: {item.nik || '-'}</p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase">
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-zinc-400">{item.verification_type}</span>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-zinc-400">Score: {item.liveness_score || '-'}/1</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          {!active ? (
            <div className="flex min-h-[520px] items-center justify-center text-zinc-500 text-sm">Pilih antrean verifikasi untuk review.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-500">Face Verification Detail</p>
                  <h2 className="mt-2 text-2xl font-black text-zinc-100">{active.full_name || 'Tanpa Nama'}</h2>
                </div>
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider border",
                  active.status === 'verified' ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" :
                    active.status === 'failed' ? "border-red-500/20 bg-red-500/10 text-red-400" :
                      "border-amber-500/20 bg-amber-500/10 text-amber-400"
                )}>
                  {active.status === 'verified' && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {active.status === 'failed' && <XCircle className="h-3.5 w-3.5" />}
                  {active.status === 'pending_review' && <Clock className="h-3.5 w-3.5" />}
                  {active.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Foto Wajah</h3>
                  <div className="rounded-2xl border border-white/10 overflow-hidden bg-zinc-950/60 aspect-[3/4] relative flex items-center justify-center">
                    {active.image_url ? (
                      <img 
                        src={resolveUploadUrl(active.image_url)} 
                        alt="Face" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="text-zinc-500 text-sm">
                        Tidak ada foto
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-white/10 pb-2">Informasi Kurir</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-1"><span className="text-zinc-500">Nama:</span> <span className="font-bold text-zinc-100">{active.full_name || '-'}</span></div>
                      <div className="flex justify-between py-1"><span className="text-zinc-500">NIK:</span> <span className="text-zinc-200 font-mono">{active.nik || '-'}</span></div>
                      <div className="flex justify-between py-1"><span className="text-zinc-500">No. HP:</span> <span className="text-zinc-200">{active.phone || '-'}</span></div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-white/10 pb-2">Data Verifikasi</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-1"><span className="text-zinc-500">Tipe:</span> <span className="text-zinc-200 uppercase font-bold text-xs bg-white/5 px-2 py-0.5 rounded">{active.verification_type}</span></div>
                      {active.order_id && (
                        <div className="flex justify-between py-1"><span className="text-zinc-500">Order ID:</span> <span className="font-mono text-xs text-primary">{active.order_id}</span></div>
                      )}
                      <div className="flex justify-between py-1"><span className="text-zinc-500">Liveness Score:</span> <span className="font-bold text-zinc-100">{active.liveness_score || 'N/A'}</span></div>
                      <div className="flex justify-between py-1"><span className="text-zinc-500">Waktu:</span> <span className="text-zinc-300 text-xs">{new Date(active.created_at).toLocaleString('id-ID')}</span></div>
                    </div>
                  </div>

                  {active.status === 'pending_review' && (
                    <div className="pt-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => reviewVerification.mutate({ id: active.id, action: 'approve' })}
                        disabled={reviewVerification.isPending}
                        className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-primary/90 disabled:opacity-50"
                      >
                        Approve (Valid)
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewVerification.mutate({ id: active.id, action: 'reject' })}
                        disabled={reviewVerification.isPending}
                        className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Reject (Palsu)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>}
    </div>
  )
}
