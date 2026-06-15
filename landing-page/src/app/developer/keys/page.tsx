"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export default function RequestApiKeyPage() {
  const [formData, setFormData] = useState({
    company_name: '',
    company_website: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    monthly_volume: '',
    use_case: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
      
      const response = await fetch(`${apiUrl}/public/business/api-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Terjadi kesalahan pada sistem. Silakan coba lagi.');
      }

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan pada sistem. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell bg-[#f8fafc]">
      {/* Navbar with solid background to match the style */}
      <div className="bg-[#001911]">
        <Header />
      </div>

      <section className="py-20 px-6 sm:px-10 lg:px-16 max-w-4xl mx-auto min-h-[calc(100vh-300px)]">
        <motion.div {...fadeUp()} className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff6908]/10 border border-[#ff6908]/20 text-[#ff6908] text-sm font-semibold mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff6908] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff6908]"></span>
            </span>
            Enterprise API Access
          </div>
          <h1 className="text-3xl md:text-4xl font-black mb-4 text-[#071712]">
            Minta Akses <span className="text-[#0b6b45]">API Key</span>
          </h1>
          <p className="text-[#64748b] text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            Integrasikan sistem logistik Tembus dengan platform bisnis Anda. Isi formulir di bawah ini dan tim kami akan segera meninjau permintaan Anda.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-8 text-center shadow-lg border border-[#e2e8f0]"
            >
              <div className="w-16 h-16 bg-[#eef6ed] rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-[#0b6b45]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-2 text-[#071712]">Permintaan Berhasil Dikirim!</h3>
              <p className="text-[#64748b] mb-8 max-w-md mx-auto text-[15px] leading-relaxed">
                Terima kasih atas ketertarikan Anda. Tim kami akan segera meninjau permintaan Anda dan menghubungi Anda melalui email.
              </p>
              <a
                href="/docs"
                className="cta-primary px-8 py-3.5 text-[15px]"
              >
                Pelajari Dokumentasi API
              </a>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl p-6 md:p-10 space-y-6 shadow-sm border border-[#e2e8f0]"
            >
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm font-medium">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#071712]">Nama Perusahaan *</label>
                  <input
                    required
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleChange}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3 text-[#071712] focus:outline-none focus:border-[#0b6b45] focus:ring-1 focus:ring-[#0b6b45] transition-all"
                    placeholder="PT Logistik Nusantara"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#071712]">Website Perusahaan</label>
                  <input
                    type="url"
                    name="company_website"
                    value={formData.company_website}
                    onChange={handleChange}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3 text-[#071712] focus:outline-none focus:border-[#0b6b45] focus:ring-1 focus:ring-[#0b6b45] transition-all"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#071712]">Nama Kontak *</label>
                  <input
                    required
                    name="contact_name"
                    value={formData.contact_name}
                    onChange={handleChange}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3 text-[#071712] focus:outline-none focus:border-[#0b6b45] focus:ring-1 focus:ring-[#0b6b45] transition-all"
                    placeholder="Budi Santoso"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#071712]">Email Kerja *</label>
                  <input
                    required
                    type="email"
                    name="contact_email"
                    value={formData.contact_email}
                    onChange={handleChange}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3 text-[#071712] focus:outline-none focus:border-[#0b6b45] focus:ring-1 focus:ring-[#0b6b45] transition-all"
                    placeholder="budi@example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#071712]">Nomor Telepon/WhatsApp *</label>
                  <input
                    required
                    name="contact_phone"
                    value={formData.contact_phone}
                    onChange={handleChange}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3 text-[#071712] focus:outline-none focus:border-[#0b6b45] focus:ring-1 focus:ring-[#0b6b45] transition-all"
                    placeholder="+62 812 3456 7890"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#071712]">Estimasi Volume Pesanan (Per Bulan)</label>
                  <select
                    name="monthly_volume"
                    value={formData.monthly_volume}
                    onChange={handleChange}
                    className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3 text-[#071712] focus:outline-none focus:border-[#0b6b45] focus:ring-1 focus:ring-[#0b6b45] transition-all appearance-none"
                  >
                    <option value="">Pilih Volume</option>
                    <option value="1-100">1 - 100 pesanan</option>
                    <option value="101-1000">101 - 1,000 pesanan</option>
                    <option value="1001-10000">1,001 - 10,000 pesanan</option>
                    <option value="10000+">&gt; 10,000 pesanan</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-[#071712]">Kasus Penggunaan (Use Case) *</label>
                <textarea
                  required
                  name="use_case"
                  value={formData.use_case}
                  onChange={handleChange}
                  rows={4}
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3 text-[#071712] focus:outline-none focus:border-[#0b6b45] focus:ring-1 focus:ring-[#0b6b45] transition-all resize-none"
                  placeholder="Ceritakan secara singkat bagaimana Anda berencana menggunakan API Tembus..."
                ></textarea>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full cta-primary px-6 py-4 text-[15px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      Mengirim...
                    </>
                  ) : (
                    'Kirim Permintaan'
                  )}
                </button>
                <p className="text-[#64748b] text-xs text-center mt-4">
                  Dengan mengirimkan formulir ini, Anda menyetujui Ketentuan Layanan dan Kebijakan Privasi API Tembus.
                </p>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </section>

      <Footer />
    </main>
  );
}
