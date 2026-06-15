"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { MapPin, Phone, Mail, Clock, MessageSquare, ArrowRight } from "lucide-react";
import Link from "next/link";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5, delay }
  };
}

export default function ContactPage() {
  const contactMethods = [
    {
      icon: Phone,
      title: "Telepon",
      desc: "Hubungi kami untuk layanan pelanggan yang cepat.",
      value: "+62 012-3456-7890",
      link: "tel:+6281234567890",
      action: "Hubungi Sekarang"
    },
    {
      icon: MessageSquare,
      title: "WhatsApp",
      desc: "Kirim pesan langsung ke tim bantuan kami.",
      value: "+62 012-3456-7890",
      link: "https://wa.me/6281234567890",
      action: "Chat via WhatsApp"
    },
    {
      icon: Mail,
      title: "Email",
      desc: "Kirimkan pertanyaan atau proposal bisnis Anda.",
      value: "hello@tembus.id",
      link: "mailto:hello@tembus.id",
      action: "Kirim Email"
    }
  ];

  return (
    <main className="page-shell bg-zinc-50 min-h-screen">
      <Header isTransparent={false} />
      
      {/* Hero Section */}
      <section className="bg-[#001911] text-white py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1 {...fadeUp(0)} className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            Hubungi <span className="text-[#7bc043]">Kami</span>
          </motion.h1>
          <motion.p {...fadeUp(0.1)} className="text-lg text-white/80 max-w-2xl mx-auto leading-relaxed">
            Punya pertanyaan seputar layanan pengiriman kami? Tim dukungan kami selalu siap membantu memberikan solusi terbaik untuk Anda.
          </motion.p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {contactMethods.map((method, idx) => (
            <motion.a
              key={method.title}
              href={method.link}
              target={method.icon === MessageSquare ? "_blank" : undefined}
              rel={method.icon === MessageSquare ? "noopener noreferrer" : undefined}
              {...fadeUp(idx * 0.1)}
              className="group bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm hover:shadow-xl hover:border-[#7bc043]/30 transition-all cursor-pointer flex flex-col items-center text-center h-full"
            >
              <div className="w-16 h-16 bg-[#eef6ed] rounded-full flex items-center justify-center text-[#7bc043] mb-6 group-hover:scale-110 transition-transform">
                <method.icon size={32} />
              </div>
              <h3 className="text-2xl font-black text-zinc-900 mb-2">{method.title}</h3>
              <p className="text-zinc-500 mb-6 flex-grow">{method.desc}</p>
              
              <div className="mt-auto w-full pt-6 border-t border-zinc-100 flex flex-col items-center gap-3">
                <span className="text-lg font-bold text-[#071712]">{method.value}</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#7bc043]">
                  {method.action} <ArrowRight size={16} />
                </span>
              </div>
            </motion.a>
          ))}
        </div>

        {/* Office Address Card */}
        <motion.div {...fadeUp(0.3)} className="bg-white rounded-3xl overflow-hidden border border-zinc-200 shadow-sm">
          <div className="grid md:grid-cols-2">
            <div className="p-8 md:p-12 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-[#eef6ed] rounded-2xl flex items-center justify-center text-[#7bc043]">
                  <MapPin size={24} />
                </div>
                <h2 className="text-3xl font-black text-zinc-900">Kantor Pusat</h2>
              </div>
              
              <div className="space-y-6 text-zinc-600 leading-relaxed">
                <p>
                  <strong>PT TEMBUS LINTAS TEKNOLOGI</strong><br />
                  Gedung Tembus Tower, Lantai 12<br />
                  Jl. Jend. Sudirman No.Kav 10-11, Karet Tengsin, Tanah Abang<br />
                  Jakarta Pusat, DKI Jakarta 10220<br />
                  Indonesia
                </p>
                
                <div className="pt-6 border-t border-zinc-100 flex items-start gap-3">
                  <Clock className="text-[#7bc043] shrink-0 mt-1" size={20} />
                  <div>
                    <strong className="block text-zinc-900 mb-1">Jam Operasional Kantor</strong>
                    Senin - Jumat: 08:00 - 17:00 WIB<br />
                    Sabtu: 08:00 - 14:00 WIB<br />
                    Minggu & Libur Nasional: Tutup
                  </div>
                </div>
              </div>
              
              <div className="mt-8">
                <a 
                  href="https://maps.google.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#072a20] text-white rounded-xl font-bold hover:bg-[#003d2b] transition-colors"
                >
                  Lihat di Google Maps
                </a>
              </div>
            </div>
            
            {/* Map Placeholder or Visuals */}
            <div className="bg-zinc-100 relative min-h-[300px] md:min-h-full">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#003d2b]/20 to-[#7bc043]/10" />
              <img 
                src="https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop" 
                alt="Kantor Pusat Tembus" 
                className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-50"
              />
            </div>
          </div>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
