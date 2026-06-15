"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bike,
  Boxes,
  Building2,
  Clock3,
  Headphones,
  Link2,
  LocateFixed,
  Mail,
  MapPin,
  Menu,
  PackageCheck,
  PackageOpen,
  Phone,
  ShieldCheck,
  Truck,
  Users,
  WalletCards,
  Zap
} from "lucide-react";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

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
  { icon: Headphones, title: "Customer Support", text: "Tim CS siap membantu Anda 24/7 dengan pelayanan terbaik." }
];

const services = [
  { image: "/brand/samday.svg", title: "Same Day", text: "Pengiriman di hari yang sama, cepat sampai tujuan.", href: "/layanan/same-day" },
  { image: "/brand/instant.svg", title: "Instant", text: "Pengiriman instan dalam hitungan jam.", href: "/layanan/instant" },
  { image: "/brand/regular.svg", title: "Reguler", text: "Layanan reguler dengan harga lebih hemat.", href: "/layanan/reguler" },
  { image: "/brand/cargo.svg", title: "Cargo", text: "Pengiriman barang besar, berat, dan volume banyak.", href: "/layanan/cargo" },
  { image: "/brand/cod.svg", title: "COD", text: "Bayar di tempat lebih praktis dan aman.", scaleClass: "scale-[1.4] hover:scale-[1.5] -mt-2", href: "/layanan/cod" },
  { image: "/brand/businnes.svg", title: "Business", text: "Solusi logistik untuk Bisnis Anda secara terintegrasi.", href: "/layanan/business" }
];

