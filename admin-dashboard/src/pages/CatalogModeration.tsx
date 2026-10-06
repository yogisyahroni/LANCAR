import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, Image as ImageIcon, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { createClientId } from '../lib/clientId'

type CatalogItem = {
  id: string
  merchant_id: string
  merchant_name?: string
  branch_name?: string | null
  nama: string
  deskripsi?: string | null
  kategori?: string | null
  harga: number
  status: string
  moderation_status: string
  moderation_reason?: string | null
  image_url?: string | null
  version: number
  updated_at: string
}

const formatIDR = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0)

export default function CatalogModeration() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [rejecting, setRejecting] = useState<CatalogItem | null>(null)
  const [reason, setReason] = useState('')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-catalog-moderation', status],
    queryFn: async () => (await api.get('/admin/catalog/moderation', { params: { status, page_size: 100 } })).data as { items: CatalogItem[]; total: number },
  })
  const review = useMutation({
    mutationFn: async ({ item, decision, decisionReason }: { item: CatalogItem; decision: 'approved' | 'rejected'; decisionReason?: string }) => {
      const response = await api.patch(`/admin/catalog/moderation/${item.id}`, { status: decision, reason: decisionReason || undefined }, {
        headers: { 'X-Idempotency-Key': createClientId(`catalog-review-${item.id}-${decision}`) },
      })
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-catalog-moderation'] })
      setRejecting(null)
      setReason('')
      toast.success(variables.decision === 'approved' ? 'Menu disetujui untuk publikasi merchant' : 'Menu ditolak dan dikembalikan ke merchant')
    },
    onError: (error: any) => toast.error(error.response?.data?.error || error.message || 'Keputusan moderasi gagal disimpan'),
  })

  const items = data?.items || []
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6" id="main-content">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-light">Catalog governance</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">Review menu merchant</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground-muted">Setiap menu ditinjau sebelum masuk ke snapshot katalog customer. Keputusan tercatat dengan actor, alasan, versi, dan waktu.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-4 py-3 text-xs font-bold text-foreground-muted"><ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" /> Server-authoritative</div>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Status review katalog">
        {(['pending', 'approved', 'rejected'] as const).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={status === value} onClick={() => setStatus(value)} className={`rounded-xl px-4 py-2 text-sm font-black transition ${status === value ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-foreground-muted hover:bg-surface-subtle'}`}>
            {value === 'pending' ? 'Menunggu review' : value === 'approved' ? 'Disetujui' : 'Ditolak'}
          </button>
        ))}
        <span className="ml-auto self-center text-sm text-foreground-muted">{data?.total ?? 0} item</span>
      </div>

      {isLoading && <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-foreground-muted">Memuat queue katalog…</div>}
      {isError && <div role="alert" className="rounded-2xl border border-error/30 bg-error-surface p-5 text-sm font-bold text-error">Queue moderasi tidak dapat dimuat. Coba lagi setelah koneksi Admin pulih.</div>}
      {!isLoading && !isError && items.length === 0 && <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" /><p className="mt-3 font-black text-foreground">Tidak ada item pada status ini</p><p className="mt-1 text-sm text-foreground-muted">Perubahan katalog tetap harus melalui alur publish yang sah.</p></div>}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Daftar item katalog">
        {items.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="flex gap-4 p-5">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-subtle text-foreground-muted">
                {item.image_url ? <img src={item.image_url} alt={`Foto ${item.nama}`} className="h-full w-full object-cover" /> : <ImageIcon className="h-7 w-7" aria-hidden="true" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3"><h2 className="truncate text-lg font-black text-foreground">{item.nama}</h2><span className="rounded-full bg-warning-surface px-2 py-1 text-[11px] font-black uppercase text-warning">{item.moderation_status}</span></div>
                <p className="mt-1 text-sm font-bold text-primary-light">{formatIDR(item.harga)} · {item.kategori || 'Tanpa kategori'}</p>
                <p className="mt-2 text-xs text-foreground-muted">{item.merchant_name || item.merchant_id}{item.branch_name ? ` · ${item.branch_name}` : ''}</p>
                <p className="mt-1 text-xs text-foreground-muted">Status katalog: {item.status} · v{item.version}</p>
              </div>
            </div>
            {item.deskripsi && <p className="border-t border-border px-5 py-3 text-sm text-foreground-muted">{item.deskripsi}</p>}
            {item.moderation_reason && <p className="border-t border-border bg-error-surface px-5 py-3 text-sm text-error"><b>Alasan:</b> {item.moderation_reason}</p>}
             {status === 'pending' && <div className="flex flex-wrap gap-2 border-t border-border p-4"><button type="button" disabled={review.isPending} onClick={() => review.mutate({ item, decision: 'approved' })} className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-sm font-black text-on-success disabled:opacity-60"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Setujui</button><button type="button" disabled={review.isPending} onClick={() => { setRejecting(item); setReason('') }} className="inline-flex items-center gap-2 rounded-xl border border-error/30 px-4 py-2.5 text-sm font-black text-error disabled:opacity-60"><XCircle className="h-4 w-4" aria-hidden="true" /> Tolak</button><span className="ml-auto inline-flex items-center gap-1 text-xs text-foreground-muted"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> Diubah {new Date(item.updated_at).toLocaleString('id-ID')}</span></div>}
          </article>
        ))}
      </section>

      {rejecting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reject-title"><div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl"><h2 id="reject-title" className="text-xl font-black text-foreground">Tolak {rejecting.nama}</h2><p id="reject-reason-help" className="mt-2 text-sm text-foreground-muted">Alasan akan terlihat merchant dan disimpan sebagai audit. Minimal 10 karakter.</p><label htmlFor="rejection-reason" className="mt-4 block text-sm font-bold text-foreground">Alasan penolakan</label><textarea id="rejection-reason" aria-describedby="reject-reason-help" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={500} className="mt-1 w-full rounded-xl border border-border bg-surface-subtle p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-focus-ring" placeholder="Contoh: Foto menu tidak sesuai kebijakan katalog…" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setRejecting(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground-muted">Batal</button><button type="button" disabled={reason.trim().length < 10 || review.isPending} onClick={() => review.mutate({ item: rejecting, decision: 'rejected', decisionReason: reason.trim() })} className="rounded-xl bg-error px-4 py-2.5 text-sm font-black text-on-error disabled:opacity-60">Simpan penolakan</button></div></div></div>}
    </main>
  )
}
