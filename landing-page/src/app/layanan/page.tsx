"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Truck, Package, Clock, ShieldCheck, Zap, Building2, MapPin } from "lucide-react";

const services = [
  { 
    id: "reguler",
    icon: Truck,
    title: "Reguler", 
    text: "Layanan pengiriman standar dengan harga ekonomis namun tetap mengutamakan ketepatan waktu. Solusi tepat untuk pengiriman harian antar kota.", 
    href: "/layanan/reguler",
    features: ["Harga kompetitif", "Estimasi 2-3 hari", "Cakupan nasional"]
  },
  { 
    id: "cargo",
    icon: Package,
    title: "Cargo", 
    text: "Solusi pengiriman barang besar, berat, dan bervolume tinggi. Sangat cocok untuk pindahan atau distribusi logistik antar pulau.", 
    href: "/layanan/cargo",
    features: ["Kapasitas besar", "Tarif per kg lebih murah", "Penanganan khusus"]
  },
  { 
    id: "cod",
    icon: ShieldCheck,
    title: "Cash on Delivery (COD)", 
    text: "Beri kemudahan bertransaksi dengan opsi bayar di tempat. Menjamin keamanan belanja online bagi pelanggan Anda.", 
    href: "/layanan/cod",
    features: ["Bayar di tempat", "Pencairan dana cepat", "Aman terpercaya"]
  },
  { 
    id: "instant",
    icon: Zap,
    title: "Instant", 
    text: "Pengiriman super cepat dalam hitungan jam di hari yang sama. Prioritas utama untuk dokumen penting atau barang mendesak.", 
    href: "/layanan/instant",
    features: ["Selesai dalam hitungan jam", "Prioritas utama", "Lacak real-time"]
  },
  { 
    id: "same-day",
    icon: Clock,
    title: "Same Day", 
    text: "Kirim pagi, sampai sore. Solusi pas untuk menjaga efisiensi bisnis dengan pengiriman yang tiba pada hari yang sama.", 
    href: "/layanan/same-day",
    features: ["Tiba hari yang sama", "Tarif bersahabat", "Kurir fleksibel"]
  },
  { 
    id: "business",
    icon: Building2,
    title: "Business / B2B", 
    text: "Solusi logistik yang dirancang khusus untuk ekosistem korporat. Terintegrasi API dengan dashboard pelacakan mendalam.", 
    href: "/layanan/business",
    features: ["Integrasi API", "Dedicated account manager", "Report analitik"]
  }
];

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
              Dari pengiriman dokumen kilat hingga kargo antar pulau, Tembus menyediakan layanan yang fleksibel, aman, dan dapat diandalkan untuk individu maupun bisnis skala besar.
            </p>
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
                
                <h3 className="text-xl font-bold text-[#071712] mb-3">{service.title}</h3>
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

                <Link 
                  href={service.href}
                  className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-[#072a20] hover:text-[#0a4a35] transition-colors group/link"
                >
                  Pelajari Lebih Lanjut
                  <ArrowRight className="h-4 w-4 group-hover/link:translate-x-1 transition-transform" />
                </Link>
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
