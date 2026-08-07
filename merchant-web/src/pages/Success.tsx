import { Link, useLocation } from 'react-router'
import { CheckCircle2, Clock3, Mail } from 'lucide-react'

export default function Success() {
  const location = useLocation()
  const email = (location.state as { email?: string } | null)?.email || ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-5">
      <div className="w-full max-w-lg rounded-[2rem] border border-zinc-100 bg-white p-8 text-center shadow-sm md:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-700" />
        </div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-zinc-900">Pendaftaran terkirim! 🎉</h1>
        <p className="mt-3 text-zinc-600">
          Terima kasih sudah mendaftar jadi merchant TEMBUS. Tim admin akan memverifikasi
          data & dokumenmu.
        </p>

        <div className="mt-7 rounded-2xl bg-zinc-50 p-5 text-left">
          <div className="flex items-center gap-3">
            <Clock3 className="h-5 w-5 shrink-0 text-[#ff6908]" />
            <div>
              <p className="text-sm font-bold text-zinc-900">Waktu verifikasi</p>
              <p className="text-xs text-zinc-500">± 1×24 jam kerja</p>
            </div>
          </div>
          {email && (
            <div className="mt-4 flex items-center gap-3">
              <Mail className="h-5 w-5 shrink-0 text-emerald-900" />
              <div>
                <p className="text-sm font-bold text-zinc-900">Notifikasi status</p>
                <p className="text-xs text-zinc-500">Cek status kapan saja dengan email/HP: <span className="font-semibold">{email}</span></p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/status"
            className="inline-flex items-center justify-center rounded-xl bg-[#003d2b] px-6 py-3.5 font-bold text-white transition hover:bg-emerald-950"
          >
            Cek Status Pendaftaran
          </Link>
          <Link to="/" className="inline-flex items-center justify-center rounded-xl border border-zinc-200 px-6 py-3.5 font-bold text-zinc-700 transition hover:border-zinc-300">
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  )
}
