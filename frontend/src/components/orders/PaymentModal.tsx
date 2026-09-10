"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatCurrency } from '@/i18n/format';
import { FocusTrap } from '@/components/a11y/FocusTrap';

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
  const { locale, t } = useI18n();
  const [state, setState] = useState<PaymentState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [snapReady, setSnapReady] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const paymentCheckKeyRef = useRef<string>("");
  const checkInFlightRef = useRef(false);
  useEffect(() => {
    paymentCheckKeyRef.current = "";
    checkInFlightRef.current = false;
  }, [orderId]);

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
    if (!orderId) {
      setState("error");
      setMessage("Referensi order tidak tersedia untuk konfirmasi pembayaran.");
      return;
    }
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    setIsChecking(true);

    if (!paymentCheckKeyRef.current) {
      paymentCheckKeyRef.current = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `payment-check-${Date.now()}`;
    }

    setState("pending");
    setMessage("Pembayaran diterima Midtrans. Menunggu konfirmasi status dari server...");

    try {
      const response = await api.post(
        `/auth/web/orders/${orderId}/payment/check`,
        undefined,
        { headers: { "X-Idempotency-Key": paymentCheckKeyRef.current } },
      );
      const initialStatus = response.data?.payment_status || response.data?.payment?.payment_status;
      if (initialStatus === "paid") {
        setState("paid");
        window.setTimeout(onSuccess, 700);
        return;
      }

      // Webhook Midtrans can arrive after the browser callback. Poll the
      // server-owned status briefly; never mark the payment paid locally.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const statusResponse = await api.get(`/auth/web/orders/${orderId}/payment/status`);
        const status = statusResponse.data?.payment_status || statusResponse.data?.payment?.payment_status;
        if (status === "paid") {
          setState("paid");
          window.setTimeout(onSuccess, 700);
          return;
        }
        if (status === "failed" || status === "expired") {
          setState("error");
          setMessage("Pembayaran tidak berhasil dikonfirmasi. Silakan coba metode pembayaran lain.");
          return;
        }
      }

      setState("pending");
      setMessage("Pembayaran belum terkonfirmasi. Status akan diperbarui dari notifikasi gateway; order tetap tersimpan.");
    } catch (error) {
      console.error("Payment confirmation failed", error);
      setState("error");
      setMessage("Gagal mengonfirmasi pembayaran ke server. Order tetap tersimpan, silakan coba lagi.");
    } finally {
      checkInFlightRef.current = false;
      setIsChecking(false);
    }
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
          <FocusTrap active={isOpen} className="relative max-h-[min(90vh,720px)] w-full max-w-md">
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
            }}
            className="relative max-h-[min(90vh,720px)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-start justify-between border-b border-border p-5">
              <div>
                <h2 id="payment-modal-title" className="text-xl font-bold tracking-tight text-foreground">{t('payment.title')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('payment.description')}</p>
              </div>
              <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full p-2 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t('payment.close')}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 sm:p-8">
              <div className="rounded-xl border border-border bg-surface-subtle p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('payment.total')}</span>
                  <span className="font-bold text-foreground">{formatCurrency(amount, 'IDR', locale)}</span>
                </div>
                <div className="mt-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">{t('payment.gateway')}</span>
                  <span className="font-semibold text-primary">Midtrans Snap</span>
                </div>
              </div>

              {message && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning" role="status" aria-live="polite">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {message}
                </div>
              )}

              {state === "paid" && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {t('payment.confirmed')}
                </div>
              )}

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={openSnap}
                  disabled={!snapReady || state === "loading_snap" || state === "opened"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {state === "loading_snap" || state === "opened" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
                  {state === "loading_snap" ? t('payment.loading') : t('payment.payWith')}
                </button>
                {state === "pending" && (
                  <button
                    type="button"
                    onClick={() => void confirmPaid()}
                    disabled={isChecking}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-warning bg-warning-surface py-3 text-sm font-semibold text-warning transition-all hover:bg-warning-surface disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isChecking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    {isChecking ? t('payment.checking') : t('payment.checkAgain')}
                  </button>
                )}
                {redirectUrl && (
                  <a
                    href={redirectUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-subtle py-3 text-sm font-semibold text-foreground transition-all hover:bg-surface-subtle"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    {t('payment.openPage')}
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-lg bg-surface-subtle py-3 text-sm font-semibold text-muted-foreground transition-all hover:bg-surface-subtle"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          </motion.div>
          </FocusTrap>
        </div>
      )}
    </AnimatePresence>
  );
}
