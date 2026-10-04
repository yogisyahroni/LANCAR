import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ArrowRight, Clock3, Loader2, Lock, Mail, Store, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '../lib/api'
import { clearAccessToken, clearMerchantBranchSelection, clearMerchantDeviceSession, deviceId, markWebSessionEstablished } from '../lib/auth'
import { merchantOnboardingStatus } from '../lib/merchant-status'
import { loadMerchantPortalContext } from '../lib/portal-context'
import type { AuthResponse } from '../lib/types'

type Gate = 'none' | 'pending' | 'rejected' | 'suspended' | 'not_registered'

function GateCard({ tone, icon, title, children }: {
  tone: 'amber' | 'red' | 'emerald'
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  const border = tone === 'amber' ? 'border-amber-200' : tone === 'red' ? 'border-red-200' : 'border-zinc-100'
  const bg = tone === 'amber' ? 'bg-amber-100 text-amber-600' : tone === 'red' ? 'bg-red-100 text-red-600' : 'bg-emerald-900/5 text-emerald-900'
  return (
    <div className={`mt-10 rounded-[1.75rem] border ${border} bg-white p-8 shadow-sm`}>
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg}`}>{icon}</div>
      <h1 className="mt-4 text-2xl font-black text-zinc-900">{title}</h1>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-600">{children}</div>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gate, setGate] = useState<Gate>('none')
  const [merchantName, setMerchantName] = useState('')
  const [otpRequired, setOtpRequired] = useState(false)
  const [otpIdentifier, setOtpIdentifier] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSubmitting, setOtpSubmitting] = useState(false)

  const finishLogin = async (token: string, user: AuthResponse['user']) => {
    // Exchange the short-lived bearer token for an HttpOnly web session before
    // any merchant request. The token is never persisted in browser storage.
    await api.post('/auth/web/session/exchange', { access_token: token })
    clearAccessToken()
    markWebSessionEstablished({
      id: user?.id,
      name: user?.name || user?.full_name,
      email: user?.email || email.trim(),
    })

    clearMerchantBranchSelection()
    clearMerchantDeviceSession()
    toast.success('Login berhasil')

    let merchant
    try {
      merchant = (await loadMerchantPortalContext()).merchant
    } catch (profileErr) {
      const status = (profileErr as { response?: { status?: number } })?.response?.status
      if (status === 404 || status === 400 || status === 403) {
        setGate('not_registered')
        return
      }
      console.warn('Gagal memuat profil merchant:', apiErrorMessage(profileErr))
      navigate('/dashboard', { replace: true })
      return
    }

    setMerchantName(merchant.nama_toko)
    const onboardingStatus = merchantOnboardingStatus(merchant.onboarding_status, merchant.verification_status)
    if (onboardingStatus === 'REJECTED') {
      setGate('rejected')
      return
    }
    if (onboardingStatus === 'SUSPENDED') {
      setGate('suspended')
      return
    }
    if (onboardingStatus !== 'ACTIVE') {
      setGate('pending')
      return
    }
    const statePath = (location.state as { from?: string } | null)?.from
    const queryPath = new URLSearchParams(location.search).get('returnTo')
    const requestedPath = statePath || queryPath
    const destination = requestedPath && requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.startsWith('/masuk') ? requestedPath : '/dashboard'
    navigate(destination, { replace: true })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Email tidak valid.')
    if (!password) return setError('Password wajib diisi.')
    setLoading(true)
    setError('')
    try {
      const res = await api.post<AuthResponse>('/auth/customer/login/start', {
        email: email.trim(),
        password,
        device_id: deviceId(),
        device_info: { platform: 'web', app: 'merchant-web' },
      })
      if (res.data?.require_otp) {
        setOtpIdentifier(email.trim())
        setOtpCode('')
        setOtpRequired(true)
        toast.success('Kode verifikasi sudah dikirim')
        return
      }
      const token = res.data?.access_token || res.data?.data?.token
      if (!token) throw new Error(res.data?.message || 'Login gagal. Coba lagi.')
      await finishLogin(token, res.data.user)
    } catch (err) {
      setError(apiErrorMessage(err, 'Login gagal. Periksa email & password.'))
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(otpCode)) {
      setError('Masukkan 6 digit kode verifikasi.')
      return
    }
    setOtpSubmitting(true)
    setError('')
    try {
      const res = await api.post<AuthResponse>('/auth/otp/verify', {
        phone_number: otpIdentifier,
        code: otpCode,
        device_id: deviceId(),
        device_info: { platform: 'web', app: 'merchant-web' },
      })
      if (res.data?.require_2fa) throw new Error('Akun memerlukan verifikasi keamanan tambahan. Hubungi bantuan TEMBUS.')
      const token = res.data?.access_token || res.data?.data?.token
      if (!token) throw new Error('Kode verifikasi belum dapat menyelesaikan login.')
      await finishLogin(token, res.data.user)
      setOtpRequired(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Kode verifikasi salah atau sudah kedaluwarsa.'))
    } finally {
      setOtpSubmitting(false)
    }
  }

  const resendOtp = async () => {
    setOtpSubmitting(true)
    setError('')
    try {
      await api.post('/auth/otp/send', { phone_number: otpIdentifier })
      toast.success('Kode verifikasi baru sudah dikirim')
    } catch (err) {
      setError(apiErrorMessage(err, 'Kode belum dapat dikirim ulang. Coba beberapa saat lagi.'))
    } finally {
      setOtpSubmitting(false)
    }
  }

  if (otpRequired) {
    return (
      <Shell>
        <h1 className="mt-10 text-3xl font-black tracking-tight text-zinc-900">Verifikasi login</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">Masukkan 6 digit kode yang dikirim ke {otpIdentifier}. Kode berlaku selama 5 menit.</p>
        <form onSubmit={verifyOtp} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-zinc-700">Kode verifikasi</span>
            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 text-center text-xl font-black tracking-[0.35em] outline-none transition focus:border-emerald-900 focus:ring-2 focus:ring-emerald-900/10"
            />
          </label>
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button type="submit" disabled={otpSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#003A20] px-7 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-950 disabled:opacity-60">
            {otpSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {otpSubmitting ? 'Memverifikasi…' : 'Verifikasi dan masuk'}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => { setOtpRequired(false); setError('') }} className="font-semibold text-zinc-500 hover:text-zinc-900">Kembali</button>
            <button type="button" onClick={resendOtp} disabled={otpSubmitting} className="font-bold text-emerald-900 hover:underline disabled:opacity-50">Kirim ulang kode</button>
          </div>
        </form>
      </Shell>
    )
  }

  if (gate === 'pending') {
    return (
      <Shell>
        <GateCard tone="amber" icon={<Clock3 className="h-6 w-6" />} title="Menunggu verifikasi admin">
          <p>Pendaftaran toko <span className="font-bold text-zinc-900">{merchantName}</span> sedang diperiksa tim TEMBUS.</p>
          <p>Kamu bisa masuk ke dashboard setelah toko disetujui.</p>
          <button onClick={() => setGate('none')} className="mt-3 self-start rounded-xl border border-zinc-200 px-5 py-3 font-bold text-zinc-700 transition hover:border-zinc-300">
            Kembali ke halaman login
          </button>
        </GateCard>
      </Shell>
    )
  }

  if (gate === 'rejected') {
    return (
      <Shell>
        <GateCard tone="red" icon={<XCircle className="h-6 w-6" />} title="Pendaftaran ditolak">
          <p>Toko <span className="font-bold text-zinc-900">{merchantName}</span> belum lolos verifikasi.</p>
          <p>Silakan hubungi support TEMBUS atau daftar ulang dengan dokumen yang lengkap & jelas terbaca.</p>
          <Link to="/daftar" className="mt-3 inline-block rounded-xl bg-[#003A20] px-5 py-3 font-bold text-white transition hover:bg-emerald-950">Daftar Ulang</Link>
        </GateCard>
      </Shell>
    )
  }

  if (gate === 'suspended') {
    return (
      <Shell>
        <GateCard tone="red" icon={<XCircle className="h-6 w-6" />} title="Akses portal ditangguhkan">
          <p>Toko <span className="font-bold text-zinc-900">{merchantName}</span> sedang tidak dapat menggunakan operasional portal.</p>
          <p>Hubungi bantuan TEMBUS untuk mengetahui langkah pemulihan. Jangan membuat pendaftaran baru untuk status ini.</p>
          <button onClick={() => setGate('none')} className="mt-3 self-start rounded-xl border border-zinc-200 px-5 py-3 font-bold text-zinc-700 transition hover:border-zinc-300">
            Kembali ke halaman login
          </button>
        </GateCard>
      </Shell>
    )
  }

  if (gate === 'not_registered') {
    return (
      <Shell>
        <GateCard tone="emerald" icon={<Store className="h-6 w-6" />} title="Akun belum terdaftar sebagai mitra">
          <p>Login berhasil, tapi akun ini belum punya toko di TEMBUS.</p>
          <p>Daftarkan tokomu dulu untuk membuka portal mitra.</p>
          <div className="mt-3 flex gap-3">
            <Link to="/daftar" className="rounded-xl bg-[#F97316] px-5 py-3 font-bold text-white transition hover:bg-orange-600">Daftar Sekarang</Link>
            <button onClick={() => setGate('none')} className="rounded-xl border border-zinc-200 px-5 py-3 font-bold text-zinc-700">Kembali</button>
          </div>
        </GateCard>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="mt-10 text-3xl font-black tracking-tight text-zinc-900">Masuk Portal Mitra</h1>
      <p className="mt-2 text-sm text-zinc-500">Kelola pesanan, menu, dan tokomu dari satu tempat.</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-zinc-700">Email</span>
          <div className="relative mt-1.5">
            <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-300" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              autoComplete="email"
              className="w-full rounded-xl border border-zinc-200 py-3 pl-11 pr-4 outline-none transition focus:border-emerald-900 focus:ring-2 focus:ring-emerald-900/10"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-zinc-700">Password</span>
          <div className="relative mt-1.5">
            <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-300" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password akunmu"
              autoComplete="current-password"
              className="w-full rounded-xl border border-zinc-200 py-3 pl-11 pr-4 outline-none transition focus:border-emerald-900 focus:ring-2 focus:ring-emerald-900/10"
            />
          </div>
        </label>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#003A20] px-7 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-950 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {loading ? 'Memproses…' : <>Masuk <ArrowRight className="h-5 w-5" /></>}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        Belum jadi mitra?{' '}
        <Link to="/daftar" className="font-bold text-emerald-900 hover:underline">Daftar sekarang</Link>
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-5">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-zinc-100 bg-white shadow-sm md:grid-cols-[1fr_0.9fr]">
        <div className="px-6 py-12 sm:px-12">
          <Link to="/" className="flex items-center gap-2">
            <img src="/tembus-login-logo.webp" alt="TEMBUS" className="merchant-brand-image merchant-brand-image--auth" />
            <span className="text-lg font-black tracking-tight text-emerald-900">Mitra</span>
          </Link>
          <div className="mt-2">{children}</div>
        </div>
        <div className="hidden flex-col justify-between bg-gradient-to-br from-emerald-900 to-emerald-950 p-10 text-white md:flex">
          <Store className="h-9 w-9 text-[#F97316]" />
          <div>
            <p className="text-2xl font-black leading-snug">Satu dashboard untuk semua pesanan tokomu.</p>
            <ul className="mt-6 space-y-3 text-sm text-emerald-100/80">
              <li>• Terima / tolak order real-time</li>
              <li>• Kelola menu & varian</li>
              <li>• Buka/tutup toko sekali klik</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
