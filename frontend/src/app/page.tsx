import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BadgePercent,
  BarChart3,
  Bike,
  LifeBuoy,
  Package,
  ShieldCheck,
  Truck,
  Zap,
} from 'lucide-react';
import ResiCheckWidget from '@/components/landing/ResiCheckWidget';
import LandingNavbar from '@/components/landing/LandingNavbar';

export const metadata: Metadata = {
  title: 'TEMBUS — Logistik On-Demand',
  description:
    'Kirim parcel, makanan, tambal ban, dan towing dalam satu aplikasi. Lacak resi secara real-time bersama TEMBUS.',
};

const services = [
  {
    id: 'parcel',
    icon: Package,
    name: 'Parcel & Paket',
    desc: 'Pengiriman paket instan dan same-day ke seluruh kota.',
    accent: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'food',
    icon: Bike,
    name: 'Food Delivery',
    desc: 'Makanan favorit sampai segar dengan kurir tercepat.',
    accent: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
  },
  {
    id: 'tambal-ban',
    icon: LifeBuoy,
    name: 'Tambal Ban',
    desc: 'Ban bocor di tengah jalan? Teknisi datang ke lokasimu.',
    accent: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  },
  {
    id: 'towing',
    icon: Truck,
    name: 'Towing',
    desc: 'Kendaraan mogok? Layanan derek siap 24 jam.',
    accent: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  },
];

const pricing = [
  { service: 'Parcel Instan', price: 'Mulai Rp 12.000', note: 'per 3 km pertama' },
  { service: 'Food Delivery', price: 'Mulai Rp 8.000', note: 'ongkir flat area pusat kota' },
  { service: 'Tambal Ban', price: 'Mulai Rp 35.000', note: 'termasuk biaya panggilan' },
  { service: 'Towing', price: 'Mulai Rp 150.000', note: 'tarif per trip 10 km' },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <LandingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-500/15 blur-[120px]" />
        <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-14 md:pt-24">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-300">Logistik on-demand Indonesia</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
            TEMBUS. Semua kiriman,{' '}
            <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">
              tembus tanpa ribet.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 md:text-lg">
            Parcel, makanan, tambal ban, sampai towing — dipesen dalam hitungan menit,
            dilacak real-time sampai tangan penerima.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/orders/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-7 py-4 text-base font-black text-slate-950 shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 active:scale-[0.98]"
            >
              Kirim Sekarang
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-7 py-4 text-base font-bold text-white transition-all hover:bg-white/10"
            >
              Masuk
            </Link>
          </div>

          {/* Widget Cek Resi */}
          <div className="mt-10 max-w-xl rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
            <ResiCheckWidget />
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
            <li className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-400" /> Kurir terdekat otomatis
            </li>
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Asuransi opsional
            </li>
            <li className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-emerald-400" /> Resi publik bisa dilacak siapa saja
            </li>
            <li className="flex items-center gap-1.5">
              <BadgePercent className="h-3.5 w-3.5 text-emerald-400" />
              <Link href="/voucher" className="transition-colors hover:text-white">
                Voucher &amp; promo untuk pelanggan
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {/* Layanan */}
      <section id="layanan" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-14">
        <h2 className="text-2xl font-black tracking-tight md:text-3xl">Layanan Kami</h2>
        <p className="mt-2 text-sm text-slate-400">Empat layanan inti, satu aplikasi.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <Link
              key={service.id}
              href="/orders/new"
              className={`group rounded-3xl border p-5 transition-all hover:-translate-y-1 ${service.accent}`}
            >
              <div className="rounded-2xl bg-black/20 p-3 w-fit">
                <service.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-black">{service.name}</h3>
              <p className="mt-1.5 text-xs leading-5 text-slate-300">{service.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold opacity-80 transition-opacity group-hover:opacity-100">
                Pesan sekarang <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Harga */}
      <section id="harga" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-14">
        <h2 className="text-2xl font-black tracking-tight md:text-3xl">Harga Ringkas</h2>
        <p className="mt-2 text-sm text-slate-400">Tarif indikatif — harga final dihitung otomatis saat order.</p>
        <div className="mt-8 overflow-hidden rounded-3xl border border-white/10">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Ringkasan tarif layanan TEMBUS</caption>
            <thead className="bg-white/[0.06] text-xs uppercase tracking-widest text-slate-400">
              <tr>
                <th scope="col" className="px-5 py-3">Layanan</th>
                <th scope="col" className="px-5 py-3">Tarif</th>
                <th scope="col" className="hidden px-5 py-3 sm:table-cell">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pricing.map((row) => (
                <tr key={row.service} className="transition-colors hover:bg-white/[0.03]">
                  <th scope="row" className="px-5 py-4 font-bold">{row.service}</th>
                  <td className="px-5 py-4 font-semibold text-emerald-300">{row.price}</td>
                  <td className="hidden px-5 py-4 text-slate-400 sm:table-cell">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* UMKM */}
      <section id="umkm" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-14">
        <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-white/[0.02] to-transparent p-8 md:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-300">Untuk UMKM</p>
          <h2 className="mt-3 max-w-2xl text-2xl font-black tracking-tight md:text-3xl">
            Pantau omzet pengiriman usahamu lewat Laporan UMKM
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Rekap order, tren pengiriman harian, dan total pengeluaran logistik bisnismu
            tersaji rapi setiap bulan — gratis untuk semua pengguna TEMBUS.
          </p>
          <Link
            href="/laporan"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-black text-slate-950 transition-all hover:bg-emerald-400 active:scale-[0.98]"
          >
            <BarChart3 className="h-4 w-4" />
            Pelajari Laporan UMKM
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <img src="/tembusweb.svg" alt="TEMBUS" className="h-8 object-contain" />
            <p className="mt-3 max-w-xs text-xs leading-5 text-slate-400">
              Platform logistik on-demand untuk kebutuhan harian dan bisnis di seluruh Indonesia.
            </p>
          </div>
          <nav aria-label="Tautan produk">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Produk</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li><a href="#layanan" className="hover:text-white">Layanan</a></li>
              <li><a href="#harga" className="hover:text-white">Harga</a></li>
              <li><a href="#umkm" className="hover:text-white">UMKM</a></li>
            </ul>
          </nav>
          <nav aria-label="Bantuan">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Bantuan</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li><Link href="/cek-resi" className="hover:text-white">Cek Resi</Link></li>
              <li><Link href="/login" className="hover:text-white">Masuk</Link></li>
              <li><Link href="/daftar" className="hover:text-white">Daftar</Link></li>
            </ul>
          </nav>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Legal</h3>
            <p className="mt-3 text-xs text-slate-500">
              © {new Date().getFullYear()} TEMBUS. Seluruh hak cipta dilindungi.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
