"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5, delay }
  };
}

export default function SyaratDanKetentuanPage() {
  return (
    <main className="page-shell bg-zinc-50 min-h-screen">
      <Header isTransparent={false} />
      
      {/* Hero Section */}
      <section className="bg-[#001911] text-white py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1 {...fadeUp(0)} className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            Syarat & <span className="text-[#7bc043]">Ketentuan</span>
          </motion.h1>
          <motion.p {...fadeUp(0.1)} className="text-lg text-white/80 max-w-2xl mx-auto">
            Syarat dan ketentuan penggunaan layanan PT TEMBUS LINTAS TEKNOLOGI.
            Terakhir diperbarui: 15 Juni 2026.
          </motion.p>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24 max-w-4xl mx-auto">
        <motion.div {...fadeUp(0.2)} className="bg-white p-8 md:p-12 rounded-[32px] border border-zinc-200 shadow-sm prose prose-lg max-w-none text-zinc-700">
          <h2 className="text-2xl font-black text-zinc-900 mb-4">1. Penerimaan Syarat & Ketentuan</h2>
          <p>
            Dengan menggunakan situs web dan layanan aplikasi dari PT TEMBUS LINTAS TEKNOLOGI ("Tembus", "kami", "milik kami"), Anda ("Pengguna", "Anda") menyetujui untuk terikat oleh syarat dan ketentuan ini. Jika Anda tidak setuju dengan bagian apa pun dari persyaratan ini, Anda tidak diperkenankan menggunakan layanan kami.
          </p>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">2. Layanan Pengiriman</h2>
          <p>
            Tembus menyediakan layanan platform logistik dan pengiriman. Waktu pengiriman yang dijanjikan (seperti Same Day, Instant, atau Reguler) adalah estimasi dan dapat dipengaruhi oleh faktor eksternal di luar kendali kami seperti cuaca, kemacetan, atau kondisi force majeure lainnya.
          </p>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">3. Barang yang Dilarang</h2>
          <p>Pengguna dilarang mengirimkan barang-barang berikut melalui layanan Tembus:</p>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li>Narkotika, obat-obatan terlarang, dan zat adiktif lainnya.</li>
            <li>Senjata api, senjata tajam, bahan peledak, dan barang berbahaya mudah terbakar.</li>
            <li>Barang-barang curian atau barang hasil tindak kejahatan.</li>
            <li>Uang tunai dalam jumlah besar, logam mulia tanpa perlindungan asuransi khusus.</li>
            <li>Hewan peliharaan atau makhluk hidup (kecuali melalui layanan khusus yang disetujui).</li>
          </ul>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">4. Asuransi dan Klaim</h2>
          <p>
            Tembus memberikan asuransi dasar untuk setiap pengiriman. Nilai pertanggungan maksimal asuransi dasar adalah 10x biaya pengiriman atau nilai barang mana yang lebih rendah (maksimal Rp 1.000.000). Untuk barang dengan nilai di atas batas tersebut, Pengguna sangat disarankan untuk membeli asuransi tambahan. Klaim harus diajukan maksimal 2x24 jam setelah status barang diterima.
          </p>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">5. Kewajiban Pengguna</h2>
          <p>Pengguna bertanggung jawab untuk:</p>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li>Memberikan informasi alamat penjemputan dan pengiriman yang lengkap, akurat, dan jelas.</li>
            <li>Mengemas barang dengan aman dan memadai agar tidak rusak selama perjalanan.</li>
            <li>Membayar biaya layanan sesuai dengan tarif yang berlaku pada saat transaksi.</li>
          </ul>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">6. Perubahan Syarat dan Ketentuan</h2>
          <p>
            Tembus berhak untuk memperbarui atau mengubah Syarat & Ketentuan ini kapan saja tanpa pemberitahuan sebelumnya. Penggunaan berkelanjutan atas layanan kami setelah perubahan tersebut merupakan persetujuan Anda terhadap Syarat & Ketentuan yang baru.
          </p>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
