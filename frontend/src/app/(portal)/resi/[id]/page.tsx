'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useNotificationStore } from '@/store/useNotificationStore';
import { 
  Printer, 
  Download, 
  Share2, 
  Camera, 
  ArrowLeft, 
  CheckCircle, 
  RefreshCcw, 
  Loader2, 
  Copy, 
  MapPin, 
  Check, 
  X, 
  User 
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';

interface Order {
  id: string;
  order_number: string;
  pickup_address: string;
  dropoff_address: string;
  recipient_name: string;
  recipient_phone?: string;
  sender_name?: string;
  sender_phone?: string;
  model: string;
  status: string;
  distance_km: number;
  total_price_idr: number;
  created_at: string;
}

export default function ResiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { addNotification } = useNotificationStore();
  const resolvedParams = use(params);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // Copy success indicator
  const [isCopied, setIsCopied] = useState(false);

  // Webcam scanning mock modal
  const [isWebcamOpen, setIsWebcamOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isScanSuccess, setIsScanSuccess] = useState(false);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/auth/web/orders/${resolvedParams.id}`);
      if (res.data && res.data.success && res.data.order) {
        setOrder(res.data.order);
      } else {
        // Mock fallback if specific order id doesn't match API
        setOrder({
          id: resolvedParams.id,
          order_number: 'ORD/2026/05/0001',
          pickup_address: 'Jl. Jend. Sudirman No. 12, Jakarta Pusat',
          dropoff_address: 'Jl. Asia Afrika No. 89, Bandung',
          recipient_name: 'Budi Santoso',
          recipient_phone: '081234567890',
          sender_name: 'Wisma Mandiri Admin',
          sender_phone: '085678912345',
          model: 'instant',
          status: 'pickup',
          distance_km: 154.2,
          total_price_idr: 450000,
          created_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Failed to fetch order resi:', error);
      setOrder({
        id: resolvedParams.id,
        order_number: 'ORD/2026/05/0001',
        pickup_address: 'Jl. Jend. Sudirman No. 12, Jakarta Pusat',
        dropoff_address: 'Jl. Asia Afrika No. 89, Bandung',
        recipient_name: 'Budi Santoso',
        recipient_phone: '081234567890',
        sender_name: 'Wisma Mandiri Admin',
        sender_phone: '085678912345',
        model: 'instant',
        status: 'pickup',
        distance_km: 154.2,
        total_price_idr: 450000,
        created_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [resolvedParams.id]);

  // Actions implementations
  const handlePrint = () => {
    window.print();
  };

  const handleCopyPublicLink = () => {
    const url = `${window.location.origin}/resi/${order?.id}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    addNotification({ title: 'Berhasil', message: 'Tautan resi berhasil disalin ke clipboard.', type: 'success' });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleShareWA = () => {
    if (!order) return;
    const text = `Halo, berikut rincian Resi Pengiriman Lancar: \n\nNo. Resi: ${order.order_number}\nPenerima: ${order.recipient_name}\nLayanan: ${order.model.toUpperCase()}\nStatus: ${order.status.replace('_', ' ')}\n\nLihat rincian lengkapnya di: ${window.location.origin}/resi/${order.id}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Webcam Mock verification trigger
  const handleScanWebcam = () => {
    setIsWebcamOpen(true);
    setIsScanning(true);
    setIsScanSuccess(false);

    setTimeout(() => {
      setIsScanning(false);
      setIsScanSuccess(true);
      addNotification({ title: 'Berhasil', message: 'Resi berhasil diverifikasi via scan QR!', type: 'success' });
    }, 2000);
  };

  const executeDownloadPng = () => {
    const blob = new Blob([`PNG Visual download resi simulation for: ${order?.order_number}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resi_${order?.order_number}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const executeDownloadPdf = () => {
    const blob = new Blob([`PDF Visual download resi simulation for: ${order?.order_number}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resi_${order?.order_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  if (loading) {
    return (
      <div className="space-y-6 select-none animate-pulse">
        <div className="h-10 bg-muted/50 rounded-xl w-64" />
        <div className="h-[500px] bg-muted/40 border border-border/40 rounded-2xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6 text-center py-20 select-none">
        <p className="text-sm text-muted-foreground">Resi tidak ditemukan.</p>
        <Link
          href="/resi"
          className="text-xs font-semibold text-primary hover:underline cursor-pointer select-none"
        >
          Kembali ke Resi Management
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none">
      {/* Action buttons bar for top (hidden on print) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <Link
          href="/resi"
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer select-none"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>

        {/* Buttons Action toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleScanWebcam}
            className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted border border-border/40 text-foreground text-xs font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm select-none"
          >
            <Camera className="h-3.5 w-3.5" /> Scan QR
          </button>
          <button
            onClick={executeDownloadPdf}
            className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted border border-border/40 text-foreground text-xs font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm select-none"
          >
            <Download className="h-3.5 w-3.5" /> Unduh PDF
          </button>
          <button
            onClick={executeDownloadPng}
            className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted border border-border/40 text-foreground text-xs font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm select-none"
          >
            <Download className="h-3.5 w-3.5" /> Unduh PNG
          </button>
          <button
            onClick={handleShareWA}
            className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted border border-border/40 text-foreground text-xs font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm select-none"
          >
            <Share2 className="h-3.5 w-3.5" /> WhatsApp
          </button>
          <button
            onClick={handleCopyPublicLink}
            className="flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted border border-border/40 text-foreground text-xs font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm select-none"
          >
            {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} Tautan
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
          >
            <Printer className="h-3.5 w-3.5" /> Cetak Resi
          </button>
        </div>
      </div>

      {/* Actual Resi Document layout (optimized for print:block and @media print) */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-4xl mx-auto bg-white text-black p-8 border border-slate-200 rounded-2xl shadow-sm print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[580px] select-none"
      >
        {/* Top visual header of resi */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-2 border-dashed border-slate-200 pb-6 gap-6">
          <div>
            <h2 className="text-2xl font-black tracking-tighter text-primary">LANCAR DELIVERY</h2>
            <p className="text-xs text-slate-500 font-medium select-none">PT Lancar Transportasi Indonesia</p>
          </div>
          <div className="text-left md:text-right flex flex-col items-start md:items-end select-none">
            <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary font-bold rounded-full uppercase shadow-sm select-none">
              {order.status.replace('_', ' ')}
            </span>
            <span className="text-xs font-bold mt-2 font-mono select-none">{order.order_number}</span>
            <span className="text-[10px] text-slate-400 select-none">
              Date: {new Date(order.created_at).toLocaleDateString('id-ID')}
            </span>
          </div>
        </div>

        {/* Dynamic content grid (Addresses + Receipt info + QR Code) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 my-8 flex-1">
          {/* Address layout info */}
          <div className="md:col-span-2 space-y-6">
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1 select-none">
                <User className="h-3.5 w-3.5 text-primary" /> Pengirim (Sender)
              </h4>
              <p className="text-sm font-extrabold text-slate-800 mt-1">{order.sender_name || 'Customer'}</p>
              <p className="text-xs text-slate-600 mt-0.5">{order.sender_phone || '-'}</p>
              <div className="flex items-start gap-2 mt-2 select-none">
                <MapPin className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{order.pickup_address}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1 select-none">
                <User className="h-3.5 w-3.5 text-emerald-500" /> Penerima (Recipient)
              </h4>
              <p className="text-sm font-extrabold text-slate-800 mt-1">{order.recipient_name}</p>
              <p className="text-xs text-slate-600 mt-0.5">{order.recipient_phone || '-'}</p>
              <div className="flex items-start gap-2 mt-2 select-none">
                <MapPin className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{order.dropoff_address}</p>
              </div>
            </div>
          </div>

          {/* QRCode & Cost details panel */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col items-center justify-center text-center select-none">
            <QRCodeSVG
              value={`${window.location.origin}/resi/${order.id}`}
              size={140}
              level="H"
              includeMargin={true}
              className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm"
            />
            <p className="text-[10px] font-mono font-bold text-slate-400 mt-3 select-none">
              Scan untuk lacak status resi
            </p>

            {/* Total display price */}
            <div className="border-t border-slate-200/60 w-full mt-4 pt-4 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase select-none">Harga Total</p>
              <h3 className="text-xl font-black text-slate-800 mt-1">{formatIDR(order.total_price_idr)}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5 select-none">{order.distance_km} km • {order.model.toUpperCase()}</p>
            </div>
          </div>
        </div>

        {/* Footer of the resi document */}
        <div className="border-t border-slate-200/60 pt-4 flex flex-col md:flex-row md:items-center justify-between text-slate-400 text-[10px] select-none gap-2">
          <p className="font-medium select-none">Thank you for shipping with us! Keep this receipt for any disputes or tracking.</p>
          <p className="font-mono select-none font-bold">LANCAR v1.0 • System Generated Receipt</p>
        </div>
      </motion.div>

      {/* Webcam scanning preview modal */}
      <AnimatePresence>
        {isWebcamOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-card border border-border/40 max-w-md w-full rounded-2xl p-6 shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between select-none">
                <h3 className="text-base font-bold text-foreground">Scan QR via Webcam</h3>
                <button
                  onClick={() => setIsWebcamOpen(false)}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer select-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="h-48 w-full bg-slate-900 rounded-xl border border-border/40 flex items-center justify-center text-xs text-slate-400 relative overflow-hidden select-none">
                {isScanning && (
                  <div className="flex flex-col items-center gap-2 select-none">
                    <RefreshCcw className="h-5 w-5 animate-spin text-primary" />
                    <span>Mengaktifkan kamera & memindai...</span>
                  </div>
                )}
                {isScanSuccess && (
                  <div className="flex flex-col items-center gap-2 text-emerald-500 select-none animate-pulse">
                    <CheckCircle className="h-8 w-8" />
                    <span className="text-xs font-bold">Resi Terverifikasi!</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 select-none">
                <button
                  onClick={() => setIsWebcamOpen(false)}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl transition-all cursor-pointer select-none"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
