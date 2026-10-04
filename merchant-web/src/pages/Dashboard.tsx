import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CheckCheck, Clock3, Loader2, PauseCircle, PlayCircle, Power, ReceiptText, TimerReset, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { MerchantPageSkeleton } from '../components/Skeleton'
import { merchantOnboardingStatus } from '../lib/merchant-status'
import type { Merchant, MerchantDashboard } from '../lib/types'
import { rupiah } from '../lib/types'
import { loadMerchantPortalContext } from '../lib/portal-context'

const stateLabels: Record<string, string> = {
  open: 'BUKA', closed: 'TUTUP', busy: 'RAMAI', paused: 'DIJEDA', temp_closed: 'TUTUP SEMENTARA', holiday: 'LIBUR',
}

export default function Dashboard() {
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [dashboard, setDashboard] = useState<MerchantDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [togglingOperatingState, setTogglingOperatingState] = useState(false)
  const [togglingAutoAccept, setTogglingAutoAccept] = useState(false)
  const [jamBuka, setJamBuka] = useState('')
  const [jamTutup, setJamTutup] = useState('')
  const [savingHours, setSavingHours] = useState(false)

  const load = useCallback(async () => {
    try {
      const [context, dashboardRes] = await Promise.all([
        loadMerchantPortalContext(),
        api.get<MerchantDashboard>('/merchant/dashboard'),
      ])
      setMerchant(context.merchant)
      setJamBuka((context.merchant.jam_buka || '08:00').slice(0, 5))
      setJamTutup((context.merchant.jam_tutup || '22:00').slice(0, 5))
      setDashboard(dashboardRes.data)
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat dashboard'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [load])

  const toggleOpen = async () => {
    if (!merchant) return
    const previous = merchant
    const nextOpen = !merchant.is_open
    setMerchant({ ...merchant, is_open: nextOpen, operating_state: nextOpen ? 'open' : 'closed' })
    setToggling(true)
    try {
      const res = await api.post<Merchant>('/merchant/toggle-open', { is_open: nextOpen })
      setMerchant(res.data)
      toast.success(res.data.is_open ? `Toko ${res.data.nama_toko} BUKA` : 'Toko TUTUP')
      await load()
    } catch (err) {
      setMerchant(previous)
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
      await load()
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menyimpan jam operasional'))
    } finally {
      setSavingHours(false)
    }
  }

  const toggleAutoAccept = async () => {
    if (!merchant) return
    const nextValue = !merchant.auto_accept_orders
    if (nextValue && dashboard && !dashboard.auto_accept.ready) {
      toast.error(`Belum siap: ${dashboard.auto_accept.blocking_reasons.join(' ')}`)
      return
    }
    const previous = merchant
    setMerchant({ ...merchant, auto_accept_orders: nextValue })
    setTogglingAutoAccept(true)
    try {
      const res = await api.patch<Merchant>('/merchant/order-settings/auto-accept', { auto_accept_orders: nextValue })
      setMerchant(res.data)
      toast.success(nextValue ? 'Terima otomatis diaktifkan' : 'Terima otomatis dinonaktifkan')
      await load()
    } catch (err) {
      setMerchant(previous)
      toast.error(apiErrorMessage(err, 'Pengaturan terima otomatis tidak dapat diubah'))
    } finally {
      setTogglingAutoAccept(false)
    }
  }

  const togglePause = async () => {
    if (!merchant) return
    const previous = merchant
    const paused = Boolean(merchant.paused_until && new Date(merchant.paused_until).getTime() > Date.now())
    const nextUntil = paused ? null : new Date(Date.now() + 30 * 60 * 1000).toISOString()
    setMerchant({ ...merchant, paused_until: nextUntil, busy_until: null, busy_extra_prep_minutes: 0, operating_state: paused ? (merchant.is_open ? 'open' : 'closed') : 'paused' })
    setTogglingOperatingState(true)
    try {
      const res = paused ? await api.post<Merchant>('/merchant/resume') : await api.post<Merchant>('/merchant/pause', { duration_minutes: 30 })
      setMerchant(res.data)
      toast.success(paused ? 'Toko dilanjutkan' : 'Toko dijeda 30 menit')
      await load()
    } catch (err) {
      setMerchant(previous)
      toast.error(apiErrorMessage(err, 'Gagal mengubah jeda toko'))
    } finally {
      setTogglingOperatingState(false)
    }
  }

  const setBusy = async () => {
    if (!merchant) return
    const previous = merchant
    const until = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    setMerchant({ ...merchant, paused_until: null, busy_until: until, busy_extra_prep_minutes: 15, operating_state: 'busy' })
    setTogglingOperatingState(true)
    try {
      const res = await api.post<Merchant>('/merchant/busy', { until, extra_prep_minutes: 15 })
      setMerchant(res.data)
      toast.success('Mode ramai aktif 30 menit · waktu siapkan bertambah 15 menit')
      await load()
    } catch (err) {
      setMerchant(previous)
      toast.error(apiErrorMessage(err, 'Gagal mengaktifkan mode ramai'))
    } finally {
      setTogglingOperatingState(false)
    }
  }

  if (loading) return <MerchantPageSkeleton />

  if (!merchant) {
    return <p className="rounded-2xl border border-zinc-100 bg-white p-8 text-center text-sm text-zinc-500">Profil toko tidak dapat dimuat. Coba muat ulang halaman.</p>
  }

  const onboardingStatus = merchantOnboardingStatus(merchant.onboarding_status, merchant.verification_status)
  if (onboardingStatus !== 'ACTIVE') {
    const rejected = onboardingStatus === 'REJECTED'
    const suspended = onboardingStatus === 'SUSPENDED'
    return (
      <div className={`rounded-[1.75rem] border bg-white p-10 text-center shadow-sm ${rejected || suspended ? 'border-red-200' : 'border-amber-200'}`}>
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${rejected || suspended ? 'bg-red-100' : 'bg-amber-100'}`}><Clock3 className={`h-7 w-7 ${rejected || suspended ? 'text-red-600' : 'text-amber-600'}`} /></div>
        <h1 className="mt-4 text-2xl font-black text-zinc-900">{rejected ? 'Pendaftaran perlu diperbaiki' : suspended ? 'Akses portal ditangguhkan' : 'Toko sedang diverifikasi'}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">{rejected ? 'Periksa alasan penolakan dan kirim ulang data melalui jalur yang diberikan TEMBUS.' : suspended ? 'Operasional portal dinonaktifkan untuk sementara. Hubungi bantuan TEMBUS untuk langkah pemulihan.' : `${merchant.nama_toko} sedang diperiksa tim TEMBUS. Fitur portal akan aktif setelah status menjadi disetujui.`}</p>
        <Link to="/masuk" className="mt-6 inline-block rounded-xl border border-zinc-200 px-5 py-3 font-bold text-zinc-700 transition hover:border-zinc-300">Kembali ke login</Link>
      </div>
    )
  }

  const orders = dashboard?.recent_orders || []
  const report = dashboard?.sales
  const newCount = dashboard?.orders?.new || 0
  const preparingCount = dashboard?.orders?.preparing || 0
  const state = merchant.operating_state || (merchant.is_open ? 'open' : 'closed')
  const dataAsOf = dashboard?.data_as_of ? new Date(dashboard.data_as_of).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-black tracking-tight text-zinc-900">Halo, {merchant.nama_toko} 👋</h1><p className="mt-1 text-sm text-zinc-500">{merchant.alamat}</p></div>
        <button onClick={toggleOpen} disabled={toggling} className={`inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold shadow-md transition disabled:opacity-60 ${merchant.is_open ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-zinc-800 text-white hover:bg-black'}`}><Power className="h-5 w-5" />{toggling ? 'Memproses…' : merchant.is_open ? 'Toko BUKA — Tutup?' : 'Toko TUTUP — Buka?'}</button>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-zinc-100 bg-white p-5 shadow-sm">
        <div><h2 className="font-black text-zinc-900">Terima otomatis</h2><p className="mt-1 max-w-2xl text-sm text-zinc-500">Pesanan baru langsung diproses sesuai kesiapan toko, menu, dan notifikasi yang diverifikasi server.</p></div>
        <button type="button" role="switch" aria-checked={Boolean(merchant.auto_accept_orders)} aria-label="Terima otomatis" onClick={toggleAutoAccept} disabled={togglingAutoAccept || (!merchant.auto_accept_orders && !dashboard?.auto_accept.ready)} title={!merchant.auto_accept_orders && !dashboard?.auto_accept.ready ? dashboard?.auto_accept.blocking_reasons.join(' ') : undefined} className={`relative h-8 w-14 shrink-0 rounded-full p-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${merchant.auto_accept_orders ? 'bg-emerald-700' : 'bg-zinc-300'}`}><span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${merchant.auto_accept_orders ? 'translate-x-6' : 'translate-x-0'}`} /></button>
      </section>

      {!merchant.auto_accept_orders && dashboard?.auto_accept.blocking_reasons.length ? <p className="-mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">Terima otomatis belum tersedia: {dashboard.auto_accept.blocking_reasons.join(' ')}</p> : null}
      {dashboard?.scope.branch_count && dashboard.scope.branch_count > 1 && !dashboard.scope.branch_scoped ? <p className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-800">Ringkasan ini mencakup {dashboard.scope.branch_count} outlet pada level bisnis. Filter per outlet belum tersedia untuk data order lama.</p> : null}
      {dashboard?.scope.branch_scoped ? <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">Dashboard sedang menampilkan outlet yang dipilih. Ringkasan penjualan dan pencairan tetap mengikuti level bisnis.</p> : null}
      {dashboard?.alerts.length ? <section className="space-y-2" aria-label="Peringatan operasional">{dashboard.alerts.map((alert) => <div key={alert.code} className={`rounded-2xl border px-4 py-3 ${alert.severity === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-100 bg-sky-50 text-sky-900'}`}><p className="text-sm font-bold">{alert.title}</p><p className="mt-1 text-xs opacity-80">{alert.description}</p></div>)}</section> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ReceiptText} label="Pesanan selesai hari ini" value={report ? String(report.total_orders) : '—'} accent hint={!report ? (dashboard?.scope.branch_scoped ? 'Tersedia pada ringkasan bisnis' : 'Belum tersedia untuk peran ini') : undefined} />
        <StatCard icon={TrendingUp} label="Omzet hari ini" value={report ? rupiah(report.gmv_idr) : '—'} hint={!report ? (dashboard?.scope.branch_scoped ? 'Tersedia pada ringkasan bisnis' : 'Belum tersedia untuk peran ini') : undefined} />
        <StatCard icon={Clock3} label="Pesanan baru" value={String(newCount)} hint={`${preparingCount} sedang disiapkan`} />
        <StatCard icon={CheckCheck} label="Completion rate" value={`${Math.round(merchant.completion_rate_pct ?? 0)}%`} hint={merchant.avg_rating ? `Rating ${merchant.avg_rating.toFixed(1)} (${merchant.rating_count} ulasan)` : undefined} />
      </div>
      {dataAsOf && <p className="text-right text-xs text-zinc-400">Data server diperbarui {dataAsOf}</p>}

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black text-zinc-900">Pesanan terbaru</h2><Link to="/pesanan" className="text-sm font-bold text-emerald-900 hover:underline">Lihat semua</Link></div><div className="mt-4 divide-y divide-zinc-100">{orders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 py-3.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-zinc-800">#{order.order_number || order.id.slice(0, 8)}</p><p className="truncate text-xs text-zinc-400">{order.customer_name} · {rupiah(order.total_price_idr)}</p></div><StatusBadge status={order.status} /></div>)}{orders.length === 0 && <p className="py-8 text-center text-sm text-zinc-400">Belum ada pesanan terbaru.</p>}</div></div>

        <div className="space-y-6"><div className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm"><h2 className="font-black text-zinc-900">Jam operasional</h2><p className="mt-1 text-xs text-zinc-400">Ubah jam buka/tutup tokomu.</p><div className="mt-4 grid grid-cols-2 gap-3"><label className="block"><span className="text-xs font-bold text-zinc-500">Jam buka</span><input type="time" value={jamBuka} onChange={(event) => setJamBuka(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-900" /></label><label className="block"><span className="text-xs font-bold text-zinc-500">Jam tutup</span><input type="time" value={jamTutup} onChange={(event) => setJamTutup(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-900" /></label></div><button onClick={saveHours} disabled={savingHours} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60">{savingHours && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Jam</button></div>

        <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-black text-zinc-900">Status toko</h2><TimerReset className="h-5 w-5 text-zinc-400" /></div><ul className="mt-3 space-y-2 text-sm text-zinc-600"><li className="flex justify-between"><span>Status</span><b className={state === 'open' || state === 'busy' ? 'text-emerald-700' : 'text-red-600'}>{stateLabels[state] || state}</b></li><li className="flex justify-between"><span>Jam operasional</span><b>{merchant.jam_buka?.slice(0, 5) || '-'} – {merchant.jam_tutup?.slice(0, 5) || '-'}</b></li><li className="flex justify-between"><span>Min. order</span><b>{merchant.min_order_idr ? rupiah(merchant.min_order_idr) : 'Tanpa minimum'}</b></li>{merchant.paused_until && <li className="flex justify-between"><span>Jeda sementara</span><b className="text-amber-600">sampai {new Date(merchant.paused_until).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b></li>}{merchant.busy_until && <li className="flex justify-between"><span>Mode ramai</span><b className="text-orange-600">sampai {new Date(merchant.busy_until).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} (+{merchant.busy_extra_prep_minutes || 0} mnt)</b></li>}</ul><div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={togglePause} disabled={togglingOperatingState} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition disabled:opacity-60 ${merchant.paused_until ? 'border-emerald-200 text-emerald-800 hover:bg-emerald-50' : 'border-amber-200 text-amber-800 hover:bg-amber-50'}`}>{merchant.paused_until ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}{merchant.paused_until ? 'Lanjutkan toko' : 'Jeda 30 menit'}</button><button type="button" onClick={setBusy} disabled={togglingOperatingState || Boolean(merchant.paused_until)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 px-3 py-2.5 text-xs font-bold text-orange-800 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"><TimerReset className="h-4 w-4" />Mode ramai 30 menit</button></div><p className="mt-3 text-xs leading-relaxed text-zinc-400">Mode ramai tetap menerima pesanan, tetapi menambah 15 menit waktu persiapan. Jeda menghentikan pesanan baru sementara.</p></div>
        </div>
      </section>
    </div>
  )
}