const collaborations = [
  {
    icon: Users,
    title: "Mitra Kurir",
    text: "Bergabung sebagai mitra kurir Tembus dan dapatkan penghasilan menarik dengan sistem yang fleksibel.",
    action: "Daftar Sekarang",
    dark: true
  },
  {
    icon: Building2,
    title: "B2B / Untuk Bisnis",
    text: "Solusi logistik terintegrasi untuk bisnis Anda. Efisien, transparan, dan dapat diandalkan.",
    action: "Pelajari Solusi",
    dark: false
  },
  {
    icon: PackageOpen,
    title: "B2C / Untuk Pribadi",
    text: "Layanan untuk kebutuhan pengiriman pribadi dari mudah, cepat, dan aman.",
    action: "Kirim Sekarang",
    dark: false
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
      {/* ========== HERO ========== */}
      <section id="beranda" className="relative min-h-[760px] lg:min-h-[860px] xl:min-h-[920px] overflow-hidden bg-[#001911] text-white">
        {/* SVG Background */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/header landing page.svg"
            alt=""
            fill
            priority
            className="object-cover"
            style={{ objectPosition: 'right top' }}
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#001911]/92 from-20% via-[#001911]/50 via-45% to-transparent to-65%" />
        </div>

        {/* Navbar */}
        <Header />

        {/* Hero Content */}
        <div className="relative z-10 px-6 pb-14 pt-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
          <motion.div {...fadeUp()} className="max-w-[420px] lg:max-w-[520px] xl:max-w-[580px]">
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight lg:text-[4.5rem] xl:text-[5.2rem]">
              Kirim Cepat,
              <br />
              Aman,
              <br />
              <span className="text-[#7bc043]">Sampai Tujuan.</span>
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-white/80 lg:text-[15px] max-w-[360px]">
              Tembus hadir untuk memberikan pengalaman pengiriman terbaik dengan teknologi terdepan
              dan jaringan mitra profesional.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={`${appUrl}/orders/new`} className="cta-primary px-6 py-3 text-sm font-bold">
                Kirim Sekarang <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={trackingUrl}
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-[#002d20] px-6 py-3 text-sm font-bold text-white transition-all duration-200 hover:bg-[#003d2b]"
              >
                Lacak Paket <LocateFixed className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-10 flex flex-wrap gap-5 md:gap-7">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <strong className="block text-[12px] font-bold leading-tight">{item.title}</strong>
                      <span className="block text-[10px] leading-snug text-white/60">{item.text}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ========== FEATURE CARDS — floating ========== */}
      <section className="container relative z-20 -mt-16 mb-8">
        <div className="rounded-2xl bg-white px-6 py-8 shadow-[0_8px_40px_rgba(0,0,0,0.10)] sm:px-10 lg:px-12">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
            {featureCards.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  {...fadeUp(index * 0.06)}
                  className="flex flex-col items-center text-center"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef6ed]">
                    <Icon className="h-6 w-6 text-[#003d2b]" />
                  </div>
                  <h3 className="text-[12px] font-black text-[#111] leading-tight">{item.title}</h3>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-[#666]">{item.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========== LAYANAN KAMI ========== */}
      <section id="layanan" className="container py-8">
        <motion.div {...fadeUp()} className="text-center mb-6">
          <h2 className="text-2xl font-black text-[#071712]">Layanan Kami</h2>
        </motion.div>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {services.map((item, index) => {
            const CardContent = (
              <article className="group h-full cursor-pointer overflow-hidden rounded-xl border border-[var(--line)] bg-white transition-all duration-300 hover:border-transparent hover:shadow-xl">
                {/* Image area */}
                <div className="flex items-center justify-center pt-4 pb-2">
                  <Image 
                    src={item.image}
                    alt={item.title}
                    width={300}
                    height={300}
                    className={`object-contain drop-shadow-sm h-40 w-full transform transition-transform duration-300 ${item.scaleClass || 'scale-105 group-hover:scale-110'}`}
                  />
                </div>
                <div className="p-4 pt-2">
                  <h3 className="text-[13px] font-black text-[#111] group-hover:text-[#ff6908] transition-colors">{item.title}</h3>
                  <p className="mt-1.5 text-[10px] leading-[1.5] text-[var(--muted)]">{item.text}</p>
                </div>
              </article>
            );

            return (
              <motion.div key={item.title} {...fadeUp(index * 0.04)} className="h-full">
                {item.href && item.href !== "#" ? (
                  <Link href={item.href} className="block h-full">
                    {CardContent}
                  </Link>
                ) : (
                  <div className="h-full" onClick={() => alert("Halaman ini belum tersedia")}>
                    {CardContent}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
        <div className="mt-6 text-center">
          <a href={`${appUrl}/orders/new`} className="cta-primary px-6 py-2.5 text-sm">
            Lihat Semua Layanan <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* ========== CARA KERJA + TRACKING ========== */}
      <section id="tentang" className="container grid gap-5 py-4 xl:grid-cols-2">
        <motion.div {...fadeUp()} className="rounded-xl border border-[var(--line)] bg-white p-7 xl:p-9">
          <h2 className="text-xl font-black text-[#071712]">Cara Kerja Pengiriman</h2>
          <p className="mt-1.5 text-sm text-[var(--muted)]">Kirim paket jadi lebih mudah dalam 4 langkah sederhana.</p>
          <div className="mt-6">
            <Image
              src="/images/carakerja.svg"
              alt="Cara Kerja Pengiriman"
              width={1800}
              height={874}
              className="h-auto w-full"
            />
          </div>
        </motion.div>

        <motion.div {...fadeUp(0.08)} className="dark-panel rounded-xl p-7 xl:p-9 flex flex-col md:flex-row gap-8 items-center">
          <div className="flex-1">
            <h2 className="text-2xl font-black leading-tight">Lacak Paket Anda<br/>Secara Real-Time</h2>
            <p className="mt-3 text-sm leading-6 text-white/74">
              Masukkan nomor resi untuk melacak<br/>status pengiriman paket Anda.
            </p>
            <form action={trackingUrl} className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <label className="sr-only" htmlFor="tracking-number">Nomor resi</label>
              <input
                id="tracking-number"
                name="resi"
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="Masukkan No. Resi"
                className="min-h-[46px] flex-1 rounded-lg border border-white/12 bg-white px-4 text-sm font-semibold text-[#071712] outline-none transition-all duration-200 placeholder:text-[#ccc] focus:border-[#7bc043] focus:ring-4 focus:ring-[#7bc043]/25"
              />
              <button type="submit" className="min-h-[46px] shrink-0 rounded-lg bg-[#448045] px-6 text-sm font-bold text-white transition-all duration-200 hover:brightness-110 active:scale-95">
                Lacak
              </button>
            </form>
            <p className="mt-2 text-[11px] text-white/60">Contoh No. Resi: TBX1234567890</p>
          </div>

          <div className="w-full md:w-auto md:border-l md:border-white/10 md:pl-8 space-y-5">
            {timeline.map((item, index) => (
              <div key={item} className="flex items-start gap-4">
                <span className="relative flex shrink-0 items-center justify-center mt-0.5">
                  {index < timeline.length - 1 && (
                    <span className="absolute left-1/2 top-6 bottom-[-20px] w-0 -translate-x-1/2 border-l-2 border-dashed border-[#ffb47d]/40" />
                  )}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#ffb47d]/30 bg-[#153423]">
                    <MapPin className="h-3.5 w-3.5 text-[#ffb47d]" />
                  </span>
                </span>
                <div>
                  <strong className="block text-[13px] font-bold">{item}</strong>
                  <span className="text-[11px] text-white/60">20 Mei 2024, {10 + index * 2}:{index === 1 ? '30' : index === 2 ? '15' : '00'}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ========== SIAP BERKOLABORASI ========== */}
      <section id="kolaborasi" className="container py-8">
        <motion.div {...fadeUp()} className="text-center mb-6">
          <h2 className="text-2xl font-black text-[#071712]">Siap Berkolaborasi</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Bersama Tembus, tumbuh lebih besar dan menjangkau lebih luas.</p>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Card 1 — Mitra Kurir */}
          <motion.article
            {...fadeUp(0)}
            className="motion-card overflow-hidden rounded-xl bg-[#f3f4f6] relative min-h-[260px] border border-black/5 shadow-sm"
          >
            {/* Background Image with Gradient Fade */}
            <div className="absolute inset-0 z-0 pointer-events-none">
              <Image 
                src="/images/tembusdriver.webp" 
                alt="Mitra Kurir Tembus" 
                fill
                className="object-cover object-right" 
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#f3f4f6] via-[#f3f4f6]/90 to-transparent w-[80%] md:w-[75%]" />
            </div>

            <div className="flex h-full flex-col justify-between p-6 md:p-8 relative z-10 w-[65%]">
              <div>
                <div className="flex items-center gap-3">
                  <Users className="h-6 w-6 text-[#071712]" />
                  <h3 className="text-xl font-black text-[#071712]">Mitra Kurir</h3>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-gray-700">
                  Bergabung sebagai mitra kurir Tembus dan dapatkan penghasilan menarik dengan sistem yang fleksibel.
                </p>
              </div>
              <div className="mt-8">
                <a
                  href={`${appUrl}/login`}
                  className="inline-flex rounded-md bg-[#072a20] px-5 py-2.5 text-sm font-bold !text-white shadow-md transition-all duration-200 hover:brightness-110 active:scale-95"
                >
                  Daftar Sekarang
                </a>
              </div>
            </div>
          </motion.article>

          {/* Card 2 — B2B */}
          <motion.article
            {...fadeUp(0.05)}
            className="motion-card overflow-hidden rounded-xl bg-[#f3f4f6] relative min-h-[260px] border border-black/5 shadow-sm"
          >
            {/* Background Image with Gradient Fade */}
            <div className="absolute inset-0 z-0 pointer-events-none">
              <Image 
                src="/images/tembusbusines.webp" 
                alt="B2B / Untuk Bisnis Tembus" 
                fill
                className="object-cover object-right" 
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#f3f4f6] via-[#f3f4f6]/90 to-transparent w-[80%] md:w-[75%]" />
            </div>

            <div className="flex h-full flex-col justify-between p-6 md:p-8 relative z-10 w-[65%]">
              <div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-[#071712]" />
                  <h3 className="text-xl font-black text-[#071712]">B2B / Untuk Bisnis</h3>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-gray-700">
                  Solusi logistik terintegrasi untuk bisnis Anda. Efisien, transparan, dan dapat diandalkan.
                </p>
              </div>
              <div className="mt-8">
                <a
                  href={`${appUrl}/login`}
                  className="inline-flex rounded-md bg-[#072a20] px-5 py-2.5 text-sm font-bold !text-white shadow-md transition-all duration-200 hover:brightness-110 active:scale-95"
                >
                  Pelajari Solusi
                </a>
              </div>
            </div>
          </motion.article>

          {/* Card 3 — B2C */}
          <motion.article
            {...fadeUp(0.1)}
            className="motion-card overflow-hidden rounded-xl bg-[#f3f4f6] relative min-h-[260px] border border-black/5 shadow-sm"
          >
            {/* Background Image with Gradient Fade */}
            <div className="absolute inset-0 z-0 pointer-events-none">
              <Image 
                src="/images/tembussampai.webp" 
                alt="B2C / Untuk Pribadi Tembus" 
                fill
                className="object-cover object-right" 
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#f3f4f6] via-[#f3f4f6]/90 to-transparent w-[80%] md:w-[75%]" />
            </div>

            <div className="flex h-full flex-col justify-between p-6 md:p-8 relative z-10 w-[65%]">
              <div>
                <div className="flex items-center gap-3">
                  <PackageOpen className="h-6 w-6 text-[#071712]" />
                  <h3 className="text-xl font-black text-[#071712]">B2C / Untuk Pribadi</h3>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-gray-700">
                  Kirim paket untuk kebutuhan pengiriman pribadi dengan mudah, cepat, dan aman.
                </p>
              </div>
              <div className="mt-8">
                <a
                  href={`${appUrl}/orders/new`}
                  className="inline-flex rounded-md bg-[#072a20] px-5 py-2.5 text-sm font-bold !text-white shadow-md transition-all duration-200 hover:brightness-110 active:scale-95"
                >
                  Kirim Sekarang
                </a>
              </div>
            </div>
          </motion.article>
        </div>
      </section>

      {/* ========== APP DOWNLOAD ========== */}
      <section className="container pb-8 mt-12">
        <motion.div
          {...fadeUp()}
          className="rounded-xl overflow-hidden relative flex items-center"
        >
          <Image 
            src="/images/bawahhp.webp" 
            alt="Kirim Lebih Mudah dengan Aplikasi Tembus" 
            width={2018}
            height={306}
            className="w-full h-auto object-cover"
            priority
          />
          
          {/* Overlay elements (Buttons + QR) positioned on the right empty space */}
          <div className="absolute right-[4%] md:right-[6%] lg:right-[8%] flex items-center gap-4 lg:gap-6 scale-[0.55] sm:scale-75 md:scale-90 lg:scale-100 origin-right">
            {/* Store buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={appUrl}
                className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-black px-4 py-2.5 transition-all duration-200 hover:scale-[1.02] active:scale-95 shadow-xl"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3.18 23.76c.39.22.83.24 1.24.07l12.72-7.35-2.82-2.82-11.14 10.1zM.5 1.5C.19 1.88 0 2.4 0 3.04v17.92c0 .64.19 1.16.5 1.54l.08.08 10.04-10.04v-.24L.58 1.42.5 1.5zM20.12 10.16l-2.56-1.48L14.7 11.5l2.86 2.86 2.56-1.48c.73-.42.73-1.3 0-1.72zM4.42.17L17.14 7.52l-2.82 2.82L3.18.24C3.59.07 4.03.09 4.42.17z"/>
                </svg>
                <div>
                  <div className="text-[9px] text-white/70 leading-none">TEMUKAN DI</div>
                  <div className="text-[13px] font-bold text-white leading-tight">Google Play</div>
                </div>
              </a>
              <a
                href={appUrl}
                className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-black px-4 py-2.5 transition-all duration-200 hover:scale-[1.02] active:scale-95 shadow-xl"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <div>
                  <div className="text-[9px] text-white/70 leading-none">Download di</div>
                  <div className="text-[13px] font-bold text-white leading-tight">App Store</div>
                </div>
              </a>
            </div>

            {/* QR code placeholder */}
            <div className="hidden lg:block ml-2">
              <div className="h-24 w-24 rounded-xl bg-white p-2.5 shadow-xl">
                <div className="h-full w-full rounded-lg bg-[#001911] grid grid-cols-5 grid-rows-5 gap-0.5 p-1">
                  {Array.from({ length: 25 }).map((_, i) => {
                    const pattern = [0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24,6,8,16,18,12];
                    return (
                      <div
                        key={i}
                        className={`rounded-[1px] ${pattern.includes(i) ? 'bg-white' : 'bg-transparent'}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ========== FOOTER ========== */}
      <Footer />
    </main>
  );
}
