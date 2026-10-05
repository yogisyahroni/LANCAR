import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, PlugZap, RefreshCw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import type { MerchantPOSIntegrationStatus, MerchantPOSReconciliationItem } from '../lib/types'
import { MerchantPageSkeleton } from '../components/Skeleton'

const stateLabel: Record<string, string> = {
  healthy: 'Terhubung',
  degraded: 'Perlu diperiksa',
  unavailable: 'Tidak tersedia',
  unknown: 'Belum diketahui',
}

function ConnectorState({ state, enabled }: { state: string; enabled: boolean }) {
  if (!enabled || state === 'unavailable') return <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
  if (state === 'healthy') return <CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
  return <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
}

export default function Integrations() {
  const [status, setStatus] = useState<MerchantPOSIntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reconciliation, setReconciliation] = useState<MerchantPOSReconciliationItem[]>([])

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true)
    try {
      const response = await api.get<MerchantPOSIntegrationStatus>('/merchant/integrations/pos')
      setStatus(response.data)
      const reconciliationResponse = await api.get<{ items: MerchantPOSReconciliationItem[] }>('/merchant/integrations/pos/reconciliation?limit=100')
      setReconciliation(reconciliationResponse.data.items || [])
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Status integrasi belum dapat dimuat'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  if (loading) return <MerchantPageSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">Integrasi operasional</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500">Pantau koneksi kasir dan perangkat toko. Status di halaman ini hanya membaca kondisi dari server.</p>
        </div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:border-emerald-300 hover:text-emerald-900 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan
        </button>
      </div>

      {!status ? (
        <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Status integrasi belum tersedia. Coba segarkan beberapa saat lagi.</section>
      ) : (
        <>
          <section className="grid gap-4 rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm md:grid-cols-3">
            <div><p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Pemilik katalog</p><p className="mt-2 text-sm font-bold text-zinc-800">{status.catalog_ownership}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Pemilik stok</p><p className="mt-2 text-sm font-bold text-zinc-800">{status.inventory_ownership}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Aturan penerimaan</p><p className="mt-2 text-sm font-bold text-zinc-800">{status.customer_acceptance_rule}</p></div>
          </section>

          <section className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900"><PlugZap className="h-5 w-5" /></span>
              <div><h2 className="font-black text-zinc-900">Koneksi perangkat</h2><p className="text-sm text-zinc-500">Tidak ada kredensial atau secret yang ditampilkan di portal.</p></div>
            </div>
            {!status.connectors.length ? <p className="mt-6 rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">Belum ada integrasi yang terhubung.</p> : <div className="mt-5 space-y-3">{status.connectors.map((connector) => <article key={`${connector.provider_code}-${connector.branch_id || 'all'}`} className="rounded-2xl border border-zinc-100 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><ConnectorState state={connector.state} enabled={connector.enabled} /><div><h3 className="font-black text-zinc-900">{connector.provider_name}</h3><p className="mt-1 text-xs text-zinc-500">{connector.branch_id ? `Outlet ${connector.branch_id}` : 'Semua outlet'}</p></div></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">{connector.enabled ? (stateLabel[connector.state] || connector.state) : 'Nonaktif'}</span></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-zinc-400">Kegagalan beruntun</p><p className="mt-1 font-bold text-zinc-800">{connector.consecutive_failures}</p></div><div><p className="text-xs text-zinc-400">Pencocokan terbuka</p><p className="mt-1 font-bold text-zinc-800">{connector.open_reconciliation}</p></div><div><p className="text-xs text-zinc-400">Pesanan tertunda</p><p className="mt-1 font-bold text-zinc-800">{connector.pending_order_deliveries}</p></div></div>{connector.availability_reason && <p className="mt-3 text-xs leading-relaxed text-amber-700">{connector.availability_reason}</p>}</article>)}</div>}
          </section>
          <section className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-zinc-900">Perlu dicocokkan</h2><p className="mt-1 text-sm text-zinc-500">Pesanan atau sinkronisasi yang belum dikonfirmasi perangkat toko.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{reconciliation.length} terbuka</span></div>
            {reconciliation.length === 0 ? <p className="mt-5 rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900">Semua pengiriman perangkat sudah memiliki hasil yang tersimpan.</p> : <div className="mt-5 space-y-3">{reconciliation.map((item) => <article key={item.id} className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-zinc-900">{item.resource_type === 'order' ? 'Pesanan' : item.resource_type === 'catalog' ? 'Menu' : 'Stok'} · {item.resource_id}</p><span className="text-xs font-bold text-amber-800">Percobaan {item.attempts}</span></div><p className="mt-1 text-sm text-zinc-600">{item.reason || 'Menunggu konfirmasi dari integrasi.'}</p><p className="mt-2 text-xs text-zinc-400">Terakhir diperbarui {new Date(item.last_seen_at).toLocaleString('id-ID')}</p></article>)}</div>}
          </section>
        </>
      )}
    </div>
  )
}
