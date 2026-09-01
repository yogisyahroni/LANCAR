'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Loader2, Package, RefreshCw } from 'lucide-react';

interface PaymentStepProps {
  jobId: string;
  data: any;
  onComplete: () => void;
}

type PaymentStatus = 'idle' | 'creating' | 'opening_snap' | 'pending_payment' | 'processed' | 'error';

declare global {
  interface Window {
    snap?: any;
  }
}

function loadSnapScript(src: string, clientKey: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>('script[data-midtrans-snap="true"]');
  if (existing?.dataset.clientKey === clientKey && existing.src === src) {
    return Promise.resolve();
  }

  existing?.remove();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.midtransSnap = 'true';
    script.dataset.clientKey = clientKey;
    script.setAttribute('data-client-key', clientKey);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Gagal memuat Midtrans Snap.js.'));
    document.body.appendChild(script);
  });
}

export function PaymentStep({ jobId, data, onComplete }: PaymentStepProps) {
  const router = useRouter();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<any>(null);

  const validRows = useMemo(() => data.rows?.filter((row: any) => row.status === 'valid') || [], [data.rows]);
  const totalOrders = validRows.length;
  const totalPrice = validRows.reduce((acc: number, row: any) => acc + (row.price_breakdown?.total_price_idr || 0), 0);
  const totalDistance = validRows.reduce((acc: number, row: any) => acc + (row.price_breakdown?.distance_km || 0), 0);

  const formatCurrency = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

  const processKeyRef = useRef<string>('');

  const completeProcessing = () => {
    setPaymentStatus('processed');
    onComplete();
    setTimeout(() => router.push('/orders'), 1600);
  };

  const openSnap = async (snapPayment: any) => {
    if (!snapPayment?.snap_token || !snapPayment?.snap_js_url || !snapPayment?.client_key) {
      throw new Error('Response Midtrans belum lengkap. Pastikan MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY sudah diisi.');
    }

    setPaymentStatus('opening_snap');
    await loadSnapScript(snapPayment.snap_js_url, snapPayment.client_key);

    if (!window.snap) {
      throw new Error('Midtrans Snap belum tersedia di browser.');
    }

    window.snap.pay(snapPayment.snap_token, {
      onSuccess: () => setPaymentStatus('pending_payment'),
      onPending: () => setPaymentStatus('pending_payment'),
      onError: () => {
        setPaymentStatus('error');
        setError('Pembayaran gagal diproses oleh Midtrans. Silakan coba lagi.');
      },
      onClose: () => setPaymentStatus('pending_payment')
    });
  };

  const handleInitiatePayment = async () => {
    setPaymentStatus('creating');
    setError(null);

    try {
      if (!processKeyRef.current) {
        processKeyRef.current = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `bulk-process-${Date.now()}`;
      }
      const res = await api.post('/auth/web/orders/bulk/process', {
        job_id: jobId,
        job_revision: Number(data.revision || 1),
      }, { headers: { 'X-Idempotency-Key': processKeyRef.current } });
      if (res.data?.success !== true || !Array.isArray(res.data?.order_ids) || res.data.order_ids.length === 0) {
        throw new Error('Server belum mengonfirmasi order bulk tersimpan.');
      }
      const snapPayment = res.data.payment;
      if (!snapPayment) {
        completeProcessing();
        return;
      }
      setPayment(snapPayment);
      await openSnap(snapPayment);
    } catch (err: any) {
      setPaymentStatus('error');
      setError(err.response?.data?.error || err.message || 'Gagal memproses order massal. Silakan coba lagi.');
    }
  };

  const handleOpenExistingPayment = async () => {
    if (!payment) return;

    try {
      setError(null);
      await openSnap(payment);
    } catch (err: any) {
      setPaymentStatus('error');
      setError(err.message || 'Gagal membuka Midtrans Snap.');
    }
  };

  if (paymentStatus === 'processed') {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-in zoom-in duration-500">
        <div className="w-20 h-20 bg-brand-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-brand-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold text-brand-emerald-500 mb-2">Order Massal Tersimpan</h2>
        <p className="text-muted-foreground text-center max-w-md">
          {totalOrders} pesanan sudah dibuat dan payment link dikirim sesuai response server. Mengalihkan ke riwayat pesanan...
        </p>
      </div>
    );
  }

  const isBusy = paymentStatus === 'creating' || paymentStatus === 'opening_snap';

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Langkah 3: Pembayaran</h2>
          <p className="text-sm text-muted-foreground mt-1">Selesaikan pembayaran Midtrans Snap untuk memproses pesanan massal Anda.</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm space-y-6">
          <h3 className="font-medium text-foreground flex items-center gap-2 border-b border-white/10 pb-4">
            <Package className="w-5 h-5 text-primary" />
            Ringkasan Pesanan Massal
          </h3>

          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Pesanan Valid</span>
              <span className="font-semibold text-lg">{totalOrders} Paket</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Jarak Estimasi</span>
              <span className="font-medium">{totalDistance.toFixed(1)} km</span>
            </div>
            <div className="pt-4 border-t border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-foreground font-medium">Total Pembayaran</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(totalPrice)}</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {paymentStatus === 'pending_payment' && (
          <div className="p-3 bg-amber-500/10 text-amber-300 rounded-lg text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            Menunggu pembayaran atau notifikasi dari Midtrans.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-background/50 p-6 flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <CreditCard className="h-10 w-10" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Midtrans Snap</h3>
          <p className="text-sm text-muted-foreground">
            Customer akan memilih metode pembayaran langsung di halaman Snap: QRIS, VA, kartu, atau e-wallet sesuai konfigurasi Midtrans.
          </p>
        </div>

        <div className="w-full rounded-lg border border-white/10 bg-white/5 p-4 text-sm space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <b>{formatCurrency(totalPrice)}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gateway</span>
            <b>Midtrans Snap</b>
          </div>
        </div>

        <button
          id="btn-initiate-payment"
          onClick={payment ? handleOpenExistingPayment : handleInitiatePayment}
          disabled={isBusy || totalOrders === 0}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 px-4 rounded-lg font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
        >
          {isBusy ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {paymentStatus === 'creating' ? 'Membuat transaksi...' : 'Membuka Snap...'}
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              {payment ? 'Buka Midtrans Snap' : 'Bayar dengan Midtrans Snap'}
            </>
          )}
        </button>

        {payment?.redirect_url && (
          <a
            href={payment.redirect_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Buka halaman pembayaran
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
