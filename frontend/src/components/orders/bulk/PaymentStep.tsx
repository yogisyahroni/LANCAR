'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Package, QrCode, RefreshCw } from 'lucide-react';

interface PaymentStepProps {
  jobId: string;
  data: any;
  onComplete: () => void;
}

type PaymentStatus = 'idle' | 'awaiting_snap' | 'pending_payment' | 'paid' | 'expired' | 'error';

export function PaymentStep({ jobId, data, onComplete }: PaymentStepProps) {
  const router = useRouter();

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [snapToken, setSnapToken] = useState<string | null>(null);
  const [snapLoaded, setSnapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const snapScriptRef = useRef<boolean>(false);

  const totalOrders = data.rows?.length || 0;
  const totalPrice = data.total_price || 0;
  const totalDistance = data.rows?.reduce((acc: number, row: any) => acc + (row.distance_km || 0), 0) || 0;

  // Load Midtrans Snap.js script on mount
  useEffect(() => {
    if (snapScriptRef.current) return;
    snapScriptRef.current = true;

    const script = document.createElement('script');
    script.src = process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL || 'https://app.midtrans.com/snap/snap.js';
    script.setAttribute('data-client-key', process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '');
    script.async = true;
    script.onload = () => setSnapLoaded(true);
    script.onerror = () => {
      setError('Gagal memuat library pembayaran Midtrans. Periksa koneksi internet Anda.');
    };
    document.head.appendChild(script);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Step 1: Create the bulk order via API and get a Snap token
  const handleInitiatePayment = async () => {
    setIsCreatingOrder(true);
    setError(null);

    try {
      const res = await api.post('/auth/web/orders/bulk/pay', { job_id: jobId });
      const token: string = res.data.snap_token;
      const orderId: string = res.data.payment_order_id;

      if (!token) {
        setError('Server tidak mengembalikan token pembayaran. Silakan coba lagi.');
        setIsCreatingOrder(false);
        return;
      }

      setSnapToken(token);
      setPaymentStatus('awaiting_snap');
      setIsCreatingOrder(false);

      // Step 2: Open Midtrans Snap popup with the real token
      (window as any).snap.pay(token, {
        onSuccess: () => {
          setPaymentStatus('paid');
          onComplete();
          setTimeout(() => router.push('/orders'), 2500);
        },
        onPending: () => {
          setPaymentStatus('pending_payment');
          // Start polling for payment confirmation
          startPaymentPolling(orderId);
        },
        onError: () => {
          setPaymentStatus('error');
          setError('Terjadi kesalahan pada gateway pembayaran. Silakan coba lagi.');
        },
        onClose: () => {
          // User closed the popup — don't reset, let them retry
          setPaymentStatus('idle');
        },
      });
    } catch (err: any) {
      setIsCreatingOrder(false);
      setPaymentStatus('error');
      setError(err.response?.data?.error || 'Gagal membuat pesanan. Silakan coba lagi.');
    }
  };

  // Poll payment status when user has pending payment (e.g., bank transfer)
  const startPaymentPolling = (orderId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/auth/web/orders/payment/status?order_id=${orderId}`);
        const status: string = res.data.payment_status;

        if (status === 'settlement' || status === 'capture') {
          clearInterval(pollingRef.current!);
          setPaymentStatus('paid');
          onComplete();
          setTimeout(() => router.push('/orders'), 2500);
        } else if (status === 'expire' || status === 'cancel' || status === 'deny') {
          clearInterval(pollingRef.current!);
          setPaymentStatus('expired');
          setError('Pembayaran telah kadaluarsa atau dibatalkan. Silakan buat pesanan baru.');
        }
      } catch {
        // Network error during polling — continue polling, don't abort
        console.warn('Payment status poll failed, retrying...');
      }
    }, 5000); // Poll every 5 seconds
  };

  if (paymentStatus === 'paid') {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-in zoom-in duration-500">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold text-emerald-500 mb-2">Pembayaran Berhasil!</h2>
        <p className="text-muted-foreground text-center max-w-md">
          {totalOrders} pesanan telah berhasil dibuat dan siap untuk dipickup. Mengalihkan ke halaman riwayat pesanan...
        </p>
      </div>
    );
  }

  const isLoading = isCreatingOrder || paymentStatus === 'awaiting_snap';
  const canPay = snapLoaded && paymentStatus === 'idle' && !isCreatingOrder;

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Order Summary */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Langkah 3: Pembayaran</h2>
          <p className="text-sm text-muted-foreground mt-1">Selesaikan pembayaran untuk memproses pesanan massal Anda.</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm space-y-6">
          <h3 className="font-medium text-foreground flex items-center gap-2 border-b border-white/10 pb-4">
            <Package className="w-5 h-5 text-primary" />
            Ringkasan Pesanan Massal
          </h3>

          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Pesanan</span>
              <span className="font-semibold text-lg">{totalOrders} Paket</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Jarak (Est.)</span>
              <span className="font-medium">{totalDistance.toFixed(1)} km</span>
            </div>

            <div className="pt-4 border-t border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-foreground font-medium">Total Pembayaran</span>
                <span className="text-2xl font-bold text-primary">
                  Rp {totalPrice.toLocaleString('id-ID')}
                </span>
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
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            Menunggu konfirmasi pembayaran...
          </div>
        )}
      </div>

      {/* Payment Method Panel */}
      <div className="rounded-xl border border-white/10 bg-background/50 p-6 flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-full max-w-xs space-y-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <QrCode className="w-6 h-6 text-primary" />
            <h3 className="font-semibold">Pembayaran via Midtrans</h3>
          </div>

          {/* Real payment method icons instead of Wikipedia QR */}
          <div className="aspect-square w-full bg-muted/20 rounded-xl border border-border/40 flex flex-col items-center justify-center gap-4 p-6">
            <div className="grid grid-cols-3 gap-3 w-full">
              {['GoPay', 'OVO', 'DANA', 'BCA VA', 'Mandiri VA', 'QRIS'].map((method) => (
                <div
                  key={method}
                  className="aspect-square rounded-lg bg-card border border-border/40 flex items-center justify-center text-[10px] font-bold text-muted-foreground p-1"
                >
                  {method}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Pilih metode pembayaran di popup Midtrans
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Sistem menggunakan Midtrans Snap untuk pembayaran yang aman dan terenkripsi.
            Pilih metode pembayaran (QRIS, VA, e-wallet) setelah klik tombol di bawah.
          </p>
        </div>

        <div className="w-full pt-4 border-t border-white/10">
          {!snapLoaded && (
            <p className="text-xs text-muted-foreground mb-3 flex items-center justify-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Memuat library pembayaran...
            </p>
          )}
          <button
            id="btn-initiate-payment"
            onClick={handleInitiatePayment}
            disabled={!canPay}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 px-4 rounded-lg font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Bayar Sekarang
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
