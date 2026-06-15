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

  const caseStudies = [
    {
      company: "PT Maju Bersama (E-Commerce)",
      logo: "MB",
      metric: "+45%",
      metricLabel: "Peningkatan Kecepatan Pengiriman",
      problem: "Sistem logistik lama sering mengalami keterlambatan pengiriman saat event harbolnas, menyebabkan komplain pelanggan yang tinggi.",
      solution: "Integrasi API Tembus untuk otomasi resi dan alokasi armada Same Day yang didedikasikan khusus di gudang utama mereka.",
      result: "Komplain keterlambatan turun drastis hingga 90%, dan kepuasan pelanggan mencapai rekor tertinggi di kuartal berikutnya."
    },
    {
      company: "Segar Alam (F&B Distributor)",
      logo: "SA",
      metric: "-30%",
      metricLabel: "Penurunan Biaya Operasional",
      problem: "Biaya logistik membengkak karena ketidakefisienan rute pengiriman bahan baku segar ke ratusan cabang restoran setiap pagi.",
      solution: "Mengadopsi Tembus Enterprise dengan sistem routing cerdas dan penjadwalan armada Cargo berpendingin secara presisi.",
      result: "Bahan baku selalu tiba tepat waktu dalam kondisi segar, dan biaya bahan bakar armada berkurang signifikan."
    },
    {
      company: "Nusantara Manufaktur",
      logo: "NM",
      metric: "100%",
      metricLabel: "Visibilitas Rantai Pasok",
      problem: "Kehilangan jejak pengiriman antar pabrik dan distributor karena sistem pelacakan pihak ketiga yang tidak sinkron dengan ERP perusahaan.",
      solution: "Penerapan Solusi Logistik Tembus dengan dashboard analitik kustom dan notifikasi Webhook real-time ke sistem ERP lokal.",
      result: "Tim manajemen kini memiliki kendali penuh atas pergerakan aset bernilai tinggi kapan pun dan di mana pun."
    }
  ];

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

      {/* ========== CASE STUDIES ========== */}
      <section className="py-20 lg:py-28 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
        <div className="max-w-5xl mx-auto space-y-12">
          {caseStudies.map((study, i) => (
            <motion.div 
              key={i} 
              {...fadeUp(0.1 * i)} 
              className="bg-white rounded-3xl shadow-sm border border-[#e2e8f0] overflow-hidden flex flex-col md:flex-row group hover:shadow-md transition-shadow"
            >
              {/* Highlight Metric Column */}
              <div className="bg-[#003d2b] text-white p-8 md:p-10 md:w-1/3 flex flex-col justify-center items-center text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <TrendingUp className="w-24 h-24" />
                </div>
                <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-2xl font-black mb-6 relative z-10">
                  {study.logo}
                </div>
                <h3 className="text-5xl font-black text-[#9bd46f] mb-2 relative z-10">{study.metric}</h3>
                <p className="text-white/80 font-medium relative z-10">{study.metricLabel}</p>
              </div>

              {/* Detail Column */}
              <div className="p-8 md:p-10 md:w-2/3 space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-[#071712] mb-1">{study.company}</h3>
                </div>
                
                <div className="grid sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <div>
                    <h4 className="text-sm font-bold text-red-500 uppercase tracking-wider mb-2">Tantangan</h4>
                    <p className="text-[#64748b] text-sm leading-relaxed">{study.problem}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#003d2b] uppercase tracking-wider mb-2">Solusi Tembus</h4>
                    <p className="text-[#64748b] text-sm leading-relaxed">{study.solution}</p>
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flex gap-4 items-start bg-[#eef6ed] p-4 rounded-xl border border-[#9bd46f]/30">
                    <Quote className="w-6 h-6 text-[#9bd46f] shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-[#071712] uppercase tracking-wider mb-1">Hasil</h4>
                      <p className="text-[#003d2b] font-medium leading-relaxed">{study.result}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
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
