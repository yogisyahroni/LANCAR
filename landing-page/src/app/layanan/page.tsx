"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { serviceCategories, services, serviceCountLabel } from "@/data/services";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: "easeOut" as const }
  };
}

export default function ServicesHubPage() {
  return (
    <>
      <div className="bg-[#001911]">
        <Header />
      </div>
      <main className="bg-[#fcfcfc] min-h-screen pt-8 pb-16">
        
        {/* HERO SECTION */}
        <section className="container py-12 md:py-20 text-center">
          <motion.div {...fadeUp()} className="max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f3ef] px-3 py-1 text-xs font-bold text-[#072a20] uppercase tracking-wide mb-4">
              <MapPin className="h-3.5 w-3.5" />
              Layanan Kami
            </span>
            <h1 className="text-4xl md:text-5xl font-black text-[#071712] mb-6 leading-tight">
              Solusi Pengiriman Tepat untuk <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#072a20] to-[#0a4a35]">Setiap Kebutuhan</span>
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed">
              Dari pengiriman dokumen kilat hingga bantuan kendaraan di jalan, Tembus menyediakan {serviceCountLabel} yang fleksibel, aman, dan dapat diandalkan untuk individu maupun bisnis.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Kategori layanan">
              {serviceCategories.slice(1).map((category) => (
                <span key={category.id} className="rounded-full border border-[#dbe6df] bg-white px-3 py-1.5 text-xs font-bold text-[#52645c]">
                  {category.label}
                </span>
              ))}
            </div>
          </motion.div>
        </section>

        {/* SERVICES GRID */}
        <section className="container py-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {services.map((service, idx) => (
              <motion.article 
                key={service.id}
                {...fadeUp(0.1 + (idx * 0.05))}
                className="bg-white rounded-2xl p-6 md:p-8 border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition-all duration-300 flex flex-col h-full group"
              >
                <div className="h-14 w-14 rounded-xl bg-[#f0fdf4] text-[#072a20] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <service.icon className="h-7 w-7" />
                </div>

                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-bold text-[#071712]">{service.title}</h3>
                  <span className="rounded-full bg-[#eef6ed] px-2.5 py-1 text-[10px] font-bold text-[#37624b]">{service.categoryLabel}</span>
                </div>
                <p className="text-gray-600 mb-6 flex-grow leading-relaxed text-sm">
                  {service.text}
                </p>

                <div className="mb-8 space-y-2.5">
                  {service.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <div className="h-4 w-4 rounded-full bg-[#e8f3ef] text-[#072a20] flex items-center justify-center shrink-0">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      {feature}
                    </div>
                  ))}
                </div>

                {service.external ? (
                  <a
                    href={service.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-[#072a20] transition-colors hover:text-[#0a4a35] group/link"
                  >
                    Pelajari Lebih Lanjut
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/link:translate-x-1" />
                  </a>
                ) : (
                  <Link
                    href={service.href}
                    className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-[#072a20] transition-colors hover:text-[#0a4a35] group/link"
                  >
                    Pelajari Lebih Lanjut
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/link:translate-x-1" />
                  </Link>
                )}
              </motion.article>
            ))}
          </div>
        </section>

        {/* CALL TO ACTION */}
        <section className="container mt-16 md:mt-24">
          <motion.div 
            {...fadeUp(0.3)}
            className="rounded-3xl bg-[#072a20] p-10 md:p-14 text-center relative overflow-hidden"
          >
            {/* Dekorasi Background */}
            <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
              <svg width="200" height="200" viewBox="0 0 24 24" fill="white">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>

            <div className="relative z-10 max-w-2xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Siap untuk Kirim Paket Anda?</h2>
              <p className="text-white/80 mb-8 leading-relaxed">
                Buat pesanan sekarang dan nikmati pengalaman pengiriman yang lebih cepat, aman, dan mudah dilacak kapan saja di mana saja.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <a 
                  href={process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/orders/new` : "#"} 
                  className="rounded-xl bg-[#00ff88] px-8 py-3.5 text-sm font-bold text-[#071712] shadow-lg shadow-[#00ff88]/20 transition-all hover:bg-[#00e67a] hover:scale-105 active:scale-95"
                >
                  Kirim Paket Sekarang
                </a>
                <Link 
                  href="/perusahaan/kontak" 
                  className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 px-8 py-3.5 text-sm font-bold text-white transition-all hover:bg-white/20 active:scale-95"
                >
                  Hubungi Sales Kami
                </Link>
              </div>
            </div>
          </motion.div>
        </section>

      </main>
      <Footer />
    </>
  );
}
