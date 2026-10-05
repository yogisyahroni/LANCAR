import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, FileKey2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { createClientId } from '../lib/clientId'
import { cn } from '../lib/utils'

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

type Approval = {
  id: string
  merchant_id: string
  merchant_name: string
  requested_by: string
  requester_name?: string | null
  change_type: 'bank_account' | 'payout' | 'merchant_config' | string
  status: ApprovalStatus
  approval_reference?: string | null
  approver_name?: string | null
  rejecter_name?: string | null
  rejection_reason?: string | null
  expires_at: string
  created_at: string
  approved_at?: string | null
  rejected_at?: string | null
}

const changeTypeLabel: Record<string, string> = {
  bank_account: 'Perubahan rekening payout',
  payout: 'Pencairan dana',
  merchant_config: 'Perubahan konfigurasi merchant',
}

const statusLabel: Record<ApprovalStatus, string> = {
  pending: 'Menunggu keputusan',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  expired: 'Kedaluwarsa',
}

export default function MerchantSecurityApprovals() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ApprovalStatus | 'all'>('pending')
  const [references, setReferences] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['merchant-security-approvals', status],
    queryFn: async () => {
      const response = await api.get<{ data: Approval[] }>(`/admin/merchant-security-approvals${status === 'all' ? '' : `?status=${status}`}`)
      return response.data.data || []
    },
  })

  const approve = useMutation({
    mutationFn: async ({ id, reference }: { id: string; reference: string }) => {
      const response = await api.post(`/admin/merchant-security-approvals/${id}/approve`, { approval_reference: reference }, { headers: { 'X-Idempotency-Key': createClientId(`merchant-approval-approve-${id}`) } })
      return response.data
    },
    onSuccess: () => {
      toast.success('Permintaan disetujui')
      void queryClient.invalidateQueries({ queryKey: ['merchant-security-approvals'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Persetujuan gagal diproses'),
  })

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await api.post(`/admin/merchant-security-approvals/${id}/reject`, { reason }, { headers: { 'X-Idempotency-Key': createClientId(`merchant-approval-reject-${id}`) } })
      return response.data
    },
    onSuccess: () => {
      toast.success('Permintaan ditolak')
      void queryClient.invalidateQueries({ queryKey: ['merchant-security-approvals'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Penolakan gagal diproses'),
  })

  const items = data || []
  return <div className="space-y-6">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground-muted">Kontrol maker-checker</p>
      <h1 className="mt-1 text-2xl font-black text-foreground">Persetujuan perubahan merchant</h1>
      <p className="mt-2 max-w-3xl text-sm text-foreground-muted">Tinjau permintaan sensitif dari Portal Mitra. Orang yang membuat permintaan tidak boleh menyetujui atau menolaknya sendiri; semua keputusan memerlukan sesi keamanan dan tercatat di audit.</p>
    </div>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-surface/[0.03] p-2">
      {(['pending', 'approved', 'rejected', 'expired', 'all'] as const).map((value) => <button key={value} type="button" onClick={() => setStatus(value)} className={cn('rounded-xl px-3 py-2 text-sm font-bold', status === value ? 'bg-primary text-on-primary' : 'text-foreground-muted hover:bg-surface-subtle')}>{value === 'all' ? 'Semua' : statusLabel[value]}</button>)}
    </div>

    {isLoading ? <div className="rounded-3xl border border-border bg-surface/[0.03] p-8 text-sm text-foreground-muted">Memuat permintaan…</div> : error ? <div className="rounded-3xl border border-error/30 bg-error-surface p-6 text-sm text-error">Daftar persetujuan belum dapat dimuat. Coba lagi setelah sesi Admin tersambung.</div> : items.length === 0 ? <div className="rounded-3xl border border-dashed border-border bg-surface/[0.03] p-10 text-center text-sm text-foreground-muted">Tidak ada permintaan pada filter ini.</div> : <div className="grid gap-4">
      {items.map((item) => <article key={item.id} className="rounded-3xl border border-border bg-surface/[0.03] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><FileKey2 className="h-5 w-5" /></div><div><h2 className="font-black text-foreground">{item.merchant_name}</h2><p className="mt-1 text-sm text-foreground-muted">{changeTypeLabel[item.change_type] || item.change_type}</p><p className="mt-1 text-xs text-foreground-muted">Diajukan oleh {item.requester_name || 'akun merchant'} · {new Date(item.created_at).toLocaleString('id-ID')}</p></div></div>
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold', item.status === 'pending' ? 'border-warning bg-warning-surface text-warning' : item.status === 'approved' ? 'border-success bg-success-surface text-success' : 'border-border bg-surface-subtle text-foreground-muted')}>{item.status === 'pending' ? <Clock3 className="h-3.5 w-3.5" /> : item.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{statusLabel[item.status]}</span>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-foreground-muted">Batas keputusan</p><p className="mt-1 font-bold text-foreground">{new Date(item.expires_at).toLocaleString('id-ID')}</p></div><div><p className="text-xs text-foreground-muted">Jenis perubahan</p><p className="mt-1 font-bold text-foreground">{changeTypeLabel[item.change_type] || item.change_type}</p></div><div><p className="text-xs text-foreground-muted">ID permintaan</p><p className="mt-1 truncate font-mono text-xs text-foreground-muted" title={item.id}>{item.id}</p></div></div>
        {item.status === 'pending' ? <div className="mt-5 grid gap-3 border-t border-border pt-4 lg:grid-cols-[1fr_auto_1fr_auto]"><label className="text-sm font-bold">Referensi keputusan<input value={references[item.id] || ''} onChange={(event) => setReferences({ ...references, [item.id]: event.target.value })} placeholder="Nomor tiket / catatan" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal text-foreground" /></label><button type="button" disabled={approve.isPending || !(references[item.id] || '').trim()} onClick={() => approve.mutate({ id: item.id, reference: (references[item.id] || '').trim() })} className="self-end rounded-xl bg-success px-4 py-2.5 text-sm font-bold text-on-success disabled:opacity-50">Setujui</button><label className="text-sm font-bold">Alasan penolakan<input value={reasons[item.id] || ''} onChange={(event) => setReasons({ ...reasons, [item.id]: event.target.value })} placeholder="Wajib jika menolak" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal text-foreground" /></label><button type="button" disabled={reject.isPending || !(reasons[item.id] || '').trim()} onClick={() => reject.mutate({ id: item.id, reason: (reasons[item.id] || '').trim() })} className="self-end rounded-xl bg-error px-4 py-2.5 text-sm font-bold text-on-error disabled:opacity-50">Tolak</button></div> : item.status === 'rejected' && item.rejection_reason ? <p className="mt-4 rounded-xl border border-error/30 bg-error-surface p-3 text-sm text-error">Alasan: {item.rejection_reason}</p> : item.status === 'approved' ? <p className="mt-4 rounded-xl border border-success/30 bg-success-surface p-3 text-sm text-success">Disetujui oleh {item.approver_name || 'Admin'}{item.approval_reference ? ` · ${item.approval_reference}` : ''}</p> : null}
      </article>)}
    </div>}
  </div>
}
