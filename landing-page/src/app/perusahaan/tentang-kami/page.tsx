"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import {
  Rocket, ShieldCheck, ThumbsUp, Lightbulb, Heart,
  Clock, Zap, Package, Truck, HandCoins, Building2,
  MapPin, ClipboardList, LayoutDashboard, Users, Code, Bell, History, BarChart3,
  Smartphone, Eye, DollarSign, Cpu, HeadphonesIcon,
  CheckCircle2, Milestone, ArrowRight, Target, User
} from "lucide-react";
import Image from "next/image";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.1 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export default function TentangKamiPage() {
  return (
    <main className="page-shell bg-[#f8fafc]">
      <div className="bg-[#001911]">
        <Header />
      </div>

      {/* ========== HERO ========== */}
      <section className="relative w-full bg-white overflow-hidden">
        <div className="flex flex-col lg:flex-row min-h-[500px]">
          {/* Left Content */}
          <div className="relative w-full lg:w-[50%] flex items-center justify-center p-10 lg:p-20 z-10 bg-white">
            <motion.div {...fadeUp()} className="max-w-xl w-full">
              <h1 className="text-5xl lg:text-7xl font-black text-[#001911] leading-none mb-2">
                COMPANY
              </h1>
              <h1 className="text-5xl lg:text-7xl font-black text-[#ff6908] leading-none mb-8 relative inline-block">
                PROFILE
                <div className="absolute -bottom-4 left-0 w-32 h-1.5 bg-[#001911]"></div>
              </h1>
              <p className="text-lg lg:text-xl text-[#071712] leading-relaxed mt-10 font-medium">
                Tembus hadir sebagai platform logistik berbasis teknologi yang memberikan pengalaman pengiriman yang cepat, aman, dan transparan.
              </p>
            </motion.div>
            
            {/* Diagonal cut effect */}
            <div className="hidden lg:block absolute top-0 bottom-0 right-0 w-48 bg-white skew-x-[-15deg] origin-bottom translate-x-24 z-20"></div>
          </div>
          
          {/* Right Image */}
          <div className="relative w-full lg:w-[50%] h-[400px] lg:h-auto">
            <div className="absolute inset-0 bg-[#001911]">
              <Image
                src="/images/header_tanpahp.webp"
                alt="Tembus Courier Hero"
                fill
                className="object-cover object-center lg:object-left"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ========== TENTANG, VISI & MISI ========== */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="grid gap-8 lg:grid-cols-2">
            <motion.div {...fadeUp()} className="rounded-3xl bg-white p-10 shadow-sm border border-[#e2e8f0]">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eef6ed] text-[#003d2b]">
                <Users className="h-8 w-8" />
              </div>
              <h2 className="mb-6 text-3xl font-black text-[#071712]">Tentang Kami</h2>
              <div className="space-y-4 text-lg text-[#64748b] leading-relaxed">
                <p>
                  Tembus merupakan perusahaan logistik berbasis teknologi yang menghubungkan pelanggan, mitra kurir, dan pelaku bisnis melalui satu platform digital yang sederhana dan mudah digunakan.
                </p>
                <p>
                  Kami percaya bahwa setiap paket membawa kepercayaan, harapan, dan nilai bagi pengirim maupun penerima.
                </p>
              </div>
            </motion.div>

            <div className="space-y-8">
              <motion.div {...fadeUp(0.1)} className="rounded-3xl bg-[#003d2b] p-10 text-white shadow-lg">
                <div className="mb-4 flex items-center gap-4">
                  <Eye className="h-8 w-8 text-[#9bd46f]" />
                  <h3 className="text-2xl font-black">Visi</h3>
                </div>
                <p className="text-lg text-white/90 leading-relaxed">
                  Menjadi platform logistik terpercaya yang memberikan pengalaman pengiriman yang cepat, aman, dan mudah bagi masyarakat Indonesia.
                </p>
              </motion.div>

              <motion.div {...fadeUp(0.2)} className="rounded-3xl bg-[#ff6908] p-10 text-white shadow-lg">
                <div className="mb-4 flex items-center gap-4">
                  <Target className="h-8 w-8 text-white" />
                  <h3 className="text-2xl font-black">Misi</h3>
                </div>
                <ul className="space-y-3 text-lg text-white/90">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-white/60" />
                    <span>Memberikan layanan pengiriman yang mudah diakses.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-white/60" />
                    <span>Menghubungkan pelanggan dengan mitra kurir profesional.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-white/60" />
                    <span>Menghadirkan transparansi pengiriman melalui teknologi.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-white/60" />
                    <span>Mendukung pertumbuhan UMKM dan bisnis.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-white/60" />
                    <span>Terus berinovasi dalam meningkatkan kualitas layanan.</span>
                  </li>
                </ul>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== NILAI PERUSAHAAN ========== */}
      <section className="bg-white py-24 border-y border-[#e2e8f0]">
        <div className="container mx-auto px-6">
          <motion.div {...fadeUp()} className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-black text-[#071712] lg:text-4xl">Nilai Perusahaan</h2>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-5">
            {[
              { icon: Rocket, title: "CEPAT", desc: "Kami terus mengembangkan sistem agar proses pengiriman menjadi lebih efisien." },
              { icon: ShieldCheck, title: "AMAN", desc: "Keamanan paket dan kepercayaan pelanggan menjadi prioritas utama kami." },
              { icon: ThumbsUp, title: "TERPERCAYA", desc: "Kami membangun hubungan jangka panjang melalui pelayanan yang konsisten." },
              { icon: Lightbulb, title: "INOVATIF", desc: "Teknologi menjadi fondasi utama dalam pengembangan layanan Tembus." },
              { icon: Heart, title: "CUSTOMER FIRST", desc: "Setiap keputusan kami berorientasi pada kebutuhan dan kepuasan pelanggan." }
            ].map((item, idx) => (
              <motion.div key={idx} {...fadeUp(0.1 * idx)} className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#f8fafc] text-[#003d2b] shadow-sm border border-[#e2e8f0]">
                  <item.icon className="h-10 w-10" />
                </div>
                <h3 className="mb-3 text-lg font-black text-[#071712]">{item.title}</h3>
                <p className="text-sm text-[#64748b] leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== LAYANAN & TEKNOLOGI ========== */}
      <section className="py-24 bg-[#eef6ed]">
        <div className="container mx-auto px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            
            {/* Layanan */}
            <div>
              <motion.div {...fadeUp()}>
                <h2 className="mb-8 text-3xl font-black text-[#071712]">Layanan Kami</h2>
                <div className="grid gap-6 sm:grid-cols-2">
                  {[
                    { icon: Clock, title: "SAME DAY", desc: "Pengiriman dalam kota dengan estimasi tiba di hari yang sama." },
                    { icon: Zap, title: "INSTANT", desc: "Solusi pengiriman cepat untuk kebutuhan mendesak." },
                    { icon: Package, title: "REGULER", desc: "Pengiriman ekonomis untuk kebutuhan sehari-hari." },
                    { icon: Truck, title: "CARGO", desc: "Pengiriman barang besar maupun volume banyak." },
                    { icon: HandCoins, title: "COD", desc: "Kemudahan pembayaran di tempat bagi penjual dan pembeli." },
                    { icon: Building2, title: "BUSINESS SOLUTION", desc: "Solusi logistik untuk UMKM maupun perusahaan." }
                  ].map((item, idx) => (
                    <div key={idx} className="rounded-2xl bg-white p-6 shadow-sm border border-[#e2e8f0]">
                      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#fff0e6] text-[#ff6908]">
                        <item.icon className="h-6 w-6" />
                      </div>
                      <h3 className="mb-2 text-md font-bold text-[#071712]">{item.title}</h3>
                      <p className="text-sm text-[#64748b] leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Teknologi */}
            <div>
              <motion.div {...fadeUp(0.2)}>
                <h2 className="mb-4 text-3xl font-black text-[#071712]">Teknologi Kami</h2>
                <p className="mb-8 text-lg text-[#64748b]">Tembus dibangun dengan teknologi digital yang mendukung proses pengiriman secara end-to-end.</p>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                  {[
                    { icon: MapPin, title: "Live Tracking" },
                    { icon: ClipboardList, title: "Digital Order Management" },
                    { icon: LayoutDashboard, title: "Dashboard Pengiriman" },
                    { icon: Users, title: "Mitra Kurir Management" },
                    { icon: Code, title: "API Integration untuk bisnis" },
                    { icon: Bell, title: "Notifikasi Status Pengiriman" },
                    { icon: History, title: "Riwayat Pengiriman Digital" },
                    { icon: BarChart3, title: "Analitik Pengiriman" }
                  ].map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm border border-[#e2e8f0] text-[#003d2b]">
                        <item.icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-xs font-bold text-[#071712]">{item.title}</h3>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

          </div>
        </div>
      </section>

      {/* ========== MENGAPA MEMILIH & SOLUSI ========== */}
      <section className="py-24 bg-[#001911] text-white">
        <div className="container mx-auto px-6">
          <motion.div {...fadeUp()} className="mb-16 text-center">
            <h2 className="text-3xl font-black lg:text-4xl">Mengapa Memilih Tembus?</h2>
          </motion.div>
          
          <div className="grid gap-6 md:grid-cols-5 mb-20 border-b border-white/10 pb-20">
            {[
              { icon: Smartphone, title: "PENGIRIMAN MUDAH", desc: "Pemesanan dapat dilakukan secara online tanpa proses yang rumit." },
              { icon: MapPin, title: "TRACKING REAL-TIME", desc: "Status paket dapat dipantau selama proses perjalanan." },
              { icon: DollarSign, title: "HARGA KOMPETITIF", desc: "Tarif transparan sesuai dengan layanan yang dipilih." },
              { icon: Cpu, title: "DUKUNGAN TEKNOLOGI", desc: "Seluruh proses didukung sistem digital untuk meningkatkan efisiensi." },
              { icon: HeadphonesIcon, title: "CUSTOMER SUPPORT", desc: "Tim kami siap membantu kebutuhan informasi terkait pengiriman." }
            ].map((item, idx) => (
              <motion.div key={idx} {...fadeUp(0.1 * idx)} className="text-center px-2 border-r border-white/10 last:border-0">
                <div className="mx-auto mb-4 inline-flex items-center justify-center text-[#9bd46f]">
                  <item.icon className="h-10 w-10" />
                </div>
                <h3 className="mb-3 text-sm font-bold">{item.title}</h3>
                <p className="text-xs text-white/60 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div {...fadeUp()} className="mb-12 text-center">
            <h2 className="text-3xl font-black lg:text-4xl">Solusi Untuk Berbagai Kebutuhan</h2>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            <motion.div {...fadeUp(0.1)} className="rounded-2xl bg-white/5 p-8 border border-white/10">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff6908]">
                  <User className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold">B2C</h3>
              </div>
              <p className="mb-4 text-sm text-white/60">Pengiriman untuk kebutuhan pribadi:</p>
              <ul className="space-y-2 text-sm text-white/80">
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Dokumen</li>
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Makanan</li>
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Fashion</li>
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Elektronik</li>
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Paket harian</li>
              </ul>
            </motion.div>

            <motion.div {...fadeUp(0.2)} className="rounded-2xl bg-white/5 p-8 border border-white/10">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff6908]">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold">B2B</h3>
              </div>
              <p className="mb-4 text-sm text-white/60">Mendukung kebutuhan bisnis seperti:</p>
              <ul className="space-y-2 text-sm text-white/80">
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Distribusi produk</li>
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Fulfillment</li>
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Last Mile Delivery</li>
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Same Day Delivery</li>
                <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[#9bd46f]"></div> Integrasi API</li>
              </ul>
            </motion.div>

            <motion.div {...fadeUp(0.3)} className="rounded-2xl bg-[#003d2b] p-8 border border-[#9bd46f]/30">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#9bd46f]">
                  <Users className="h-6 w-6 text-[#001911]" />
                </div>
                <h3 className="text-xl font-bold">MITRA KURIR</h3>
              </div>
              <p className="text-sm text-white/80 leading-relaxed">
                Bergabung sebagai mitra pengiriman dengan sistem yang fleksibel sesuai perkembangan perusahaan.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========== KOMITMEN & ROADMAP ========== */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="grid gap-16 lg:grid-cols-2">
            
            {/* Komitmen */}
            <motion.div {...fadeUp()}>
              <h2 className="mb-6 text-3xl font-black text-[#071712]">Komitmen Kami</h2>
              <p className="mb-8 text-lg text-[#64748b]">Sebagai perusahaan yang sedang bertumbuh, Tembus berkomitmen untuk:</p>
              <ul className="space-y-4">
                {[
                  "Mengembangkan teknologi logistik Indonesia.",
                  "Memberikan pengalaman pengiriman yang transparan.",
                  "Menjaga kualitas pelayanan secara konsisten.",
                  "Berkolaborasi dengan UMKM dan pelaku bisnis lokal.",
                  "Membangun ekosistem logistik yang berkelanjutan."
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-4 rounded-xl bg-[#f8fafc] p-4 border border-[#e2e8f0]">
                    <CheckCircle2 className="h-6 w-6 text-[#ff6908] shrink-0" />
                    <span className="font-bold text-[#071712]">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Roadmap */}
            <motion.div {...fadeUp(0.2)}>
              <h2 className="mb-10 text-3xl font-black text-[#071712]">Roadmap Pengembangan</h2>
              
              <div className="relative pl-8">
                {/* Vertical Line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-[#e2e8f0]"></div>

                <div className="space-y-10">
                  <div className="relative">
                    <div className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full bg-[#003d2b] text-white ring-4 ring-white">
                      <Rocket className="h-3.5 w-3.5" />
                    </div>
                    <div className="mb-1 font-black text-[#003d2b]">FASE 1 (2026)</div>
                    <ul className="list-disc pl-4 text-sm text-[#64748b] space-y-1">
                      <li>Platform Mobile Apps</li>
                      <li>Tracking Real-Time</li>
                      <li>Same Day Delivery</li>
                      <li>Instant Delivery</li>
                      <li>Dashboard Bisnis</li>
                      <li>Pulau Jawa</li>
                    </ul>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full bg-[#ff6908] text-white ring-4 ring-white">
                      <BarChart3 className="h-3.5 w-3.5" />
                    </div>
                    <div className="mb-1 font-black text-[#ff6908]">FASE 2 (2027)</div>
                    <ul className="list-disc pl-4 text-sm text-[#64748b] space-y-1">
                      <li>Mitra Agen</li>
                      <li>COD</li>
                      <li>Nasional</li>
                    </ul>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full bg-[#e2e8f0] text-[#64748b] ring-4 ring-white">
                      <Target className="h-3.5 w-3.5" />
                    </div>
                    <div className="mb-1 font-black text-[#071712]">FASE 3 (2028+)</div>
                    <ul className="list-disc pl-4 text-sm text-[#64748b] space-y-1">
                      <li>Smart Routing</li>
                      <li>AI Dispatch System</li>
                      <li>Warehouse Integration</li>
                      <li>Enterprise Solution</li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}


