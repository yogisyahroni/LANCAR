import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Loader2, LockKeyhole, LogOut, MonitorSmartphone, PauseCircle, PlayCircle, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import { clearSession, publishWebAuthEvent } from '../lib/auth'
import { merchantOnboardingStatus, merchantStatusLabel } from '../lib/merchant-status'
import type { Merchant } from '../lib/types'
import { rupiah } from '../lib/types'
import { MerchantPageSkeleton } from '../components/Skeleton'
import { loadMerchantPortalContext } from '../lib/portal-context'

type WebSession = {
  id: string
  device: string
  ip: string
  location?: string
  timestamp: string
  is_current: boolean
}

const sessionDeviceLabel = (session: WebSession) => {
  const device = session.device?.trim()
  if (!device) return 'Perangkat tidak dikenal'
  return device.length > 100 ? `${device.slice(0, 97)}...` : device
}

const sessionTimeLabel = (timestamp: string) => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia'
  return date.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function Settings() {
  const navigate = useNavigate()
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingHours, setSavingHours] = useState(false)
  const [savingMinOrder, setSavingMinOrder] = useState(false)
  const [jamBuka, setJamBuka] = useState('')
  const [jamTutup, setJamTutup] = useState('')
  const [minOrder, setMinOrder] = useState('')
  const [sessions, setSessions] = useState<WebSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [revokingSessions, setRevokingSessions] = useState(false)

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await api.get<{ sessions?: WebSession[]; data?: { sessions?: WebSession[] } }>('/auth/web/sessions')
      setSessions(res.data?.sessions || res.data?.data?.sessions || [])
    } catch (err) {
      // Session management is helpful but must not prevent the merchant from
      // using the rest of the settings page when the list is temporarily down.
      setSessions([])
      console.warn('Daftar perangkat belum dapat dimuat:', apiErrorMessage(err))
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMerchantPortalContext()
      .then((context) => {
        const merchant = context.merchant
        setMerchant(merchant)
        setJamBuka((merchant.jam_buka || '08:00').slice(0, 5))
        setJamTutup((merchant.jam_tutup || '22:00').slice(0, 5))
        setMinOrder(String(merchant.min_order_idr ?? 0))
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Gagal memuat profil')))
      .finally(() => setLoading(false))
    void loadSessions()
  }, [loadSessions])

  const revokeOtherSessions = async () => {
    if (!sessions.some((session) => !session.is_current)) return
    if (!window.confirm('Keluar dari semua perangkat lain? Perangkat ini tetap masuk.')) return
    setRevokingSessions(true)
    try {
      await api.post('/auth/web/sessions/logout-others')
      await loadSessions()
      toast.success('Perangkat lain sudah dikeluarkan')
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Perangkat lain belum dapat dikeluarkan'))
    } finally {
      setRevokingSessions(false)
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

  if (loading) return <MerchantPageSkeleton />
  if (!merchant) return <p className="rounded-2xl border border-zinc-100 bg-white p-8 text-center text-sm text-zinc-500">Profil tidak dapat dimuat.</p>
  const onboardingStatus = merchantOnboardingStatus(merchant.onboarding_status, merchant.verification_status)

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
            ['Status pendaftaran', merchantStatusLabel(onboardingStatus)],
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

        <div className="rounded-xl bg-zinc-50 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900">
                <MonitorSmartphone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-800">Perangkat dan sesi</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">Lihat perangkat yang sedang masuk ke Portal Mitra dan keluarkan perangkat lain bila perlu.</p>
              </div>
            </div>
            <button
              onClick={() => void loadSessions()}
              disabled={sessionsLoading || revokingSessions}
              aria-label="Muat ulang daftar perangkat"
              className="rounded-lg border border-zinc-200 p-2 text-zinc-500 transition hover:border-emerald-900/30 hover:text-emerald-900 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${sessionsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {sessionsLoading ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat daftar perangkat…</div>
          ) : sessions.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500">Belum ada informasi perangkat yang dapat ditampilkan.</p>
          ) : (
            <>
              <ul className="mt-4 space-y-2">
                {sessions.map((session) => (
                  <li key={session.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-zinc-800">{sessionDeviceLabel(session)}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">{session.ip || 'Alamat jaringan tidak tersedia'} · {sessionTimeLabel(session.timestamp)}</p>
                    </div>
                    {session.is_current && <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">Perangkat ini</span>}
                  </li>
                ))}
              </ul>
              {sessions.some((session) => !session.is_current) && (
                <button
                  onClick={() => void revokeOtherSessions()}
                  disabled={revokingSessions}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                >
                  {revokingSessions ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  {revokingSessions ? 'Mengeluarkan perangkat…' : 'Keluarkan perangkat lain'}
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3.5 opacity-60">
          <div>
            <p className="text-sm font-bold text-zinc-800">Ubah password</p>
            <p className="text-xs text-zinc-400">Fitur ubah password belum tersedia. Hubungi bantuan TEMBUS untuk reset.</p>
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
            onClick={() => {
              void api.post('/auth/web/logout').catch(() => undefined).finally(() => {
                publishWebAuthEvent('logout')
                clearSession()
                navigate('/masuk', { replace: true })
              })
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
          >
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </section>
    </div>
  )
}
