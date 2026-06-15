"use client";

import Image from "next/image";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Building, Crown, Gem, Globe, ShieldCheck } from "lucide-react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export default function EnterprisePage() {
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
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-[#ffbd2e] mb-6 backdrop-blur-sm border border-white/10">
                <Crown className="w-4 h-4" />
                <span>Kemitraan Logistik Eksklusif</span>
              </div>
              <h1 className="text-4xl font-black leading-[1.1] tracking-tight lg:text-5xl xl:text-6xl mb-6">
                Tembus <span className="text-[#9bd46f]">Enterprise</span>
              </h1>
              <p className="mb-10 text-[15px] leading-relaxed text-white/80 lg:text-[17px]">
                Solusi mobilitas dan distribusi tingkat atas yang dirancang sepenuhnya mengikuti standar operasional perusahaan Anda. Kami menyediakan armada eksklusif, rute khusus, dan dukungan VIP tanpa kompromi.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <a
                  href={`${appUrl}/orders/new`}
                  className="inline-flex rounded-lg bg-[#ff6908] px-8 py-3.5 text-[15px] font-bold text-white shadow-xl shadow-[#ff6908]/20 transition-all hover:scale-105 hover:brightness-110 active:scale-95"
                >
                  Hubungi Konsultan Enterprise
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
            <h2 className="text-3xl font-black text-[#071712] mb-4">Layanan Premium untuk Korporasi Besar</h2>
            <p className="text-[#64748b] max-w-2xl mx-auto">
              Ketika volume pengiriman mencapai skala masif, Anda membutuhkan mitra yang mampu beradaptasi dan memberikan jaminan performa tertinggi.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              { 
                icon: Building, 
                title: "Dedicated Fleet & Routing", 
                desc: "Armada yang didedikasikan 100% hanya untuk rute operasional perusahaan Anda, memastikan ketersediaan tanpa batas." 
              },
              { 
                icon: ShieldCheck, 
                title: "Strict SLA & Compliance", 
                desc: "Jaminan Service Level Agreement (SLA) 99.9% yang disesuaikan dengan protokol keamanan dan standar compliance industri Anda." 
              },
              { 
                icon: Gem, 
                title: "Logistics Consultant", 
                desc: "Didampingi oleh pakar rantai pasok (supply chain) kami untuk terus mengaudit dan mengoptimalkan biaya logistik tahunan Anda." 
              },
              { 
                icon: Globe, 
                title: "Custom Integrations", 
                desc: "Integrasi sistem yang dibangun khusus untuk menyesuaikan arsitektur perangkat lunak legacy milik perusahaan Anda." 
              }
            ].map((feature, i) => (
              <motion.div 
                key={i} 
                {...fadeUp(0.1 * i)} 
                className="bg-white p-8 rounded-2xl shadow-sm border border-[#e2e8f0] hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#eef6ed] rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-[#003d2b] text-[#9bd46f] flex items-center justify-center mb-6 shadow-lg">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-[#071712] mb-3">{feature.title}</h3>
                  <p className="text-[#64748b] leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CALL TO ACTION ========== */}
      <section className="bg-[#00281e] py-20 px-6 sm:px-10 text-center text-white relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#9bd46f] opacity-10 blur-[100px] rounded-full pointer-events-none" />
        
        <motion.div {...fadeUp()} className="max-w-2xl mx-auto relative z-10">
          <h2 className="text-3xl font-black mb-6">Mitra Strategis Pertumbuhan Anda</h2>
          <p className="text-white/80 mb-10 text-lg">
            Bergabunglah dengan korporasi multinasional lainnya yang telah memercayakan manajemen logistik inti mereka kepada Tembus Enterprise.
          </p>
          <a
            href={`${appUrl}/orders/new`}
            className="inline-flex rounded-lg bg-[#9bd46f] px-8 py-3.5 text-[15px] font-bold text-[#001911] shadow-xl shadow-[#9bd46f]/20 transition-all hover:bg-white hover:scale-105 active:scale-95"
          >
            Minta Proposal Penawaran
          </a>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
