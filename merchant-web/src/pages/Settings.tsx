import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Loader2, LockKeyhole, LogOut, PauseCircle, PlayCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import type { Merchant } from '../lib/types'
import { rupiah } from '../lib/types'

export default function Settings() {
  const navigate = useNavigate()
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingHours, setSavingHours] = useState(false)
  const [savingMinOrder, setSavingMinOrder] = useState(false)
  const [jamBuka, setJamBuka] = useState('')
  const [jamTutup, setJamTutup] = useState('')
  const [minOrder, setMinOrder] = useState('')

  useEffect(() => {
    api
      .get<Merchant>('/merchant/profile')
      .then((res) => {
        setMerchant(res.data)
        setJamBuka((res.data.jam_buka || '08:00').slice(0, 5))
        setJamTutup((res.data.jam_tutup || '22:00').slice(0, 5))
        setMinOrder(String(res.data.min_order_idr ?? 0))
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Gagal memuat profil')))
      .finally(() => setLoading(false))
  }, [])

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

  const saveMinOrder = async () => {
    setSavingMinOrder(true)
    try {
      const res = await api.patch<Merchant>('/merchant/profile', { min_order_idr: Number(minOrder.replace(/\D/g, '')) || 0 })
      setMerchant(res.data)
      toast.success('Minimal order disimpan')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menyimpan minimal order'))
    } finally {
      setSavingMinOrder(false)
    }
  }

  const togglePause = useCallback(async () => {
    if (!merchant) return
    try {
      const res = merchant.paused_until
        ? await api.post<Merchant>('/merchant/resume')
        : await api.post<Merchant>('/merchant/pause', { duration_minutes: 30 })
      setMerchant(res.data)
      toast.success(merchant.paused_until ? 'Toko dilanjutkan' : 'Toko dipause 30 menit')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal mengubah status pause'))
    }
  }, [merchant])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-900" /></div>
  if (!merchant) return <p className="rounded-2xl border border-zinc-100 bg-white p-8 text-center text-sm text-zinc-500">Profil tidak dapat dimuat.</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900">Pengaturan</h1>
        <p className="mt-1 text-sm text-zinc-500">Kelola profil toko & preferensi operasional.</p>
      </div>

      <section className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
        <h2 className="font-black text-zinc-900">Profil Toko</h2>
        <dl className="mt-4 overflow-hidden rounded-xl border border-zinc-100">
          {[
            ['Nama toko', merchant.nama_toko],
            ['Alamat', merchant.alamat],
            ['Jenis usaha', merchant.business_type === 'perusahaan' ? 'Perusahaan' : 'Perorangan'],
            ['Status verifikasi', merchant.verification_status === 'approved' ? 'Disetujui' : merchant.verification_status === 'rejected' ? 'Ditolak' : 'Menunggu verifikasi'],
            ['Rating', merchant.avg_rating ? `${merchant.avg_rating.toFixed(1)} ★ (${merchant.rating_count} ulasan)` : 'Belum ada rating'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-6 border-b border-zinc-100 px-4 py-3 last:border-0">
              <dt className="text-sm text-zinc-500">{k}</dt>
              <dd className="max-w-[60%] text-right text-sm font-bold text-zinc-800">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
          <h2 className="font-black text-zinc-900">Jam Operasional</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-zinc-500">Jam buka</span>
              <input type="time" value={jamBuka} onChange={(e) => setJamBuka(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-900" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-zinc-500">Jam tutup</span>
              <input type="time" value={jamTutup} onChange={(e) => setJamTutup(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-900" />
            </label>
          </div>
          <button onClick={saveHours} disabled={savingHours} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60">
            {savingHours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Simpan
          </button>
        </div>

        <div className="rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
          <h2 className="font-black text-zinc-900">Minimal Order</h2>
          <p className="mt-1 text-xs text-zinc-400">Subtotal minimum per pesanan. 0 = tanpa minimum.</p>
          <label className="mt-3 block">
            <span className="text-xs font-bold text-zinc-500">Nominal (Rp)</span>
            <input
              inputMode="numeric"
              value={minOrder ? `Rp${Number(minOrder.replace(/\D/g, '')).toLocaleString('id-ID')}` : ''}
              onChange={(e) => setMinOrder(e.target.value)}
              placeholder="Rp0"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-900"
            />
          </label>
          <p className="mt-1 text-xs text-zinc-400">{rupiah(Number(minOrder.replace(/\D/g, '')) || 0)}</p>
          <button onClick={saveMinOrder} disabled={savingMinOrder} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#003A20] px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60">
            {savingMinOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Simpan
          </button>
        </div>
      </section>

      <section className="space-y-4 rounded-[1.75rem] border border-zinc-100 bg-white p-6 shadow-sm">
        <h2 className="font-black text-zinc-900">Operasional & Akun</h2>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3.5">
          <div>
            <p className="text-sm font-bold text-zinc-800">{merchant.paused_until ? `Pause aktif sampai ${new Date(merchant.paused_until).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : 'Pause sementara'}</p>
            <p className="text-xs text-zinc-400">Hentikan order sementara tanpa mengubah jam operasional.</p>
          </div>
          <button onClick={togglePause} className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-60 ${merchant.paused_until ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
            {merchant.paused_until ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
            {merchant.paused_until ? 'Lanjutkan Toko' : 'Pause 30 Menit'}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3.5 opacity-60">
          <div>
            <p className="text-sm font-bold text-zinc-800">Ubah password</p>
            <p className="text-xs text-zinc-400">Fitur belum tersedia di backend — hubungi support untuk reset.</p>
          </div>
          <button
            onClick={() => console.warn('Endpoint ganti password belum tersedia di auth-service')}
            disabled
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-bold text-zinc-500"
          >
            <LockKeyhole className="h-4 w-4" /> Segera Hadir
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3.5">
          <div>
            <p className="text-sm font-bold text-red-800">Keluar dari portal</p>
            <p className="text-xs text-red-400/80">Sesi login akan dihapus dari browser ini.</p>
          </div>
          <button
            onClick={() => { localStorage.clear(); navigate('/masuk', { replace: true }) }}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
          >
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </section>
    </div>
  )
}
