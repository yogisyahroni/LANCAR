import { Link } from 'react-router'
import { ArrowRight, BadgeCheck, BarChart3, Bike, Clock3, Search, Store, Users } from 'lucide-react'

const benefits = [
  { icon: Users, title: 'Jangkau lebih banyak pelanggan', desc: 'Toko kamu tampil ke ribuan pengguna TEMBUS di sekitar lokasi.' },
  { icon: Clock3, title: 'Terima order otomatis', desc: 'Order masuk real-time lewat aplikasi merchant, tanpa telepon bolak-balik.' },
  { icon: BarChart3, title: 'Pantau performa toko', desc: 'Laporan penjualan harian, rating, dan performa driver tersaji lengkap.' },
  { icon: Bike, title: 'Pengiriman diurus TEMBUS', desc: 'Driver kami antar order sampai ke pelanggan. Kamu fokus masak & layani.' },
]

const steps = [
  { n: '01', title: 'Daftar online', desc: 'Isi data toko & unggah dokumen — cukup 5 menit.' },
  { n: '02', title: 'Verifikasi admin', desc: 'Tim kami cek dokumenmu (1×24 jam kerja).' },
  { n: '03', title: 'Langsung terima order', desc: 'Begitu disetujui, toko langsung aktif terima order.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-zinc-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="TEMBUS" className="h-9 w-9" />
            <span className="text-lg font-black tracking-tight text-zinc-900">
              TEMBUS <span className="text-emerald-900">Mitra</span>
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-zinc-600 md:flex">
            <Link to="/status" className="hover:text-emerald-900">Cek Status</Link>
            <Link
              to="/daftar"
              className="rounded-full bg-[#F97316] px-5 py-2.5 text-white shadow-sm transition hover:bg-orange-600"
            >
              Daftar Sekarang
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/20 bg-emerald-900/5 px-4 py-1.5 text-xs font-bold text-emerald-900">
              <BadgeCheck className="h-4 w-4" /> Mitra resmi TEMBUS
            </div>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-zinc-900 md:text-5xl">
              Buka toko online-mu <span className="text-[#F97316]">hari ini</span>
            </h1>
            <p className="mt-4 max-w-lg text-lg text-zinc-600">
              Gabung jadi merchant TEMBUS. Jualan makin gampang, order makin banyak, pengiriman
              diurus tim kami. Daftar gratis, tanpa biaya bulanan.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/daftar"
                className="inline-flex items-center gap-2 rounded-full bg-[#003A20] px-7 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-950"
              >
                Daftar Jadi Merchant <ArrowRight className="h-5 w-5" />
              </Link>
              <Link to="/status" className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-6 py-3.5 font-bold text-zinc-700 transition hover:border-emerald-900/30 hover:text-emerald-900">
                <Search className="h-5 w-5" /> Cek Status Pendaftaran
              </Link>
            </div>
            <p className="mt-5 text-xs text-zinc-400">Gratis daftar · Verifikasi 1×24 jam · No. WhatsApp aktif untuk info order</p>
          </div>
          <div className="relative">
            <div className="rounded-[2rem] bg-gradient-to-br from-emerald-900 to-emerald-950 p-8 text-white shadow-2xl">
              <Store className="h-10 w-10 text-[#007A42]" />
              <p className="mt-6 text-3xl font-black">+40%</p>
              <p className="text-sm text-emerald-100/80">rata-rata peningkatan order merchant TEMBUS dalam 3 bulan pertama</p>
              <div className="mt-8 flex items-center gap-3 rounded-2xl bg-white/10 p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F97316]">
                  <Bike className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold">Order baru masuk!</p>
                  <p className="text-xs text-emerald-100/70">Nasi Goreng Spesial — 1,2 km</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-zinc-50 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-black tracking-tight text-zinc-900">Kenapa jadi merchant TEMBUS?</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-900/5">
                  <Icon className="h-6 w-6 text-emerald-900" />
                </div>
                <h3 className="mt-4 font-bold text-zinc-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-center text-3xl font-black tracking-tight text-zinc-900">3 langkah mulai jualan</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {steps.map(({ n, title, desc }) => (
            <div key={n} className="relative rounded-2xl border border-zinc-100 p-6">
              <span className="text-4xl font-black text-emerald-900/15">{n}</span>
              <h3 className="mt-2 text-lg font-bold text-zinc-900">{title}</h3>
              <p className="mt-1 text-sm text-zinc-500">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link
            to="/daftar"
            className="inline-flex items-center gap-2 rounded-full bg-[#F97316] px-8 py-4 font-bold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"
          >
            Mulai Daftar Sekarang <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 bg-zinc-50 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-sm text-zinc-500 md:flex-row">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="TEMBUS" className="h-6 w-6" />
            <span className="font-bold text-zinc-700">TEMBUS Mitra</span>
          </div>
          <p>© {new Date().getFullYear()} TEMBUS. Semua hak dilindungi.</p>
          <Link to="/status" className="font-semibold text-emerald-900 hover:underline">Cek Status Pendaftaran</Link>
        </div>
      </footer>
    </div>
  )
}
