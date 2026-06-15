"use client";

import Image from "next/image";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { BarChart3, Box, Clock, Network, ShieldCheck } from "lucide-react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export default function SolusiLogistikPage() {
  const appUrl = "https://app.bawain.my.id";

  return (
    <main className="page-shell bg-[#f8fafc]">
      {/* ========== HERO ========== */}
      <section className="relative min-h-[500px] lg:min-h-[600px] overflow-hidden bg-[#001911] text-white">
        {/* Solid Background */}
        <div className="absolute inset-0 z-0 bg-[#001911]">
        </div>

        <Header />

        {/* Hero Content */}
        <div className="relative z-10 px-6 pb-14 pt-16 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
          <div className="flex flex-col items-center justify-center text-center pt-8 lg:pt-16">
            <motion.div {...fadeUp()} className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-[#9bd46f] mb-6 backdrop-blur-sm border border-white/10">
                <Network className="w-4 h-4" />
                <span>Distribusi & Rantai Pasok Terintegrasi</span>
              </div>
              <h1 className="text-4xl font-black leading-[1.1] tracking-tight lg:text-5xl xl:text-6xl mb-6">
                Solusi <span className="text-[#9bd46f]">Logistik Terpadu</span>
              </h1>
              <p className="mb-10 text-[15px] leading-relaxed text-white/80 lg:text-[17px]">
                Ubah kerumitan logistik perusahaan Anda menjadi keunggulan kompetitif. Kami menyediakan manajemen rantai pasok (supply chain) end-to-end yang disesuaikan khusus dengan kebutuhan unik industri Anda.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <a
                  href={`${appUrl}/orders/new`}
                  className="inline-flex rounded-lg bg-[#ff6908] px-8 py-3.5 text-[15px] font-bold text-white shadow-xl shadow-[#ff6908]/20 transition-all hover:scale-105 hover:brightness-110 active:scale-95"
                >
                  Jadwalkan Konsultasi Logistik
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========== FEATURES ========== */}
      <section className="py-20 lg:py-28 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-16">
            <h2 className="text-3xl font-black text-[#071712] mb-4">Membangun Efisiensi untuk Skala Bisnis Anda</h2>
            <p className="text-[#64748b] max-w-2xl mx-auto">
              Tidak ada dua perusahaan yang identik. Kami merancang strategi operasional logistik yang adaptif dan proaktif untuk mengatasi tantangan pengiriman barang bisnis Anda.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              { 
                icon: Box, 
                title: "Manajemen Inventaris & Gudang", 
                desc: "Solusi pergudangan modern yang terhubung langsung dengan armada pengiriman untuk mempercepat pemrosesan pesanan." 
              },
              { 
                icon: BarChart3, 
                title: "Analitik Data Pengiriman", 
                desc: "Ambil keputusan berbasis data. Dapatkan laporan efisiensi biaya, durasi SLA, dan tren pengiriman harian perusahaan Anda." 
              },
              { 
                icon: Clock, 
                title: "Otomasi Proses Bisnis", 
                desc: "Kurangi kesalahan input manual dengan alur operasional logistik yang berjalan secara otomatis melalui sistem cerdas kami." 
              },
              { 
                icon: ShieldCheck, 
                title: "SLA Ketat & Asuransi Prioritas", 
                desc: "Kami berkomitmen pada Service Level Agreement (SLA) yang disepakati dengan perlindungan asuransi penuh untuk setiap aset perusahaan." 
              }
            ].map((feature, i) => (
              <motion.div 
                key={i} 
                {...fadeUp(0.1 * i)} 
                className="bg-white p-8 rounded-2xl shadow-sm border border-[#e2e8f0] hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-[#eef6ed] text-[#003d2b] flex items-center justify-center mb-6">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-[#071712] mb-3">{feature.title}</h3>
                <p className="text-[#64748b] leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CALL TO ACTION ========== */}
      <section className="bg-[#eef6ed] py-20 px-6 sm:px-10 text-center">
        <motion.div {...fadeUp()} className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-black text-[#071712] mb-6">Tingkatkan Performa Rantai Pasok Anda</h2>
          <p className="text-[#475569] mb-10 text-lg">
            Temukan bagaimana perusahaan-perusahaan besar berhasil memangkas biaya operasional dengan beralih ke Solusi Logistik Terpadu Tembus.
          </p>
          <a
            href={`${appUrl}/orders/new`}
            className="inline-flex rounded-lg bg-[#003d2b] px-8 py-3.5 text-[15px] font-bold text-white shadow-lg transition-all hover:bg-[#00281e] hover:scale-105 active:scale-95"
          >
            Hubungi Tim Enterprise Kami
          </a>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
