"use client";

import Image from "next/image";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Boxes, PackageOpen, ShieldCheck, Truck, Weight } from "lucide-react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export default function CargoPage() {
  const appUrl = "https://app.bawain.my.id";

  return (
    <main className="page-shell bg-[#f8fafc]">
      {/* ========== HERO ========== */}
      <section className="relative min-h-[500px] lg:min-h-[600px] overflow-hidden bg-[#001911] text-white">
        {/* SVG Background */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/header landing page.svg"
            alt=""
            fill
            priority
            className="object-cover opacity-60"
            style={{ objectPosition: 'center top' }}
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#001911]/90" />
        </div>

        <Header />

        {/* Hero Content */}
        <div className="relative z-10 px-6 pb-14 pt-16 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
          <div className="flex flex-col items-center justify-center text-center pt-8 lg:pt-16">
            <motion.div {...fadeUp()} className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-[#9bd46f] mb-6 backdrop-blur-sm border border-white/10">
                <Truck className="w-4 h-4" />
                <span>Kapasitas Besar, Harga Bersahabat</span>
              </div>
              <h1 className="text-4xl font-black leading-[1.1] tracking-tight lg:text-5xl xl:text-6xl mb-6">
                Layanan <span className="text-[#9bd46f]">Cargo</span>
              </h1>
              <p className="mb-10 text-[15px] leading-relaxed text-white/80 lg:text-[17px]">
                Kirim barang berukuran besar, berat, atau dalam jumlah banyak? Layanan Cargo Tembus memberikan tarif khusus yang lebih hemat untuk kebutuhan pengiriman skala besar Anda.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <a
                  href={`${appUrl}/orders/new`}
                  className="inline-flex rounded-lg bg-[#ff6908] px-8 py-3.5 text-[15px] font-bold text-white shadow-xl shadow-[#ff6908]/20 transition-all hover:scale-105 hover:brightness-110 active:scale-95"
                >
                  Kirim Cargo Sekarang
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
            <h2 className="text-3xl font-black text-[#071712] mb-4">Solusi Barang Besar Anda</h2>
            <p className="text-[#64748b] max-w-2xl mx-auto">
              Kami menangani pengiriman alat berat, furnitur, hingga stok dagangan massal dengan armada yang memadai.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              { 
                icon: Weight, 
                title: "Tanpa Batas Berat", 
                desc: "Tarif yang semakin murah seiring dengan bertambahnya berat dan volume barang kiriman Anda." 
              },
              { 
                icon: Truck, 
                title: "Armada Khusus", 
                desc: "Didukung armada mulai dari pick-up hingga truk besar yang siap menjemput barang di lokasi Anda." 
              },
              { 
                icon: ShieldCheck, 
                title: "Asuransi Kargo", 
                desc: "Perlindungan asuransi komprehensif untuk memastikan barang bernilai tinggi Anda aman di jalan." 
              },
              { 
                icon: Boxes, 
                title: "Bongkar Muat", 
                desc: "Tim profesional kami terlatih untuk menangani proses bongkar muat barang besar dengan aman." 
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
          <h2 className="text-3xl font-black text-[#071712] mb-6">Pindah Rumah atau Pindah Gudang?</h2>
          <p className="text-[#475569] mb-10 text-lg">
            Serahkan urusan logistik berat kepada ahlinya. Kami siap membantu memindahkan aset berharga Anda ke mana saja.
          </p>
          <a
            href={`${appUrl}/orders/new`}
            className="inline-flex rounded-lg bg-[#003d2b] px-8 py-3.5 text-[15px] font-bold text-white shadow-lg transition-all hover:bg-[#00281e] hover:scale-105 active:scale-95"
          >
            Pesan Armada Cargo
          </a>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
