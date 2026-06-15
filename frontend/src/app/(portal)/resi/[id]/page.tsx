'use client';

import { useState, useEffect, use } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { clientLog } from '@/lib/clientLogger';
import { useNotificationStore } from '@/store/useNotificationStore';
import { 
  Printer, 
  Share2, 
  ArrowLeft, 
  Copy, 
  MapPin, 
  Check, 
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
  const { addNotification } = useNotificationStore();
  const resolvedParams = use(params);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // Copy success indicator
  const [isCopied, setIsCopied] = useState(false);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/auth/web/orders/${resolvedParams.id}`);
      if (res.data && res.data.success && res.data.order) {
        setOrder(res.data.order);
      } else {
        setOrder(null);
        addNotification({ title: 'Gagal', message: 'Resi tidak ditemukan pada database.', type: 'error' });
      }
    } catch (error) {
      clientLog.error('Failed to fetch customer order receipt', { error, orderId: resolvedParams.id });
      setOrder(null);
      addNotification({ title: 'Gagal', message: 'Gagal mengambil detail resi dari server.', type: 'error' });
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
    const text = `Halo, berikut rincian Resi Pengiriman TEMBUS: \n\nNo. Resi: ${order.order_number}\nPenerima: ${order.recipient_name}\nLayanan: ${order.model.toUpperCase()}\nStatus: ${order.status.replace('_', ' ')}\n\nLihat rincian lengkapnya di: ${window.location.origin}/resi/${order.id}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
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
            <h2 className="text-2xl font-black tracking-tighter text-primary">TEMBUS DELIVERY</h2>
            <p className="text-xs text-slate-500 font-medium select-none">PT TEMBUS LINTAS TEKNOLOGI</p>
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
          <p className="font-mono select-none font-bold">TEMBUS v1.0 • System Generated Receipt</p>
        </div>
      </motion.div>

    </div>
  );
}
