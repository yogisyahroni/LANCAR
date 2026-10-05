import { useEffect, useState } from 'react'
import { Download, History, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import type { MerchantAuditEntry } from '../lib/types'

export default function Audit() {
  const [items, setItems] = useState<MerchantAuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const response = await api.get<{ data: MerchantAuditEntry[]; total: number }>('/merchant/audit-logs?limit=100&offset=0')
    setItems(response.data?.data || [])
    setTotal(response.data?.total || 0)
  }

  useEffect(() => {
    load().catch((error) => toast.error(apiErrorMessage(error, 'Riwayat aktivitas belum dapat dimuat'))).finally(() => setLoading(false))
  }, [])

  const exportCsv = async () => {
    try {
      const response = await api.get<Blob>('/merchant/audit-logs?format=csv&limit=100&offset=0', { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'riwayat-aktivitas-merchant.csv'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Riwayat aktivitas belum dapat diekspor'))
    }
  }

  if (loading) return <div className="flex items-center gap-2 rounded-2xl bg-white p-8 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat riwayat aktivitas…</div>

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-black text-zinc-900">Riwayat aktivitas</h1><p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">Catatan perubahan pada bisnis dan outlet yang sedang dipilih. Data ini berasal dari server dan tidak menampilkan isi sensitif.</p></div>
      <button onClick={() => void exportCsv()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50"><Download className="h-4 w-4" /> Ekspor CSV</button>
    </div>
    <section className="overflow-hidden rounded-[1.75rem] border border-zinc-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4"><div className="flex items-center gap-2 font-black text-zinc-900"><History className="h-5 w-5 text-emerald-800" /> Aktivitas tercatat</div><span className="text-sm font-bold text-zinc-500">{total} kejadian</span></div>
      {!items.length ? <div className="p-10 text-center text-sm text-zinc-500">Belum ada aktivitas tercatat untuk outlet ini.</div> : <div className="divide-y divide-zinc-100">{items.map((item) => <article key={item.id} className="grid gap-2 px-5 py-4 md:grid-cols-[10rem_1fr_auto] md:items-start"><time className="text-xs font-semibold text-zinc-500">{new Date(item.created_at).toLocaleString('id-ID')}</time><div><p className="font-bold text-zinc-900">{item.action}</p><p className="mt-1 text-xs text-zinc-500">{item.actor_role || 'Akun mitra'} · {item.actor_id}</p>{item.failure_reason && <p className="mt-1 text-xs text-red-600">{item.failure_reason}</p>}</div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${item.result === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{item.result === 'success' ? 'Berhasil' : 'Gagal'}{item.status ? ` · ${item.status}` : ''}</span></article>)}</div>}
    </section>
  </div>
}
