import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { StatusBadge } from '../components/StatusBadge'
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground-muted">Face Verifications</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Tinjau antrean verifikasi wajah kurir yang tertunda atau gagal otomatis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-2xl border border-border bg-surface/[0.03] p-1">
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
                  status === item.key ? 'bg-primary text-on-primary' : 'text-foreground-muted hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? <AdminPageSkeleton /> : <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-3xl border border-border bg-surface/[0.03] overflow-hidden flex flex-col h-[680px]">
          <div className="border-b border-border p-5">
            <p className="text-sm font-bold text-foreground-muted">{verifications.length} antrean verifikasi</p>
            <p className="mt-1 text-xs text-foreground-muted">Klik item untuk membuka detail verifikasi.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-foreground-muted">Memuat antrean...</div>
            ) : verifications.length === 0 ? (
              <div className="flex flex-col h-48 items-center justify-center text-foreground-muted gap-2">
                <UserCheck className="h-8 w-8 opacity-20"  aria-hidden="true"/>
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
                      active?.id === item.id ? 'border-primary bg-primary/10' : 'border-border bg-surface-subtle hover:bg-surface/[0.06]'
                    )}
                  >
                    <div className="mt-0.5 rounded-full bg-surface-subtle p-2 shrink-0">
                      <UserCheck className="h-4 w-4 text-foreground-muted"  aria-hidden="true"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground-muted text-sm truncate">{item.full_name || 'Tanpa Nama'}</p>
                      <p className="text-xs text-foreground-muted mt-1">NIK: {item.nik || '-'}</p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase">
                        <span className="rounded-full border border-border px-2 py-0.5 text-foreground-muted">{item.verification_type}</span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-foreground-muted">Score: {item.liveness_score || '-'}/1</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface/[0.03] p-6">
          {!active ? (
            <div className="flex min-h-[520px] items-center justify-center text-foreground-muted text-sm">Pilih antrean verifikasi untuk review.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-foreground-muted">Face Verification Detail</p>
                  <h2 className="mt-2 text-2xl font-black text-foreground-muted">{active.full_name || 'Tanpa Nama'}</h2>
                </div>
                <StatusBadge status={active.status} labelPrefix="Face verification status" className="text-xs uppercase tracking-wider" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-sm font-bold text-foreground-muted uppercase tracking-wider mb-3">Foto Wajah</h3>
                  <div className="rounded-2xl border border-border overflow-hidden bg-surface-subtle aspect-[3/4] relative flex items-center justify-center">
                    {active.image_url ? (
                      <img 
                        src={resolveUploadUrl(active.image_url)} 
                        alt="Face" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="text-foreground-muted text-sm">
                        Tidak ada foto
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border border-border bg-surface-subtle p-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted border-b border-border pb-2">Informasi Kurir</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-1"><span className="text-foreground-muted">Nama:</span> <span className="font-bold text-foreground-muted">{active.full_name || '-'}</span></div>
                      <div className="flex justify-between py-1"><span className="text-foreground-muted">NIK:</span> <span className="text-foreground-muted font-mono">{active.nik || '-'}</span></div>
                      <div className="flex justify-between py-1"><span className="text-foreground-muted">No. HP:</span> <span className="text-foreground-muted">{active.phone || '-'}</span></div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-subtle p-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted border-b border-border pb-2">Data Verifikasi</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-1"><span className="text-foreground-muted">Tipe:</span> <span className="text-foreground-muted uppercase font-bold text-xs bg-surface-subtle px-2 py-0.5 rounded">{active.verification_type}</span></div>
                      {active.order_id && (
                        <div className="flex justify-between py-1"><span className="text-foreground-muted">Order ID:</span> <span className="font-mono text-xs text-primary">{active.order_id}</span></div>
                      )}
                      <div className="flex justify-between py-1"><span className="text-foreground-muted">Liveness Score:</span> <span className="font-bold text-foreground-muted">{active.liveness_score || 'N/A'}</span></div>
                      <div className="flex justify-between py-1"><span className="text-foreground-muted">Waktu:</span> <span className="text-foreground-muted text-xs">{new Date(active.created_at).toLocaleString('id-ID')}</span></div>
                    </div>
                  </div>

                  {active.status === 'pending_review' && (
                    <div className="pt-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => reviewVerification.mutate({ id: active.id, action: 'approve' })}
                        disabled={reviewVerification.isPending}
                        className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary shadow-lg transition hover:bg-primary/90 disabled:opacity-50"
                      >
                        Approve (Valid)
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewVerification.mutate({ id: active.id, action: 'reject' })}
                        disabled={reviewVerification.isPending}
                        className="flex-1 rounded-xl border border-error bg-error-surface px-4 py-3 text-sm font-bold text-error transition hover:bg-error-surface disabled:opacity-50"
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
