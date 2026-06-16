'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Upload, X, Loader2, FileImage } from 'lucide-react';
import { api } from '@/lib/api';

interface DisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  onSuccess: () => void;
}

export function DisputeModal({ isOpen, onClose, orderId, onSuccess }: DisputeModalProps) {
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLostItem = category === 'Barang Hilang';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!category) {
      setError('Silakan pilih kategori masalah.');
      return;
    }
    if (!description.trim()) {
      setError('Silakan berikan penjelasan masalah.');
      return;
    }
    if (isLostItem && !file) {
      setError('Klaim Barang Hilang memerlukan bukti Invoice/Struk atau Foto Barang.');
      return;
    }
    if (!agreed) {
      setError('Anda harus menyetujui Syarat dan Ketentuan.');
      return;
    }

    setLoading(true);
    try {
      let evidenceUrls: string[] = [];

      // 1. Upload evidence if file exists
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await api.post(`/auth/web/orders/${orderId}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (uploadRes.data?.url) {
          evidenceUrls.push(uploadRes.data.url);
        }
      }

      // 2. Submit Dispute
      await api.post('/auth/web/disputes', {
        order_id: orderId,
        category,
        description,
        evidence_urls: evidenceUrls,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Terjadi kesalahan saat mengirim laporan.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-card p-6 shadow-2xl"
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-full bg-red-500/20 p-2.5 text-red-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Laporkan Masalah</h2>
              <p className="text-sm text-muted-foreground">Kirimkan detail kendala pada pesanan ini.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Kategori Masalah</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-background/50 p-3 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="" disabled>Pilih kategori...</option>
                <option value="Barang Rusak">Barang Rusak</option>
                <option value="Barang Hilang">Barang Hilang</option>
                <option value="Keterlambatan">Keterlambatan Pengiriman</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">Penjelasan Detail</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ceritakan kronologi masalah secara jelas..."
                className="min-h-[100px] w-full resize-none rounded-xl border border-white/10 bg-background/50 p-3 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-white">
                Upload Bukti {isLostItem && <span className="text-red-400">*</span>}
              </label>
              <p className="text-xs text-muted-foreground">
                {isLostItem
                  ? "Wajib upload foto Invoice/Struk pembelian asli atau screenshot e-commerce. Untuk pengiriman personal, upload foto fisik barang sebelum dikirim."
                  : "Upload foto kondisi paket, resi, atau bukti lainnya."}
              </p>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/5 p-4 transition hover:bg-white/10"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0]);
                    }
                  }}
                />
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  {file ? (
                    <>
                      <FileImage className="h-8 w-8 text-primary" />
                      <p className="text-sm font-medium text-white">{file.name}</p>
                      <p className="text-xs text-muted-foreground">Klik untuk mengganti foto</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition" />
                      <p className="text-sm font-medium text-white">Pilih Foto Bukti</p>
                      <p className="text-xs text-muted-foreground">Maksimal 5MB (JPG/PNG)</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <input
                type="checkbox"
                id="tnc-agreed"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-background accent-primary"
              />
              <label htmlFor="tnc-agreed" className="text-xs leading-relaxed text-muted-foreground">
                Saya menyatakan detail ini benar. Jika kategori adalah <strong>Barang Hilang tanpa asuransi tambahan</strong>, saya setuju ganti rugi maksimal mengikuti nilai barang pada Invoice ATAU maksimal 10x Ongkos Kirim (mana yang lebih rendah). Untuk barang C2C tanpa invoice, wajib menyertakan foto fisik awal atau nilai barang disesuaikan.
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-red-500 hover:bg-red-600 px-6 py-2 text-sm font-medium text-white transition shadow-lg disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Kirim Laporan
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
