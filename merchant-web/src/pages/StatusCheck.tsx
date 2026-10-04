import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, CheckCircle2, Clock3, Loader2, Search, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { merchantOnboardingStatus, merchantStatusLabel } from '../lib/merchant-status'

type StatusResult = {
  status: string
  onboarding_status?: string | null
  verification_status?: string | null
  nama_toko?: string
  rejection_reason?: string | null
  suspension_reason?: string | null
  created_at?: string
  updated_at?: string
}

const statusMeta: Record<string, { icon: LucideIcon; cls: string }> = {
  DRAFT: { icon: Clock3, cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  SUBMITTED: { icon: Clock3, cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  VERIFYING: { icon: Clock3, cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  ACTIVE: { icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  REJECTED: { icon: XCircle, cls: 'bg-red-100 text-red-700 border-red-200' },
  SUSPENDED: { icon: XCircle, cls: 'bg-red-100 text-red-700 border-red-200' },
  NO_MERCHANT: { icon: Clock3, cls: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
}

export default function StatusCheck() {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<StatusResult | null>(null)
  const [error, setError] = useState('')

  const check = async () => {
    setError('')
    setResult(null)
    if (!email.trim() && !phone.trim()) {
      setError('Isi email atau nomor HP yang dipakai saat mendaftar.')
      return
    }
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (email.trim()) params.email = email.trim()
      if (phone.trim()) params.phone = phone.trim()
      const res = await api.get('/auth/merchant/registration-status', { params })
      setResult(res.data)
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('Pendaftaran tidak ditemukan. Pastikan email/nomor HP yang kamu isi sama dengan saat mendaftar.')
      } else if (err.response?.status === 429) {
        setError('Terlalu banyak percobaan. Coba lagi beberapa saat.')
      } else {
        setError(err.response?.data?.code === 'ERR_STATUS_LOOKUP_UNAVAILABLE'
          ? 'Status sedang tidak dapat diperiksa. Coba lagi beberapa saat.'
          : 'Gagal memeriksa status. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  const normalizedStatus = result ? merchantOnboardingStatus(result.onboarding_status || result.status, result.verification_status) : null
  const displayStatus = result?.status === 'no_merchant' ? 'NO_MERCHANT' : normalizedStatus
  const meta = displayStatus ? statusMeta[displayStatus] : null
  const StatusIcon = meta?.icon || Clock3

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/tembus-login-logo.webp" alt="TEMBUS" className="merchant-brand-image merchant-brand-image--auth" />
            <span className="font-black text-emerald-900">Mitra</span>
          </Link>
          <Link to="/daftar" className="text-sm font-bold text-[#F97316] hover:underline">Daftar Merchant</Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-14">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 hover:text-emerald-900">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>
        <h1 className="mt-5 text-3xl font-black tracking-tight text-zinc-900">Cek Status Pendaftaran</h1>
        <p className="mt-2 text-zinc-600">Masukkan email atau nomor HP yang kamu pakai saat mendaftar.</p>

        <div className="mt-8 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <label className="block text-sm font-bold text-zinc-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
            className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-emerald-900 focus:ring-2 focus:ring-emerald-900/10"
          />
          <div className="my-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">
            <span className="h-px flex-1 bg-zinc-100" /> atau <span className="h-px flex-1 bg-zinc-100" />
          </div>
          <label className="block text-sm font-bold text-zinc-700">Nomor HP</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08xxxxxxxxxx"
            className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none transition focus:border-emerald-900 focus:ring-2 focus:ring-emerald-900/10"
          />

          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

          <button
            onClick={check}
            disabled={loading}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#003A20] px-6 py-3.5 font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            Periksa Status
          </button>
        </div>

        {result && meta && (
          <div className={`mt-6 flex items-start gap-4 rounded-2xl border p-6 ${meta.cls}`}>
            <StatusIcon className="mt-0.5 h-8 w-8 shrink-0" />
            <div>
              <p className="text-lg font-black">{displayStatus === 'NO_MERCHANT' ? 'Belum ada pendaftaran toko' : merchantStatusLabel(normalizedStatus)}</p>
              {result.nama_toko && <p className="mt-1 font-semibold">Toko: {result.nama_toko}</p>}
              {displayStatus === 'NO_MERCHANT' && (
                <p className="mt-1 text-sm opacity-90">Akun ditemukan, tetapi belum memiliki data toko. Daftarkan bisnis untuk melanjutkan.</p>
              )}
              {normalizedStatus === 'ACTIVE' && (
                <p className="mt-1 text-sm opacity-90">
                  Toko kamu sudah aktif. Masuk ke Portal Mitra untuk mulai mengelola operasional.
                  <Link to="/masuk" className="ml-1 font-bold underline">Masuk ke portal</Link>
                </p>
              )}
              {normalizedStatus === 'REJECTED' && result.rejection_reason && (
                <p className="mt-1 text-sm opacity-90">Alasan: {result.rejection_reason}</p>
              )}
              {normalizedStatus === 'REJECTED' && (
                <Link to="/daftar" className="mt-2 inline-block text-sm font-bold underline">Perbaiki dan daftar ulang</Link>
              )}
              {normalizedStatus === 'SUSPENDED' && (
                <>
                  <p className="mt-1 text-sm opacity-90">Akses operasional sedang ditangguhkan. Hubungi bantuan TEMBUS untuk langkah pemulihan.</p>
                  {result.suspension_reason && <p className="mt-1 text-sm opacity-90">Keterangan: {result.suspension_reason}</p>}
                </>
              )}
              {['DRAFT', 'SUBMITTED', 'VERIFYING'].includes(normalizedStatus || '') && (
                <p className="mt-1 text-sm opacity-90">Tim TEMBUS sedang memproses data kamu. Status ini akan berubah setelah ada keputusan verifikasi.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
