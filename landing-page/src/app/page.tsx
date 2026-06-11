"use client";

import Image from "next/image";
import {
  ArrowRight,
  Bike,
  Boxes,
  Building2,
  Clock3,
  Headphones,
  LocateFixed,
  MapPin,
  Menu,
  PackageCheck,
  PackageOpen,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
  WalletCards,
  Zap
} from "lucide-react";
import { motion } from "framer-motion";

const appUrl = "https://app.bawain.my.id";
const trackingUrl = `${appUrl}/track`;

const navItems = [
  { label: "Beranda", href: "#beranda" },
  { label: "Layanan", href: "#layanan" },
  { label: "Untuk Bisnis", href: "#kolaborasi" },
  { label: "Mitra Kurir", href: "#kolaborasi" },
  { label: "Tentang Kami", href: "#tentang" },
  { label: "Bantuan", href: "#bantuan" }
];

const highlights = [
  { icon: Clock3, title: "Cepat & Tepat Waktu", text: "Pengiriman instan dan same day" },
  { icon: ShieldCheck, title: "Aman & Terpercaya", text: "Dilindungi asuransi pengiriman" },
  { icon: LocateFixed, title: "Live Tracking", text: "Pantau paket real-time" }
];

const featureCards = [
  { icon: Zap, title: "Pengiriman Cepat", text: "Proses instan dan same day untuk kebutuhan mendesak." },
  { icon: MapPin, title: "Live Tracking", text: "Pantau paket Anda secara real-time kapan saja." },
  { icon: ShieldCheck, title: "Aman & Terpercaya", text: "Paket dilindungi sistem keamanan berlapis." },
  { icon: WalletCards, title: "Harga Kompetitif", text: "Tarif transparan tanpa biaya tersembunyi." },
  { icon: Building2, title: "Solusi Lengkap", text: "Layanan pribadi, bisnis, hingga enterprise." },
  { icon: Headphones, title: "Customer Support", text: "Tim CS siap membantu kebutuhan pengiriman Anda." }
];

const services = [
  { icon: Bike, title: "Same Day", text: "Pengiriman di hari yang sama, cepat sampai tujuan." },
  { icon: PackageOpen, title: "Instant", text: "Pengiriman instan dalam hitungan jam." },
  { icon: Truck, title: "Reguler", text: "Layanan hemat untuk pengiriman harian." },
  { icon: Boxes, title: "Cargo", text: "Barang besar, berat, dan volume banyak." },
  { icon: WalletCards, title: "COD", text: "Bayar di tempat lebih praktis dan aman." },
  { icon: Building2, title: "Business", text: "Logistik terintegrasi untuk bisnis Anda." }
];

const processSteps = [
  { icon: Smartphone, title: "Buat Pesanan", text: "Masukkan detail pengiriman dan kebutuhan layanan." },
  { icon: Bike, title: "Kurir Pickup", text: "Kurir terdekat menjemput paket sesuai waktu pilihan." },
  { icon: Truck, title: "Proses Pengiriman", text: "Paket dikirim dengan pantauan real-time." },
  { icon: PackageCheck, title: "Sampai Tujuan", text: "Paket diterima aman dan tepat waktu." }
];

const collaborations = [
  {
    icon: Users,
    title: "Mitra Kurir",
    text: "Bergabung sebagai mitra kurir TEMBUS dan dapatkan penghasilan fleksibel.",
    action: "Daftar Sekarang"
  },
  {
    icon: Building2,
    title: "B2B / Untuk Bisnis",
    text: "Solusi logistik terintegrasi untuk bisnis Anda, efisien dan transparan.",
    action: "Pelajari Solusi"
  },
  {
    icon: PackageOpen,
    title: "B2C / Untuk Pribadi",
    text: "Kirim paket pribadi dengan mudah, cepat, dan aman.",
    action: "Kirim Sekarang"
  }
];

