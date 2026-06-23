"use client";

import Image from "next/image";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Briefcase, Quote, Star, TrendingUp } from "lucide-react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export default function CaseStudyPage() {
  const appUrl = "https://app.bawain.my.id";

  return (
    <main className="page-shell bg-[#f8fafc]">
      {/* ========== HERO ========== */}
      <section className="relative min-h-[400px] lg:min-h-[500px] overflow-hidden bg-[#001911] text-white">
        {/* Solid Background */}
        <div className="absolute inset-0 z-0 bg-[#001911]">
        </div>

        <Header />

        {/* Hero Content */}
        <div className="relative z-10 px-6 pb-14 pt-16 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
          <div className="flex flex-col items-center justify-center text-center pt-8 lg:pt-16">
            <motion.div {...fadeUp()} className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-[#9bd46f] mb-6 backdrop-blur-sm border border-white/10">
                <Briefcase className="w-4 h-4" />
                <span>Kisah Sukses Mitra</span>
              </div>
              <h1 className="text-4xl font-black leading-[1.1] tracking-tight lg:text-5xl xl:text-6xl mb-6">
                Bukti Nyata <span className="text-[#9bd46f]">Inovasi Logistik</span>
              </h1>
              <p className="text-[15px] leading-relaxed text-white/80 lg:text-[17px]">
                Pelajari bagaimana perusahaan dari berbagai industri bertransformasi, mengatasi hambatan rantai pasok, dan tumbuh lebih cepat bersama Tembus.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========== EMPTY STATE / COMING SOON ========== */}
      <section className="py-20 lg:py-28 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
        <motion.div {...fadeUp(0.1)} className="max-w-4xl mx-auto text-center bg-white p-12 md:p-20 rounded-3xl shadow-sm border border-[#e2e8f0]">
          <div className="w-20 h-20 bg-[#eef6ed] rounded-full flex items-center justify-center mx-auto mb-6">
            <Briefcase className="w-10 h-10 text-[#003d2b]" />
          </div>
          <h2 className="text-2xl font-black text-[#071712] mb-4">Sedang Menyusun Kisah Sukses</h2>
          <p className="text-[#64748b] leading-relaxed max-w-2xl mx-auto text-sm md:text-base">
            Saat ini kami sedang berkolaborasi dengan berbagai mitra bisnis yang luar biasa. 
            Halaman ini akan segera kami perbarui dengan studi kasus nyata yang menginspirasi.
            <br /><br />
            Apakah bisnis Anda ingin menjadi salah satu kisah sukses kami berikutnya?
          </p>
        </motion.div>
      </section>

      {/* ========== CALL TO ACTION ========== */}
      <section className="bg-white py-20 px-6 sm:px-10 text-center border-t border-[#e2e8f0]">
        <motion.div {...fadeUp()} className="max-w-2xl mx-auto flex flex-col items-center">
          <div className="w-16 h-16 bg-[#eef6ed] text-[#003d2b] rounded-full flex items-center justify-center mb-6">
            <Star className="w-8 h-8 fill-current" />
          </div>
          <h2 className="text-3xl font-black text-[#071712] mb-6">Jadilah Kisah Sukses Berikutnya</h2>
          <p className="text-[#475569] mb-10 text-lg">
            Apapun tantangan logistik perusahaan Anda, kami siap mendengarkan dan merancang solusinya. Mari diskusi hari ini.
          </p>
          <a
            href={`${appUrl}/orders/new`}
            className="inline-flex rounded-lg bg-[#003d2b] px-8 py-3.5 text-[15px] font-bold text-white shadow-lg transition-all hover:bg-[#00281e] hover:scale-105 active:scale-95"
          >
            Konsultasikan Masalah Anda
          </a>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
