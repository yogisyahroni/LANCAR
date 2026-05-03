"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrisString: string;
  amount: number;
  onSuccess: () => void;
}

export function PaymentModal({ isOpen, onClose, qrisString, amount, onSuccess }: PaymentModalProps) {
  const [timeLeft, setTimeLeft] = useState(900); // 15 mins

  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose(); // auto close when expired
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, onClose]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-background/95 p-6 sm:p-8 shadow-2xl backdrop-blur-md"
          >
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Selesaikan Pembayaran</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Scan QRIS di bawah ini menggunakan aplikasi e-wallet atau m-banking Anda.
              </p>
              
              <div className="my-8 flex justify-center rounded-xl bg-white p-4">
                <QRCodeSVG value={qrisString} size={200} />
              </div>

              <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Tagihan</span>
                  <span className="font-bold text-foreground">
                    Rp {amount.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Batas Waktu</span>
                  <span className="font-mono font-medium text-destructive">
                    {formatTime(timeLeft)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={onSuccess}
                  className="w-full rounded-lg bg-emerald-500/10 py-3 text-sm font-semibold text-emerald-500 transition-all hover:bg-emerald-500/20 active:scale-[0.98]"
                >
                  [DEV] Simulasikan Pembayaran Sukses
                </button>
                <button
                  onClick={onClose}
                  className="w-full rounded-lg bg-white/5 py-3 text-sm font-semibold text-foreground transition-all hover:bg-white/10 active:scale-[0.98]"
                >
                  Tutup
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
