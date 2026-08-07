import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, CheckCircle2, Clock3, Loader2, Search, XCircle } from 'lucide-react'
import { api } from '../lib/api'

type StatusResult = {
  status: string
  nama_toko?: string
  user_status?: string
  rejection_reason?: string | null
  created_at?: string
}

const statusMeta: Record<string, { label: string; icon: any; cls: string }> = {
  pending: { label: 'Sedang Diproses', icon: Clock3, cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'Disetujui 🎉', icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected: { label: 'Ditolak', icon: XCircle, cls: 'bg-red-100 text-red-700 border-red-200' },
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
      } else {
        setError(err.response?.data?.error || 'Gagal memeriksa status. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  const meta = result ? statusMeta[result.status] : null
  const StatusIcon = meta?.icon || Clock3

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="TEMBUS" className="h-8 w-8" />
            <span className="font-black text-zinc-900">TEMBUS Mitra</span>
          </Link>
          <Link to="/daftar" className="text-sm font-bold text-[#ff6908] hover:underline">Daftar Merchant</Link>
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
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#003d2b] px-6 py-3.5 font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            Periksa Status
          </button>
        </div>

        {result && meta && (
          <div className={`mt-6 flex items-start gap-4 rounded-2xl border p-6 ${meta.cls}`}>
            <StatusIcon className="mt-0.5 h-8 w-8 shrink-0" />
            <div>
              <p className="text-lg font-black">{meta.label}</p>
              {result.nama_toko && <p className="mt-1 font-semibold">Toko: {result.nama_toko}</p>}
              {result.status === 'approved' && (
                <p className="mt-1 text-sm opacity-90">
                  Selamat! Toko kamu sudah aktif. Silakan login di aplikasi TEMBUS Merchant menggunakan email & password yang didaftarkan.
                </p>
              )}
              {result.status === 'rejected' && result.rejection_reason && (
                <p className="mt-1 text-sm opacity-90">Alasan: {result.rejection_reason}</p>
              )}
              {result.status === 'pending' && (
                <p className="mt-1 text-sm opacity-90">Tim admin sedang memverifikasi data kamu. Cek kembali dalam beberapa jam.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
