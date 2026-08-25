import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import OrderCard from '../components/OrderCard'
import type { MerchantOrder, OrderListResponse } from '../lib/types'

const TABS = [
  { key: 'baru', label: 'Baru', statuses: ['pending_merchant', 'scheduled'] },
  { key: 'preparing', label: 'Diproses', statuses: ['preparing'] },
  { key: 'siap', label: 'Siap / Kurir', statuses: ['searching', 'accepted', 'picking_up', 'picked_up', 'delivering'] },
  { key: 'selesai', label: 'Selesai', statuses: ['delivered'] },
  { key: 'batal', label: 'Batal', statuses: ['cancelled_by_merchant', 'cancelled_by_customer', 'cancelled_by_system'] },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function Orders() {
  const [tab, setTab] = useState<TabKey>('baru')
  const [orders, setOrders] = useState<MerchantOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const tabRef = useRef(tab)
  tabRef.current = tab

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const res = await api.get<OrderListResponse>('/merchant/orders?page=1&page_size=50')
      setOrders(res.data?.orders || [])
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat pesanan'))
    } finally {
      setLoading(false)
      if (showSpinner) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load(true)
    const t = setInterval(() => load(), 15000)
    return () => clearInterval(t)
  }, [load])

  const filtered = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)
    return orders
      .filter((o) => t?.statuses.includes(o.status as never))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  }, [orders, tab])

  const acceptOrder = async (id: string) => {
    try {
      await api.post(`/merchant/orders/${id}/accept`)
      toast.success('Order diterima — mulai masak!')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menerima order'))
    }
  }

  const rejectOrder = async (id: string, reason: string, detail: string) => {
    try {
      await api.post(`/merchant/orders/${id}/reject`, { reason, reject_reason: detail || reason })
      toast.success('Order ditolak')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menolak order'))
    }
  }

  const readyOrder = async (id: string) => {
    try {
      await api.post(`/merchant/orders/${id}/ready`)
      toast.success('Pesanan ditandai siap — mencari kurir')
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menandai pesanan siap'))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">Pesanan</h1>
          <p className="mt-1 text-sm text-zinc-500">Auto-refresh tiap 15 detik.</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-600 transition hover:border-emerald-900/30 hover:text-emerald-900 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Muat Ulang
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto rounded-full border border-zinc-100 bg-white p-1.5 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === t.key ? 'bg-[#003A20] text-white shadow-md shadow-emerald-900/20' : 'text-zinc-500 hover:text-emerald-900'
            }`}
          >
            {t.label}
            {t.key === 'baru' && orders.some((o) => o.status === 'pending_merchant') && (
              <span className={`ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full ${tab === 'baru' ? 'bg-orange-300' : 'bg-[#F97316]'}`} />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-900" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-12 text-center shadow-sm">
          <p className="font-bold text-zinc-700">Tidak ada pesanan di tab ini</p>
          <p className="mt-1 text-sm text-zinc-400">Pesanan baru akan muncul otomatis saat masuk.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((o) => (
            <OrderCard key={o.id} order={o} onAccept={acceptOrder} onReject={rejectOrder} onReady={readyOrder} />
          ))}
        </div>
      )}
    </div>
  )
}
