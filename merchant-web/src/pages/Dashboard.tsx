import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CheckCheck, Clock3, Loader2, Power, ReceiptText, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { MerchantPageSkeleton } from '../components/Skeleton'
import type { Merchant, MerchantOrder, OrderListResponse, SalesReportSummary } from '../lib/types'
import { rupiah } from '../lib/types'

const isToday = (iso?: string | null) => {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

export default function Dashboard() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [orders, setOrders] = useState<MerchantOrder[]>([])
  const [report, setReport] = useState<SalesReportSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [jamBuka, setJamBuka] = useState('')
  const [jamTutup, setJamTutup] = useState('')
  const [savingHours, setSavingHours] = useState(false)

  const load = useCallback(async () => {
    try {
      const [profileRes, ordersRes] = await Promise.all([
        api.get<Merchant>('/merchant/profile'),
        api.get<OrderListResponse>('/merchant/orders?page=1&page_size=50'),
      ])
      setMerchant(profileRes.data)
      setJamBuka((profileRes.data.jam_buka || '08:00').slice(0, 5))
      setJamTutup((profileRes.data.jam_tutup || '22:00').slice(0, 5))
      setOrders(ordersRes.data?.orders || [])
      try {
        const rep = await api.get<SalesReportSummary>('/merchant/reports?period=daily')
        setReport(rep.data)
      } catch {
        console.warn('GET /merchant/reports tidak tersedia — statistik harian dihitung dari daftar pesanan')
        setReport(null)
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat dashboard'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const toggleOpen = async () => {
    if (!merchant) return
    setToggling(true)
    try {
      const res = await api.post<Merchant>('/merchant/toggle-open', { is_open: !merchant.is_open })
      setMerchant(res.data)
      toast.success(res.data.is_open ? `Toko ${res.data.nama_toko} BUKA` : 'Toko TUTUP')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal mengubah status toko'))
    } finally {
      setToggling(false)
    }
  }

  const saveHours = async () => {
    setSavingHours(true)
    try {
      const res = await api.patch<Merchant>('/merchant/profile', { jam_buka: jamBuka, jam_tutup: jamTutup })
      setMerchant(res.data)
      toast.success('Jam operasional disimpan')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menyimpan jam operasional'))
    } finally {
      setSavingHours(false)
    }
  }

  if (loading) {
    return <MerchantPageSkeleton />
  }

  if (!merchant) {
    return <p className="rounded-2xl border border-zinc-100 bg-white p-8 text-center text-sm text-zinc-500">Profil toko tidak dapat dimuat. Coba muat ulang halaman.</p>
  }

  if (merchant.verification_status !== 'approved') {
    const rejected = merchant.verification_status === 'rejected'
    return (
      <div className={`rounded-[1.75rem] border bg-white p-10 text-center shadow-sm ${rejected ? 'border-red-200' : 'border-amber-200'}`}>
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${rejected ? 'bg-red-100' : 'bg-amber-100'}`}>
          <Clock3 className={`h-7 w-7 ${rejected ? 'text-red-600' : 'text-amber-600'}`} />
        </div>
        <h1 className="mt-4 text-2xl font-black text-zinc-900">{rejected ? 'Pendaftaran ditolak' : 'Toko menunggu verifikasi admin'}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
          {rejected
            ? 'Toko belum lolos verifikasi. Hubungi support TEMBUS untuk info lebih lanjut.'
            : `${merchant.nama_toko} sedang diperiksa tim TEMBUS (1×24 jam kerja). Fitur portal akan aktif otomatis setelah disetujui.`}
        </p>
        <Link to="/masuk" className="mt-6 inline-block rounded-xl border border-zinc-200 px-5 py-3 font-bold text-zinc-700 transition hover:border-zinc-300">
          Keluar dari portal
        </Link>
      </div>
    )
  }

  const todayOrders = orders.filter((o) => isToday(o.created_at))
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.total_price_idr || 0), 0)
  const newCount = orders.filter((o) => o.status === 'pending_merchant').length
  const preparingCount = orders.filter((o) => o.status === 'preparing').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">Halo, {merchant.nama_toko} 👋</h1>
          <p className="mt-1 text-sm text-zinc-500">{merchant.alamat}</p>
        </div>
        <button
          onClick={toggleOpen}
          disabled={toggling}
          className={`inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold shadow-md transition disabled:opacity-60 ${
            merchant.is_open
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
              : 'bg-zinc-800 text-white hover:bg-black'
          }`}
        >
          <Power className="h-5 w-5" />
          {toggling ? 'Memproses…' : merchant.is_open ? 'Toko BUKA — Tutup?' : 'Toko TUTUP — Buka?'}
        </button>
      </div>

      {newCount > 0 && (
        <Link to="/pesanan" className="block rounded-2xl border-2 border-[#F97316]/40 bg-orange-50 p-5 transition hover:bg-orange-100">
          <span className="font-bold text-orange-800">{newCount} pesanan baru menunggu konfirmasi</span>
          <span className="ml-2 text-sm text-orange-600">Klik untuk proses →</span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ReceiptText} label="Pesanan hari ini" value={String(report?.total_orders ?? todayOrders.length)} accent />
        <StatCard icon={TrendingUp} label="Omzet hari ini" value={rupiah(report?.gmv_idr ?? todayRevenue)} hint={report ? null : 'dari 50 order terakhir'} />
        <StatCard icon={Clock3} label="Sedang dimasak" value={String(preparingCount)} hint={`${newCount} baru masuk`} />
        <StatCard icon={CheckCheck} label="Completion rate" value={`${Math.round(merchant.completion_rate_pct ?? 0)}%`} hint={merchant.avg_rating ? `Rating ${merchant.avg_rating.toFixed(1)} (${merchant.rating_count} ulasan)` : undefined} />
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-zinc-900">Pesanan terbaru</h2>
            <Link to="/pesanan" className="text-sm font-bold text-emerald-900 hover:underline">Lihat semua</Link>
          </div>
          <div className="mt-4 divide-y divide-zinc-100">
            {orders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-zinc-800">#{o.order_number || o.id.slice(0, 8)}</p>
                  <p className="truncate text-xs text-zinc-400">{o.customer_name} · {rupiah(o.total_price_idr)}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>
            ))}
            {orders.length === 0 && <p className="py-8 text-center text-sm text-zinc-400">Belum ada pesanan masuk.</p>}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
            <h2 className="font-black text-zinc-900">Jam operasional</h2>
            <p className="mt-1 text-xs text-zinc-400">Ubah jam buka/tutup tokomu.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-zinc-500">Jam buka</span>
                <input type="time" value={jamBuka} onChange={(e) => setJamBuka(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-900" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-zinc-500">Jam tutup</span>
                <input type="time" value={jamTutup} onChange={(e) => setJamTutup(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-900" />
              </label>
            </div>
            <button onClick={saveHours} disabled={savingHours} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60">
              {savingHours && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Jam
            </button>
          </div>

          <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
            <h2 className="font-black text-zinc-900">Status toko</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600">
              <li className="flex justify-between"><span>Status</span><b className={merchant.is_open ? 'text-emerald-700' : 'text-red-600'}>{merchant.is_open ? 'BUKA' : 'TUTUP'}</b></li>
              <li className="flex justify-between"><span>Jam operasional</span><b>{merchant.jam_buka?.slice(0,5) || '-'} – {merchant.jam_tutup?.slice(0,5) || '-'}</b></li>
              <li className="flex justify-between"><span>Min. order</span><b>{merchant.min_order_idr ? rupiah(merchant.min_order_idr) : 'Tanpa minimum'}</b></li>
              {merchant.paused_until && <li className="flex justify-between"><span>Pause sementara</span><b className="text-amber-600">sampai {new Date(merchant.paused_until).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b></li>}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
