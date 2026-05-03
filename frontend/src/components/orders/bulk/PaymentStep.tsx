'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { CheckCircle2, CreditCard, Loader2, Package, QrCode } from 'lucide-react';
import Image from 'next/image';

interface PaymentStepProps {
  jobId: string;
  data: any;
  onComplete: () => void;
}

export function PaymentStep({ jobId, data, onComplete }: PaymentStepProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalOrders = data.rows?.length || 0;
  const totalPrice = data.total_price || 0;
  const totalDistance = data.rows?.reduce((acc: number, row: any) => acc + (row.distance_km || 0), 0) || 0;

  const handlePayment = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      // Create final bulk order
      await api.post('/auth/web/orders/bulk/pay', { job_id: jobId });
      
      // Simulate Payment process
      setTimeout(() => {
        setIsProcessing(false);
        setPaymentSuccess(true);
        onComplete();
        // Redirect to orders page after 2 seconds
        setTimeout(() => {
          router.push('/orders');
        }, 2000);
      }, 1500);

    } catch (err: any) {
      setIsProcessing(false);
      setError(err.response?.data?.error || 'Gagal memproses pembayaran');
    }
  };

  if (paymentSuccess) {
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

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Summary */}
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
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Payment Method */}
      <div className="rounded-xl border border-white/10 bg-background/50 p-6 flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-full max-w-xs space-y-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <QrCode className="w-6 h-6 text-primary" />
            <h3 className="font-semibold">Scan QRIS</h3>
          </div>
          
          <div className="aspect-square w-full bg-white rounded-xl p-4 flex items-center justify-center shadow-inner relative overflow-hidden">
            {/* Mock QRIS Image */}
            <div className="absolute inset-0 bg-[url('https://upload.wikimedia.org/wikipedia/commons/d/d0/QR_code_for_mobile_English_Wikipedia.svg')] bg-contain bg-center bg-no-repeat opacity-50 m-4"></div>
            <div className="relative z-10 bg-background/80 backdrop-blur-sm px-4 py-2 rounded-full border border-border text-xs font-medium uppercase tracking-wider">
              Mock QRIS
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">Buka aplikasi m-banking atau e-wallet Anda dan scan kode QR di atas.</p>
        </div>

        <div className="w-full pt-4 border-t border-white/10">
          <button
            onClick={handlePayment}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 px-4 rounded-lg font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Memverifikasi...
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Simulasikan Pembayaran
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
