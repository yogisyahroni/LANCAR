"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Search, ChevronDown, Package, ShieldCheck, MapPin, CreditCard } from "lucide-react";
import { useState } from "react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5, delay }
  };
}

const faqs = [
  {
    category: "Pengiriman",
    icon: Package,
    questions: [
      { q: "Bagaimana cara melacak paket saya?", a: "Anda dapat memasukkan nomor resi pada kolom pelacakan di halaman utama atau pada halaman Resi kami." },
      { q: "Berapa lama estimasi pengiriman reguler?", a: "Pengiriman reguler biasanya memakan waktu 2-3 hari kerja untuk area pulau Jawa, dan 3-7 hari kerja untuk luar pulau Jawa." },
      { q: "Apakah saya bisa mengubah alamat pengiriman?", a: "Alamat pengiriman tidak dapat diubah setelah paket diserahkan ke kurir. Namun, jika paket masih di tahap persiapan, Anda dapat menghubungi CS kami." }
    ]
  },
  {
    category: "Keamanan & Asuransi",
    icon: ShieldCheck,
    questions: [
      { q: "Apakah barang saya diasuransikan?", a: "Ya, setiap pengiriman Tembus dilengkapi dengan asuransi dasar. Untuk barang bernilai tinggi, kami sarankan menggunakan asuransi tambahan." },
      { q: "Bagaimana jika barang saya rusak atau hilang?", a: "Silakan ajukan komplain melalui menu Pusat Bantuan maksimal 2x24 jam sejak status barang diterima dengan menyertakan video unboxing." }
    ]
  },
  {
    category: "Pembayaran",
    icon: CreditCard,
    questions: [
      { q: "Metode pembayaran apa saja yang diterima?", a: "Kami menerima metode pembayaran Transfer Bank, Virtual Account, E-Wallet (GoPay, OVO, Dana), dan layanan COD untuk area tertentu." },
      { q: "Apakah biaya pengiriman sudah termasuk asuransi?", a: "Biaya pengiriman standar hanya mencakup asuransi dasar. Asuransi tambahan akan dikenakan biaya ekstra sebesar 0.2% dari nilai barang." }
    ]
  }
];

export default function PusatBantuanPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const toggleAccordion = (id: string) => {
    setOpenIndex(openIndex === id ? null : id);
  };

  return (
    <main className="page-shell bg-zinc-50 min-h-screen">
      <Header isTransparent={false} />
      
      {/* Hero Section */}
      <section className="bg-[#001911] text-white py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1 {...fadeUp(0)} className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            Pusat <span className="text-[#7bc043]">Bantuan</span>
          </motion.h1>
          <motion.p {...fadeUp(0.1)} className="text-lg text-white/80 max-w-2xl mx-auto mb-10">
            Ada yang bisa kami bantu? Temukan jawaban untuk pertanyaan-pertanyaan seputar layanan Tembus di sini.
          </motion.p>
          
          <motion.div {...fadeUp(0.2)} className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input 
              type="text" 
              placeholder="Cari pertanyaan... (contoh: cara cek resi)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white text-zinc-900 border-none rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#7bc043] shadow-lg"
            />
          </motion.div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24 max-w-4xl mx-auto">
        {faqs.map((cat, catIdx) => {
          const filteredQs = cat.questions.filter(q => 
            q.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
            q.a.toLowerCase().includes(searchQuery.toLowerCase())
          );

          if (filteredQs.length === 0) return null;

          return (
            <motion.div {...fadeUp(catIdx * 0.1)} key={cat.category} className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-[#eef6ed] rounded-xl flex items-center justify-center text-[#7bc043]">
                  <cat.icon size={20} />
                </div>
                <h2 className="text-2xl font-black text-zinc-900">{cat.category}</h2>
              </div>
              
              <div className="space-y-4">
                {filteredQs.map((item, qIdx) => {
                  const id = `${catIdx}-${qIdx}`;
                  const isOpen = openIndex === id;
                  return (
                    <div 
                      key={id} 
                      className={`bg-white border rounded-2xl overflow-hidden transition-all duration-300 ${isOpen ? 'border-[#7bc043]/50 shadow-md' : 'border-zinc-200 shadow-sm hover:border-zinc-300'}`}
                    >
                      <button 
                        onClick={() => toggleAccordion(id)}
                        className="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
                      >
                        <span className="font-bold text-zinc-900 pr-8">{item.q}</span>
                        <ChevronDown 
                          size={20} 
                          className={`text-zinc-400 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#7bc043]' : ''}`} 
                        />
                      </button>
                      <div 
                        className={`px-6 text-zinc-600 leading-relaxed overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-48 pb-5 opacity-100' : 'max-h-0 opacity-0'}`}
                      >
                        {item.a}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </section>

      <Footer />
    </main>
  );
}
