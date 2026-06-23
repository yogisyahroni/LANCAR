"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Smartphone, Download, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export default function DaftarMitraPage() {
  return (
    <main className="page-shell bg-[#f8fafc] flex flex-col min-h-screen">
      <div className="bg-[#001911]">
        <Header />
      </div>

      {/* ========== CONTENT ========== */}
      <section className="flex-grow flex items-center py-20 px-6 sm:px-10 lg:px-16">
        <div className="max-w-4xl mx-auto w-full">
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row border border-[#e2e8f0]">
            
            {/* Left side: Content */}
            <div className="flex-1 p-10 md:p-14 flex flex-col justify-center">
              <motion.div {...fadeUp()} className="inline-flex items-center gap-2 rounded-full bg-[#eef6ed] px-4 py-2 text-sm font-semibold text-[#003d2b] mb-6">
                <Smartphone className="w-4 h-4" />
                <span>Download Tembus Driver</span>
              </motion.div>
              
              <motion.h1 {...fadeUp(0.1)} className="text-3xl md:text-4xl font-black mb-6 text-[#071712] leading-tight">
                Pendaftaran Mitra Kurir <span className="text-[#0b6b45]">Tembus</span>
              </motion.h1>
              
              <motion.p {...fadeUp(0.2)} className="text-[#475569] text-lg leading-relaxed mb-8">
                Untuk proses pendaftaran, verifikasi berkas, dan aktivasi akun yang lebih cepat, pendaftaran mitra kurir saat ini dialihkan sepenuhnya melalui aplikasi <strong className="text-[#071712]">Tembus Driver</strong>.
              </motion.p>

              <motion.div {...fadeUp(0.3)} className="space-y-4 mb-10">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#0b6b45]" />
                  <span className="text-[#475569]">Verifikasi KTP dan SIM lebih instan</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#0b6b45]" />
                  <span className="text-[#475569]">Langsung siap menerima pesanan setelah aktif</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#0b6b45]" />
                  <span className="text-[#475569]">Notifikasi real-time & dompet digital terintegrasi</span>
                </div>
              </motion.div>

              <motion.div {...fadeUp(0.4)} className="flex flex-col sm:flex-row gap-4">
                <a
                  href="https://play.google.com/store/apps/details?id=id.tembus.driver"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 rounded-xl bg-[#071712] px-6 py-4 text-white font-bold transition-all hover:bg-[#00281e] hover:scale-105 active:scale-95"
                >
                  <Download className="w-5 h-5" />
                  Google Play
                </a>
                <a
                  href="https://apps.apple.com/id/app/tembus-driver/id000000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 rounded-xl bg-[#0066cc] px-6 py-4 text-white font-bold transition-all hover:bg-[#005bb5] hover:scale-105 active:scale-95"
                >
                  <Download className="w-5 h-5" />
                  App Store
                </a>
              </motion.div>
            </div>

            {/* Right side: Illustration / Visual */}
            <div className="hidden md:block w-2/5 bg-[#001911] relative overflow-hidden">
              <div className="absolute inset-0 opacity-20">
                {/* Decorative background pattern */}
                <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full border-[20px] border-[#9bd46f]"></div>
                <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full border-[30px] border-white"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center p-8 lg:p-12">
                <div className="relative w-full h-full flex items-center justify-center">
                   <Image 
                     src="/ladingpagedaftar.png"
                     alt="Tembus Driver App"
                     fill
                     className="object-contain object-center drop-shadow-2xl"
                     sizes="(max-width: 768px) 100vw, 40vw"
                   />
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
