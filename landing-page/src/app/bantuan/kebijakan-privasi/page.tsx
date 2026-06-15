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

export default function KebijakanPrivasiPage() {
  return (
    <main className="page-shell bg-zinc-50 min-h-screen">
      <Header isTransparent={false} />
      
      {/* Hero Section */}
      <section className="bg-[#001911] text-white py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1 {...fadeUp(0)} className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            Kebijakan <span className="text-[#7bc043]">Privasi</span>
          </motion.h1>
          <motion.p {...fadeUp(0.1)} className="text-lg text-white/80 max-w-2xl mx-auto">
            Komitmen kami untuk melindungi data pribadi dan privasi Anda.
            Terakhir diperbarui: 15 Juni 2026.
          </motion.p>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24 max-w-4xl mx-auto">
        <motion.div {...fadeUp(0.2)} className="bg-white p-8 md:p-12 rounded-[32px] border border-zinc-200 shadow-sm prose prose-lg max-w-none text-zinc-700">
          <p className="lead font-semibold text-zinc-900">
            PT TEMBUS LINTAS TEKNOLOGI ("Tembus", "kami", "milik kami") menghormati privasi Anda dan berkomitmen untuk melindungi data pribadi yang Anda bagikan kepada kami. Kebijakan Privasi ini menjelaskan bagaimana kami mengumpulkan, menggunakan, mengungkapkan, dan menjaga informasi Anda ketika Anda mengunjungi situs web atau menggunakan aplikasi kami.
          </p>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">1. Data yang Kami Kumpulkan</h2>
          <p>Kami dapat mengumpulkan informasi pribadi yang mengidentifikasi Anda secara langsung, seperti:</p>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li><strong>Informasi Kontak:</strong> Nama lengkap, alamat email, nomor telepon seluler.</li>
            <li><strong>Informasi Lokasi:</strong> Alamat pengiriman, alamat penjemputan, dan data geolokasi perangkat secara *real-time* saat menggunakan aplikasi untuk keperluan pelacakan kurir.</li>
            <li><strong>Informasi Transaksi:</strong> Rincian pesanan pengiriman, riwayat transaksi, dan detail asuransi.</li>
            <li><strong>Data Perangkat:</strong> Alamat IP, jenis browser, sistem operasi, dan pengenal perangkat keras.</li>
          </ul>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">2. Bagaimana Kami Menggunakan Data Anda</h2>
          <p>Informasi yang kami kumpulkan digunakan untuk tujuan berikut:</p>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li>Memfasilitasi layanan pengiriman barang yang Anda pesan dari penjemputan hingga penerimaan.</li>
            <li>Memproses pembayaran dan klaim asuransi barang.</li>
            <li>Memberikan pembaruan pelacakan (tracking) status pengiriman melalui SMS, email, atau notifikasi push.</li>
            <li>Meningkatkan kualitas layanan, aplikasi, dan situs web melalui analisis data (analytics).</li>
            <li>Mencegah penipuan (fraud) dan menjaga keamanan sistem kami.</li>
          </ul>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">3. Pembagian Data</h2>
          <p>
            Tembus <strong>tidak akan menjual</strong> informasi pribadi Anda kepada pihak ketiga. Kami hanya membagikan data Anda dengan:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li><strong>Mitra Kurir:</strong> Untuk tujuan penyelesaian pengiriman (nama, nomor telepon penerima, dan alamat pengiriman).</li>
            <li><strong>Penyedia Layanan:</strong> Pihak ketiga yang membantu kami mengoperasikan bisnis, seperti gerbang pembayaran (payment gateway) dan layanan cloud storage.</li>
            <li><strong>Pihak Berwenang:</strong> Jika diwajibkan oleh hukum, proses peradilan, atau permintaan instansi pemerintah yang sah di Indonesia.</li>
          </ul>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">4. Keamanan Data</h2>
          <p>
            Kami mengimplementasikan langkah-langkah keamanan teknis dan organisasional yang terdepan di industri, termasuk enkripsi (SSL/TLS), *firewalls*, dan kontrol akses ketat pada tingkat database untuk melindungi data pribadi Anda dari akses tidak sah, kehilangan, atau pengubahan.
          </p>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">5. Hak Anda (Sesuai UU PDP)</h2>
          <p>Sesuai dengan Undang-Undang Pelindungan Data Pribadi (UU PDP) Indonesia, Anda memiliki hak untuk:</p>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li>Meminta akses ke data pribadi yang kami simpan tentang Anda.</li>
            <li>Meminta koreksi atau pembaruan atas data yang tidak akurat.</li>
            <li>Meminta penghapusan data Anda dari sistem kami (kecuali kami memiliki dasar hukum yang sah untuk menahannya seperti bukti transaksi keuangan).</li>
          </ul>

          <h2 className="text-2xl font-black text-zinc-900 mt-8 mb-4">6. Hubungi Kami</h2>
          <p>
            Jika Anda memiliki pertanyaan, kekhawatiran, atau keluhan terkait Kebijakan Privasi ini, silakan hubungi Data Protection Officer kami melalui email di <strong>privacy@tembus.id</strong> atau melalui Pusat Bantuan di aplikasi Tembus.
          </p>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