const timeline = [
  "Pesanan Dibuat",
  "Kurir Pickup",
  "Dalam Pengiriman",
  "Sampai Tujuan"
];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export default function LandingPage() {
  return (
    <main className="page-shell">
      <section id="beranda" className="relative min-h-[720px] overflow-hidden bg-[#001911] text-white">
        <div className="hero-ambient" />
        <div className="city-lines" />
        <div className="road" />

        <header className="container relative z-20 flex items-center justify-between py-6">
          <a href="#beranda" aria-label="TEMBUS beranda" className="flex items-center">
            <Image
              src="/brand/tembus-tulisan.svg"
              alt="TEMBUS"
              width={190}
              height={58}
              priority
              className="h-12 w-auto"
            />
          </a>

          <nav aria-label="Navigasi utama" className="hidden items-center gap-7 text-sm font-bold lg:flex">
            {navItems.map((item) => (
              <a key={item.label} href={item.href} className="transition-all duration-200 hover:text-[#9bd46f]">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a href={trackingUrl} className="nav-action border border-white/35 px-5 py-3 text-sm">
              Lacak Paket
            </a>
            <a href={`${appUrl}/orders/new`} className="nav-action bg-[#ff6908] px-5 py-3 text-sm text-white">
              Kirim Sekarang
            </a>
          </div>

          <button className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-white/10 transition-all duration-200 active:scale-95 lg:hidden" aria-label="Buka menu">
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <div className="container relative z-10 grid min-h-[600px] items-center gap-10 pb-28 pt-10 lg:grid-cols-[0.96fr_1.04fr]">
          <motion.div {...fadeUp()} className="max-w-xl">
            <p className="mb-4 inline-flex rounded-full border border-white/18 bg-white/10 px-4 py-2 text-sm font-bold text-[#b8e58f] backdrop-blur-md">
              Kurir aman, sampai tujuan
            </p>
            <h1 className="text-5xl font-black leading-[1.02] tracking-normal sm:text-6xl lg:text-7xl">
              Kirim Cepat,
              <br />
              Aman,
              <br />
              <span className="text-[#7bc043]">Sampai Tujuan.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-white/82">
              TEMBUS hadir untuk pengalaman pengiriman terbaik dengan teknologi terdepan,
              tracking real-time, dan jaringan mitra profesional.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={`${appUrl}/orders/new`} className="cta-primary px-6 py-4">
                Kirim Sekarang <ArrowRight className="h-5 w-5" />
              </a>
              <a href={trackingUrl} className="cta-secondary px-6 py-4">
                Lacak Paket <LocateFixed className="h-5 w-5" />
              </a>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/22 bg-white/10">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <strong className="block text-sm">{item.title}</strong>
                      <span className="text-xs text-white/70">{item.text}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.1)} className="relative hidden min-h-[520px] lg:block">
            <div className="absolute left-2 top-24 h-52 w-80 rounded-[26px] border border-white/10 bg-gradient-to-br from-[#102b24] to-[#061b15] shadow-2xl">
              <div className="absolute left-8 top-12 h-24 w-48 rounded-xl bg-[#123f31]" />
              <div className="absolute -right-8 bottom-8 h-24 w-24 rounded-full border-[16px] border-[#0b1714] bg-[#24372e]" />
              <div className="absolute left-8 bottom-8 h-20 w-20 rounded-full border-[14px] border-[#0b1714] bg-[#24372e]" />
            </div>

            <div className="floating absolute left-52 top-0 flex h-[410px] w-[290px] flex-col items-center justify-end rounded-[34px] border border-white/18 bg-gradient-to-b from-[#0d4e39] to-[#06291f] p-7 text-center shadow-[0_40px_110px_rgba(0,0,0,0.45)]">
              <Image src="/brand/logo-putih.svg" alt="Logo TEMBUS" width={116} height={116} className="mb-5 h-24 w-24 object-contain" priority />
              <div className="mb-5 h-28 w-40 rounded-xl border border-[#73461b]/20 bg-[#b8864f] shadow-xl">
                <div className="mt-8 text-center text-2xl font-black text-[#063322]">TEMBUS</div>
                <div className="mx-auto mt-3 h-1 w-20 rounded-full bg-[#063322]" />
              </div>
              <p className="text-sm font-bold text-white/90">Kurir siap jemput paket Anda</p>
            </div>

            <div className="absolute right-0 top-20 w-[230px] rounded-[32px] border-[8px] border-[#0c0f0d] bg-white p-4 text-[#071712] shadow-2xl">
              <div className="mx-auto mb-3 h-5 w-20 rounded-b-xl bg-[#0c0f0d]" />
              <p className="text-xs font-bold text-[#52635d]">Tracking</p>
              <p className="mt-1 text-sm font-black">TBX1234567890</p>
              <div className="relative mt-4 h-48 overflow-hidden rounded-2xl bg-[#eef4ed]">
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,61,43,0.09)_1px,transparent_1px),linear-gradient(rgba(0,61,43,0.09)_1px,transparent_1px)] bg-[size:28px_28px]" />
                <div className="absolute left-9 top-32 h-4 w-4 rounded-full bg-[#2d9449]" />
                <div className="absolute right-8 top-12 h-4 w-4 rounded-full bg-[#ff6908]" />
                <div className="absolute left-12 top-36 h-[2px] w-32 -rotate-[34deg] bg-[#134d38]" />
              </div>
              <p className="mt-4 text-xs text-[#52635d]">Status</p>
              <p className="text-sm font-black">Dalam Perjalanan</p>
              <p className="mt-3 text-xs text-[#52635d]">Estimasi Tiba</p>
              <p className="text-xs font-bold">20 Mei 2024, 16:00 - 18:00</p>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="container relative z-20 -mt-16">
        <motion.div {...fadeUp()} className="glass-panel grid overflow-hidden rounded-xl md:grid-cols-3 lg:grid-cols-6">
          {featureCards.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="motion-card border-b border-[var(--line)] p-6 text-center md:border-r lg:border-b-0">
                <Icon className="mx-auto mb-4 h-9 w-9 text-[#003d2b]" />
                <h3 className="text-sm font-black">{item.title}</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.text}</p>
              </div>
            );
          })}
        </motion.div>
      </section>

      <section id="layanan" className="container py-10">
        <motion.div {...fadeUp()} className="text-center">
          <h2 className="section-title text-3xl font-black">Layanan Kami</h2>
        </motion.div>
        <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {services.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.article key={item.title} {...fadeUp(index * 0.03)} className="motion-card rounded-lg border border-[var(--line)] bg-white p-6 text-center">
                <Icon className="mx-auto h-14 w-14 text-[#003d2b]" />
                <h3 className="mt-4 text-sm font-black">{item.title}</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{item.text}</p>
              </motion.article>
            );
          })}
        </div>
        <div className="mt-6 text-center">
          <a href={`${appUrl}/orders/new`} className="cta-primary px-6 py-3 text-sm">
            Lihat Semua Layanan <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <section id="tentang" className="container grid gap-6 py-2 lg:grid-cols-[1fr_0.95fr]">
        <motion.div {...fadeUp()} className="rounded-xl border border-[var(--line)] bg-white p-8">
          <h2 className="section-title text-2xl font-black">Cara Kerja Pengiriman</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Kirim paket jadi lebih mudah dalam 4 langkah sederhana.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-4">
            {processSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef6ed] text-[#003d2b]">
                    <Icon className="h-8 w-8" />
                  </span>
                  <span className="absolute left-[58%] top-0 flex h-7 w-7 items-center justify-center rounded-full bg-[#003d2b] text-xs font-black text-white">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-sm font-black">{step.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{step.text}</p>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div {...fadeUp(0.08)} className="dark-panel rounded-xl p-8">
          <h2 className="text-3xl font-black leading-tight">Lacak Paket Anda Secara Real-Time</h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/74">
            Masukkan nomor resi untuk melacak status pengiriman paket Anda melalui portal customer.
          </p>
          <form action={trackingUrl} className="mt-7 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="tracking-number">Nomor resi</label>
            <input
              id="tracking-number"
              name="resi"
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="Masukkan No. Resi"
              className="min-h-12 flex-1 rounded-lg border border-white/12 bg-white px-4 text-sm font-semibold text-[#071712] outline-none transition-all duration-200 placeholder:text-[#7d8d86] focus:border-[#7bc043] focus:ring-4 focus:ring-[#7bc043]/25"
            />
            <button type="submit" className="cta-primary min-h-12 px-6">
              Lacak
            </button>
          </form>
          <p className="mt-3 text-xs text-white/72">Contoh No. Resi: TBX1234567890</p>

          <div className="mt-8 space-y-5">
            {timeline.map((item, index) => (
              <div key={item} className="flex items-center gap-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ff6908]/50 bg-[#ff6908]/15 text-[#ffb47d]">
                  <MapPin className="h-4 w-4" />
                </span>
                <span>
                  <strong className="block text-sm">{item}</strong>
                  <span className="text-xs text-white/62">20 Mei 2024, {10 + index * 2}:00</span>
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section id="kolaborasi" className="container py-10">
        <motion.div {...fadeUp()} className="text-center">
          <h2 className="section-title text-3xl font-black">Siap Berkolaborasi</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Bersama TEMBUS, tumbuh lebih besar dan menjangkau lebih luas.</p>
        </motion.div>
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {collaborations.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.article key={item.title} {...fadeUp(index * 0.05)} className="motion-card overflow-hidden rounded-xl border border-[var(--line)] bg-white">
                <div className="grid min-h-44 grid-cols-[1fr_120px] gap-2 p-6">
                  <div>
                    <Icon className="h-9 w-9 text-[#003d2b]" />
                    <h3 className="mt-4 text-lg font-black">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.text}</p>
                    <a href={`${appUrl}/login`} className="mt-5 inline-flex rounded-lg bg-[#003d2b] px-4 py-3 text-sm font-black text-white transition-all duration-200 hover:brightness-110 active:scale-95">
                      {item.action}
                    </a>
                  </div>
                  <div className="flex items-end justify-center rounded-xl bg-[#eef6ed]">
                    <Image src="/brand/logo-putih.svg" alt="" width={94} height={94} className="mb-8 h-20 w-20 rounded-full bg-[#003d2b] p-3" />
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      <section className="container pb-10">
        <motion.div {...fadeUp()} className="dark-panel grid items-center gap-6 rounded-xl p-7 lg:grid-cols-[170px_1fr_360px_110px]">
          <div className="relative h-28">
            <div className="absolute left-0 top-0 h-28 w-20 rounded-[20px] border-[6px] border-[#0c0f0d] bg-white p-2">
              <Image src="/brand/logo-putih.svg" alt="TEMBUS app" width={64} height={64} className="rounded-xl bg-[#003d2b] p-2" />
            </div>
            <div className="absolute left-14 top-4 h-28 w-20 rounded-[20px] border-[6px] border-[#0c0f0d] bg-[#eef6ed]" />
          </div>
          <div>
            <h2 className="text-2xl font-black">Kirim Lebih Mudah dengan Aplikasi TEMBUS</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-white/72">
              Unduh aplikasi dan nikmati pengalaman pengiriman yang lebih praktis, transparan, dan cepat.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={appUrl} className="rounded-lg border border-white/15 bg-black px-5 py-3 text-sm font-black transition-all duration-200 hover:scale-[1.02] active:scale-95">Temukan di Google Play</a>
            <a href={appUrl} className="rounded-lg border border-white/15 bg-black px-5 py-3 text-sm font-black transition-all duration-200 hover:scale-[1.02] active:scale-95">Download di App Store</a>
          </div>
          <div className="h-24 w-24 rounded-lg bg-white p-3">
            <div className="h-full w-full bg-[linear-gradient(90deg,#001911_50%,transparent_50%),linear-gradient(#001911_50%,transparent_50%)] bg-[size:16px_16px]" />
          </div>
        </motion.div>
      </section>

      <footer id="bantuan" className="bg-[#00281e] py-10 text-white">
        <div className="container grid gap-8 lg:grid-cols-[1.3fr_repeat(5,1fr)]">
          <div>
            <Image src="/brand/tembus-tulisan.svg" alt="TEMBUS" width={180} height={54} className="h-12 w-auto" />
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/68">
              Solusi logistik modern dengan teknologi terdepan dan jaringan mitra profesional.
            </p>
          </div>
          {[
            ["Layanan", "Same Day", "Instant", "Reguler", "Cargo", "COD"],
            ["Untuk Bisnis", "Solusi Logistik", "Integrasi API", "Enterprise", "Case Study"],
            ["Mitra Kurir", "Daftar Mitra", "Keuntungan", "Cara Bergabung", "FAQ Mitra"],
            ["Perusahaan", "Tentang Kami", "Karir", "Berita", "Kontak"],
            ["Bantuan", "Pusat Bantuan", "Syarat & Ketentuan", "Kebijakan Privasi", "hello@tembus.id"]
          ].map(([title, ...links]) => (
            <div key={title}>
              <h3 className="text-sm font-black">{title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-white/68">
                {links.map((link) => (
                  <li key={link}>
                    <a href={appUrl} className="transition-all duration-200 hover:text-white">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="container mt-8 border-t border-white/10 pt-6 text-center text-xs text-white/52">
          © 2026 TEMBUS. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
