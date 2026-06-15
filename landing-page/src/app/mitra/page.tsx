"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import {
  Banknote,
  CalendarDays,
  ShieldCheck,
  TrendingUp,
  Download,
  FileText,
  UserCheck,
  Package,
  ChevronDown
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export default function MitraKurirPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "Apa saja syarat utama untuk menjadi Mitra Kurir Tembus?",
      a: "Anda harus memiliki KTP asli, SIM yang masih berlaku (SIM C untuk motor, SIM A/B untuk mobil), STNK aktif, serta smartphone Android/iOS minimal RAM 3GB."
    },
    {
      q: "Bagaimana sistem pembagian hasil (komisi)?",
      a: "Sistem bagi hasil di Tembus sangat transparan. Anda akan mendapatkan hingga 85% dari total tarif pengiriman, ditambah bonus insentif jika mencapai target harian."
    },
    {
      q: "Apakah jam kerjanya mengikat?",
      a: "Tidak. Anda memiliki kebebasan penuh untuk menentukan kapan Anda ingin online dan menerima pesanan. Sangat cocok dijadikan sebagai penghasilan tambahan atau pekerjaan utama."
    },
    {
      q: "Kapan pendapatan bisa ditarik?",
      a: "Pendapatan dari setiap pengiriman yang selesai akan masuk ke Dompet Mitra Anda secara real-time. Anda bisa melakukan penarikan (cashout) ke rekening bank terdaftar kapan saja."
    }
  ];

  return (
    <main className="page-shell bg-[#f8fafc]">
      <div className="bg-[#001911]">
        <Header />
      </div>

      {/* ========== HERO ========== */}
      <section className="relative overflow-hidden bg-[#001911] pt-16 pb-24 text-white">
        <div className="absolute inset-0 z-0">
          <div className="absolute right-0 top-0 h-[500px] w-[500px] translate-x-1/3 -translate-y-1/3 rounded-full bg-[#ff6908]/10 blur-[100px]" />
          <div className="absolute left-0 bottom-0 h-[400px] w-[400px] -translate-x-1/3 translate-y-1/3 rounded-full bg-[#0b6b45]/20 blur-[100px]" />
        </div>

        <div className="container relative z-10 mx-auto px-6 text-center">
          <motion.div {...fadeUp()} className="mx-auto max-w-3xl">
            <h1 className="mb-6 text-4xl font-black leading-tight lg:text-6xl">
              Jadi <span className="text-[#9bd46f]">Mitra Kurir Tembus</span>,<br />
              Waktu Fleksibel, Hasil Maksimal.
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-white/80">
              Bergabunglah bersama ribuan mitra kurir Tembus. Atur sendiri jam kerja Anda dan nikmati berbagai keuntungan serta bonus menarik setiap harinya.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/mitra/daftar"
                className="inline-flex items-center justify-center rounded-xl bg-[#ff6908] px-8 py-4 font-bold text-white shadow-xl shadow-[#ff6908]/20 transition-all hover:scale-105 hover:brightness-110 active:scale-95 w-full sm:w-auto"
              >
                Daftar Sekarang
              </Link>
              <a
                href="#cara-bergabung"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-8 py-4 font-bold text-white backdrop-blur-sm transition-all hover:bg-white/10 active:scale-95 w-full sm:w-auto"
              >
                Lihat Cara Gabung
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ========== KEUNTUNGAN ========== */}
      <section id="keuntungan" className="py-24">
        <div className="container mx-auto px-6">
          <motion.div {...fadeUp()} className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-black text-[#071712] lg:text-4xl">Kenapa Gabung Tembus?</h2>
            <p className="mx-auto max-w-2xl text-[#64748b]">Kami memberikan yang terbaik untuk mitra kami karena kami percaya kesuksesan Tembus bermula dari kesejahteraan mitra.</p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Banknote, title: "Penghasilan Maksimal", desc: "Nikmati skema bagi hasil yang menguntungkan hingga 85% untuk Anda." },
              { icon: CalendarDays, title: "Waktu Fleksibel", desc: "Bebas atur kapan dan di mana Anda ingin bekerja. Tidak ada target jam mengikat." },
              { icon: TrendingUp, title: "Bonus & Insentif", desc: "Dapatkan bonus harian dengan menyelesaikan misi pengiriman tertentu." },
              { icon: ShieldCheck, title: "Aman & Nyaman", desc: "Dilindungi oleh asuransi selama bertugas untuk menjamin ketenangan kerja." }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                {...fadeUp(0.1 * idx)}
                className="group rounded-3xl border border-[#e2e8f0] bg-white p-8 shadow-sm transition-all hover:border-[#0b6b45]/30 hover:shadow-xl"
              >
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef6ed] text-[#003d2b] transition-transform group-hover:scale-110">
                  <item.icon className="h-7 w-7" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-[#071712]">{item.title}</h3>
                <p className="text-[#64748b] leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CARA BERGABUNG ========== */}
      <section id="cara-bergabung" className="bg-[#eef6ed] py-24">
        <div className="container mx-auto px-6">
          <motion.div {...fadeUp()} className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-black text-[#071712] lg:text-4xl">Cara Bergabung Sangat Mudah</h2>
            <p className="mx-auto max-w-2xl text-[#64748b]">Proses pendaftaran 100% online melalui aplikasi Tembus Driver. Siapkan dokumen dan mulai jalan dalam 24 jam!</p>
          </motion.div>

          <div className="relative mx-auto max-w-4xl">
            {/* Connecting line */}
            <div className="absolute left-[39px] top-10 bottom-10 w-[2px] bg-[#003d2b]/20 md:left-1/2 md:-ml-[1px]" />

            <div className="space-y-12">
              {[
                { icon: Download, title: "Download Aplikasi", desc: "Unduh aplikasi Tembus Driver melalui Google Play atau App Store di smartphone Anda." },
                { icon: FileText, title: "Isi Data & Upload Dokumen", desc: "Buka aplikasi, daftar akun baru, lalu unggah foto KTP, SIM, STNK, dan foto selfie Anda." },
                { icon: UserCheck, title: "Proses Verifikasi", desc: "Tim Tembus akan memverifikasi dokumen Anda paling lambat 1x24 jam hari kerja." },
                { icon: Package, title: "Mulai Terima Pesanan", desc: "Setelah akun aktif, Anda bisa langsung online dan mulai mengambil pesanan di sekitar Anda." }
              ].map((step, idx) => (
                <motion.div key={idx} {...fadeUp(0.1 * idx)} className={`relative flex items-start gap-8 md:justify-between ${idx % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                  {/* Timeline icon */}
                  <div className="absolute left-0 md:left-1/2 flex h-20 w-20 md:-translate-x-1/2 items-center justify-center rounded-full border-[6px] border-[#eef6ed] bg-[#003d2b] text-white shadow-lg z-10">
                    <step.icon className="h-8 w-8" />
                  </div>
                  
                  {/* Content Card */}
                  <div className={`w-full ml-24 md:ml-0 md:w-[calc(50%-3rem)] ${idx % 2 === 0 ? 'md:text-right md:pr-12' : 'md:text-left md:pl-12'}`}>
                    <div className="rounded-2xl bg-white p-6 shadow-sm border border-[#e2e8f0]">
                      <span className="mb-2 block text-sm font-bold text-[#ff6908]">Langkah {idx + 1}</span>
                      <h3 className="mb-3 text-xl font-bold text-[#071712]">{step.title}</h3>
                      <p className="text-[#64748b] leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ========== FAQ ========== */}
      <section id="faq" className="py-24">
        <div className="container mx-auto px-6 max-w-3xl">
          <motion.div {...fadeUp()} className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-black text-[#071712] lg:text-4xl">Pertanyaan yang Sering Diajukan</h2>
            <p className="text-[#64748b]">Punya pertanyaan lain seputar mitra kurir? Temukan jawabannya di bawah ini.</p>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <motion.div 
                key={idx} 
                {...fadeUp(0.1 * idx)}
                className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white transition-all hover:border-[#0b6b45]/30"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="flex w-full items-center justify-between p-6 text-left"
                >
                  <span className="text-lg font-bold text-[#071712]">{faq.q}</span>
                  <ChevronDown className={`h-5 w-5 text-[#64748b] transition-transform duration-300 ${openFaq === idx ? 'rotate-180' : ''}`} />
                </button>
                <div 
                  className={`overflow-hidden transition-all duration-300 ${openFaq === idx ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <p className="px-6 pb-6 text-[#64748b] leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
