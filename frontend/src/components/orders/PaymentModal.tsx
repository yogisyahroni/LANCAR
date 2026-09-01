"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";

declare global {
  interface Window {
    snap?: any;
  }
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string;
  snapToken: string;
  snapJsUrl: string;
  clientKey: string;
  redirectUrl?: string;
  amount: number;
  onSuccess: () => void;
}

type PaymentState = "idle" | "loading_snap" | "opened" | "pending" | "paid" | "error";

export function PaymentModal({
  isOpen,
  onClose,
  orderId,
  snapToken,
  snapJsUrl,
  clientKey,
  redirectUrl,
  amount,
  onSuccess
}: PaymentModalProps) {
  const [state, setState] = useState<PaymentState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [snapReady, setSnapReady] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setState("loading_snap");
    setMessage(null);

    if (window.snap) {
      setSnapReady(true);
      setState("idle");
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-tembus-midtrans-snap="true"]');
    if (existing) {
      existing.addEventListener('load', () => {
        setSnapReady(true);
        setState("idle");
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = snapJsUrl || "https://app.sandbox.midtrans.com/snap/snap.js";
    script.async = true;
    script.setAttribute("data-client-key", clientKey || "");
    script.setAttribute("data-tembus-midtrans-snap", "true");
    script.onload = () => {
      setSnapReady(true);
      setState("idle");
    };
    script.onerror = () => {
      setState("error");
      setMessage("Gagal memuat Midtrans Snap. Periksa koneksi atau client key.");
    };
    document.head.appendChild(script);
  }, [isOpen, snapJsUrl, clientKey]);

  const confirmPaid = async () => {
    if (orderId) {
      await api.post(`/auth/web/orders/${orderId}/payment/check`).catch(() => null);
    }
    setState("paid");
    window.setTimeout(onSuccess, 700);
  };

  const openSnap = () => {
    if (!snapToken) {
      setState("error");
      setMessage("Snap token tidak tersedia. Pastikan MIDTRANS_SERVER_KEY sudah diisi.");
      return;
    }
    if (!window.snap || !snapReady) {
      setState("error");
      setMessage("Midtrans Snap belum siap. Coba lagi beberapa detik.");
      return;
    }

    setState("opened");
    window.snap.pay(snapToken, {
      onSuccess: () => {
        void confirmPaid();
      },
      onPending: () => {
        setState("pending");
        setMessage("Pembayaran sedang pending. Status akan diperbarui oleh notifikasi Midtrans.");
      },
      onError: () => {
        setState("error");
        setMessage("Pembayaran gagal di Midtrans. Silakan coba lagi.");
      },
      onClose: () => {
        setState("idle");
      },
    });
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
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-background/95 shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-start justify-between border-b border-white/10 p-5">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">Pembayaran Midtrans Snap</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pilih QRIS, e-wallet, virtual account, atau metode lain dari Snap.</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Tutup pembayaran">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 sm:p-8">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Tagihan</span>
                  <span className="font-bold text-foreground">Rp {amount.toLocaleString("id-ID")}</span>
                </div>
                <div className="mt-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">Gateway</span>
                  <span className="font-semibold text-primary">Midtrans Snap</span>
                </div>
              </div>

              {message && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {message}
                </div>
              )}

              {state === "paid" && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-brand-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Pembayaran berhasil dikonfirmasi.
                </div>
              )}

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={openSnap}
                  disabled={!snapReady || state === "loading_snap" || state === "opened"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {state === "loading_snap" || state === "opened" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {state === "loading_snap" ? "Memuat Snap..." : "Bayar dengan Midtrans"}
                </button>
                {redirectUrl && (
                  <a
                    href={redirectUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-3 text-sm font-semibold text-foreground transition-all hover:bg-white/10"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Buka halaman pembayaran
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-lg bg-white/5 py-3 text-sm font-semibold text-muted-foreground transition-all hover:bg-white/10"
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
