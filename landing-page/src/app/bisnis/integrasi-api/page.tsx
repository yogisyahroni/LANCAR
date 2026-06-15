"use client";

import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Activity, Code2, Fingerprint, Terminal, Webhook } from "lucide-react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

const codeSnippet = `{
  "status": "success",
  "data": {
    "tracking_id": "TBS-123456789",
    "service": "Same Day",
    "status": "ON_DELIVERY",
    "driver": {
      "name": "Budi Santoso",
      "phone": "0812-3456-7890"
    },
    "estimated_arrival": "2024-05-15T14:30:00Z"
  }
}`;

export default function IntegrasiApiPage() {

  return (
    <main className="page-shell bg-[#f8fafc]">
      {/* ========== HERO ========== */}
      <section className="relative min-h-[500px] lg:min-h-[600px] overflow-hidden bg-[#001911] text-white">
        {/* Solid Background */}
        <div className="absolute inset-0 z-0 bg-[#001911]">
          {/* Subtle noise or mesh pattern could go here, but solid is clean */}
        </div>

        <Header />

        {/* Hero Content */}
        <div className="relative z-10 px-6 pb-14 pt-16 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8 pt-8 lg:pt-16 max-w-7xl mx-auto">
            {/* Left: Text Content */}
            <motion.div {...fadeUp()} className="max-w-xl text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-[#9bd46f] mb-6 backdrop-blur-sm border border-white/10">
                <Code2 className="w-4 h-4" />
                <span>Developer Friendly API</span>
              </div>
              <h1 className="text-4xl font-black leading-[1.1] tracking-tight lg:text-5xl xl:text-6xl mb-6">
                Otomatisasi Penuh via <span className="text-[#9bd46f]">REST API</span>
              </h1>
              <p className="mb-10 text-[15px] leading-relaxed text-white/80 lg:text-[17px]">
                Hubungkan platform e-commerce, ERP, atau WMS Anda langsung ke ekosistem logistik Tembus. Buat pesanan, lacak paket real-time, dan cek tarif langsung dari dalam sistem Anda sendiri.
              </p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="/docs"
                  className="inline-flex rounded-lg bg-[#ff6908] px-8 py-3.5 text-[15px] font-bold text-white shadow-xl shadow-[#ff6908]/20 transition-all hover:scale-105 hover:brightness-110 active:scale-95"
                >
                  Baca Dokumentasi API
                </a>
                <Link
                  href="/developer/keys"
                  className="inline-flex rounded-lg border border-white/20 bg-white/5 backdrop-blur-sm px-8 py-3.5 text-[15px] font-bold text-white shadow-xl transition-all hover:bg-white/10 active:scale-95"
                >
                  Dapatkan API Key
                </Link>
              </div>
            </motion.div>

            {/* Right: Code Snippet Mockup */}
            <motion.div {...fadeUp(0.2)} className="w-full lg:w-1/2">
              <div className="relative rounded-2xl bg-[#0a0a0a] border border-white/10 shadow-2xl overflow-hidden">
                {/* Window Controls */}
                <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-white/10">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                  <span className="ml-2 text-xs font-mono text-white/40">GET /api/v1/track/TBS-123456789</span>
                </div>
                {/* Code Body */}
                <div className="p-4 lg:p-6 overflow-x-auto">
                  <pre className="text-sm font-mono leading-relaxed text-[#a5d6ff]">
                    <code>{codeSnippet}</code>
                  </pre>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========== FEATURES ========== */}
      <section className="py-20 lg:py-28 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-16">
            <h2 className="text-3xl font-black text-[#071712] mb-4">Integrasi Tanpa Hambatan</h2>
            <p className="text-[#64748b] max-w-2xl mx-auto">
              Dibangun oleh developer untuk developer. Arsitektur API kami dirancang untuk kestabilan tinggi dengan dokumentasi yang jelas dan mudah diimplementasikan.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              { 
                icon: Terminal, 
                title: "RESTful Architecture", 
                desc: "Berbasis standar industri REST. Kembalian berupa format JSON yang ringan, terstruktur, dan mudah diproses oleh bahasa pemrograman apa pun." 
              },
              { 
                icon: Webhook, 
                title: "Real-time Webhooks", 
                desc: "Tidak perlu polling terus-menerus. Dapatkan push notification instan ke server Anda setiap ada perubahan status pengiriman." 
              },
              { 
                icon: Fingerprint, 
                title: "Keamanan Standar Bank", 
                desc: "Dilengkapi dengan enkripsi TLS 1.3, autentikasi via Bearer Token, dan pembatasan akses berbasis IP (IP Whitelisting)." 
              },
              { 
                icon: Activity, 
                title: "High Availability 99.9%", 
                desc: "Infrastruktur cloud Tembus menjamin uptime tinggi untuk memastikan proses pemesanan dan pelacakan Anda tidak pernah terputus." 
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
          <h2 className="text-3xl font-black text-[#071712] mb-6">Mulai Integrasi Hari Ini</h2>
          <p className="text-[#475569] mb-10 text-lg">
            Jelajahi Sandbox Environment kami dan rasakan kemudahan mengintegrasikan layanan Tembus ke dalam sistem Anda hanya dalam hitungan menit.
          </p>
          <a
            href="/docs"
            className="inline-flex rounded-lg bg-[#003d2b] px-8 py-3.5 text-[15px] font-bold text-white shadow-lg transition-all hover:bg-[#00281e] hover:scale-105 active:scale-95"
          >
            Masuk ke Developer Portal
          </a>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
