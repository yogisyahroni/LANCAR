'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// Standard React state is used here for form handling.
// Since I'm not sure if react-hook-form is installed in landing-page, I will use controlled components.

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
      const response = await fetch('/api/v1/public/business/api-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Gagal mengirim permintaan API Key.');
      }

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan pada sistem. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pt-24 pb-12 selection:bg-orange-500/30">
      <div className="max-w-3xl mx-auto px-6">
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-500 text-sm font-medium mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            Enterprise API Access
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Minta Akses <span className="text-orange-500">API Key</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Integrasikan sistem logistik Tembus dengan platform bisnis Anda. Isi formulir di bawah ini dan tim kami akan segera meninjau permintaan Anda.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900/50 border border-orange-500/20 rounded-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">Permintaan Berhasil Dikirim!</h3>
              <p className="text-zinc-400 mb-8 max-w-md mx-auto">
                Terima kasih atas ketertarikan Anda. Tim kami akan segera meninjau permintaan Anda dan menghubungi Anda melalui email.
              </p>
              <button
                onClick={() => window.location.href = '/docs'}
                className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
              >
                Pelajari Dokumentasi API
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onSubmit={handleSubmit}
              className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 md:p-8 space-y-6"
            >
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Nama Perusahaan *</label>
                  <input
                    required
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleChange}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder="PT Logistik Nusantara"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Website Perusahaan</label>
                  <input
                    type="url"
                    name="company_website"
                    value={formData.company_website}
                    onChange={handleChange}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Nama Kontak *</label>
                  <input
                    required
                    name="contact_name"
                    value={formData.contact_name}
                    onChange={handleChange}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder="Budi Santoso"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Email Kerja *</label>
                  <input
                    required
                    type="email"
                    name="contact_email"
                    value={formData.contact_email}
                    onChange={handleChange}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder="budi@example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Nomor Telepon/WhatsApp *</label>
                  <input
                    required
                    name="contact_phone"
                    value={formData.contact_phone}
                    onChange={handleChange}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    placeholder="+62 812 3456 7890"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Estimasi Volume Pesanan (Per Bulan)</label>
                  <select
                    name="monthly_volume"
                    value={formData.monthly_volume}
                    onChange={handleChange}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all appearance-none"
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
                <label className="text-sm font-medium text-zinc-300">Kasus Penggunaan (Use Case) *</label>
                <textarea
                  required
                  name="use_case"
                  value={formData.use_case}
                  onChange={handleChange}
                  rows={4}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all resize-none"
                  placeholder="Ceritakan secara singkat bagaimana Anda berencana menggunakan API Tembus..."
                ></textarea>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-orange-500 text-white font-semibold rounded-lg px-6 py-4 hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                <p className="text-zinc-500 text-xs text-center mt-4">
                  Dengan mengirimkan formulir ini, Anda menyetujui Ketentuan Layanan dan Kebijakan Privasi API Tembus.
                </p>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
