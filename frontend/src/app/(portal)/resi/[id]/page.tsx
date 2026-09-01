'use client';

import { useState, useEffect, use } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { CustomerPageSkeleton } from '@/components/ui/Skeleton';
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
import Barcode from 'react-barcode';
import Link from 'next/link';
import { OrderPriceBreakdown } from '@/components/orders/OrderPriceBreakdown';
import { OrderServiceBadge } from '@/components/orders/OrderServiceBadge';
import { presentCarrierStatus } from '@/lib/carrierStatusPresentation';

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
  service_category?: string | null;
  service_code?: string | null;
  order_contract?: {
    service?: { category?: string | null; degraded?: boolean } | null;
  } | null;
  service_snapshot?: {
    name?: string | null;
    service_name?: string | null;
    category?: string | null;
    service_category?: string | null;
  } | null;
  status: string;
  payment_status?: string | null;
  distance_km: number;
  total_price_idr: number;
  created_at: string;
  awb_number?: string;
  logistics_provider?: string | null;
  logistics_service_type?: string | null;
  carrier_events?: Array<{
    id: string;
    provider: string;
    canonical_status: string;
    provider_status?: string | null;
    provider_status_code?: string | null;
    provider_status_description?: string | null;
    provider_location?: string | null;
    occurred_at?: string | null;
    received_at: string;
  }>;
}

export default function ResiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { addNotification } = useNotificationStore();
  const resolvedParams = use(params);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [templateData, setTemplateData] = useState<any>(null);

  // Copy success indicator
  const [isCopied, setIsCopied] = useState(false);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/auth/web/orders/${resolvedParams.id}`);
      if (res.data && res.data.success && res.data.order) {
        setOrder(res.data.order);
        if (res.data.order.awb_number) {
          try {
            const tmplRes = await api.get(`/resi/render/${res.data.order.awb_number}`);
            setTemplateData(tmplRes.data);
          } catch (e) {
            clientLog.error('Failed to fetch template data', { error: e });
          }
        }
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
    const noResi = order.awb_number ? `${order.awb_number} (No. Pesanan: ${order.order_number})` : order.order_number;
    const text = `Halo, berikut rincian Resi Pengiriman: \n\nNo. Resi: ${noResi}\nPenerima: ${order.recipient_name}\nLayanan: ${order.model.toUpperCase()}\nStatus: ${order.status.replace('_', ' ')}\n\nLihat rincian lengkapnya di: ${window.location.origin}/resi/${order.id}`;
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
    return <CustomerPageSkeleton />;
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

  const elements = templateData?.layout_config?.elements || [];

  const resolveValue = (val: string, currentOrder: Order) => {
    if (!val) return '';
    return val
      .replace(/{{order_number}}/g, currentOrder.order_number || '')
      .replace(/{{awb_number}}/g, currentOrder.awb_number || '')
      .replace(/{{provider_name}}/g, currentOrder.logistics_provider || currentOrder.model || '')
      .replace(/{{service_type}}/g, currentOrder.logistics_service_type || currentOrder.model || '')
      .replace(/{{service_name}}/g, currentOrder.service_snapshot?.service_name || currentOrder.model || '')
      .replace(/{{total_price}}/g, formatIDR(currentOrder.total_price_idr || 0))
      .replace(/{{total_price_idr}}/g, formatIDR(currentOrder.total_price_idr || 0))
      .replace(/{{customer_name}}/g, currentOrder.recipient_name || '')
      .replace(/{{sender_name}}/g, currentOrder.sender_name || '-')
      .replace(/{{sender_phone}}/g, currentOrder.sender_phone || '-')
      .replace(/{{sender_address}}/g, currentOrder.pickup_address || '-')
      .replace(/{{receiver_name}}/g, currentOrder.recipient_name || '-')
      .replace(/{{receiver_phone}}/g, currentOrder.recipient_phone || '-')
      .replace(/{{receiver_address}}/g, currentOrder.dropoff_address || '-')
      .replace(/{{item_names}}/g, (currentOrder as any).item_names || '-')
      .replace(/{{total_weight}}/g, String((currentOrder as any).total_weight ?? '-'))
      .replace(/{{total_items}}/g, String((currentOrder as any).total_items ?? '-'))
      .replace(/{{order_id}}/g, currentOrder.order_number || currentOrder.id || '')
      .replace(/{{tracking_url}}/g, `${window.location.origin}/resi/${currentOrder.id}`);
  };

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
            {isCopied ? <Check className="h-3.5 w-3.5 text-brand-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} Tautan
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
          >
            <Printer className="h-3.5 w-3.5" /> Cetak Resi
          </button>
        </div>
      </div>

      <div className="print:hidden grid gap-3 rounded-2xl border border-border/40 bg-card/40 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <OrderServiceBadge
          model={order.model}
          service_category={order.service_category}
          service_code={order.service_code}
          order_contract={order.order_contract}
          service_snapshot={order.service_snapshot}
          logistics_provider={order.logistics_provider}
          logistics_service_type={order.logistics_service_type}
          awb_number={order.awb_number}
        />
        <OrderPriceBreakdown compact totalPriceIdr={order.total_price_idr} paymentStatus={order.payment_status} deliveryStatus={order.status} />
      </div>

      {/* Actual Resi Document layout (optimized for print:block and @media print) */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-4xl mx-auto flex flex-col justify-center min-h-[580px] select-none print:p-0"
      >
        {templateData && elements.length > 0 ? (
          <div 
            className="relative bg-white shadow-sm border border-slate-200 overflow-hidden mx-auto print:shadow-none print:border-none"
            style={{ width: 384, height: 576 }} // A6 scaling matches designer
          >
            {elements.map((el: any) => (
              <div 
                key={el.id}
                className="absolute"
                style={{ left: el.x, top: el.y }}
              >
                {el.type === 'text' && <span style={{ fontSize: el.fontSize || 14, color: '#000', whiteSpace: 'nowrap', fontWeight: el.fontWeight || 'normal' }}>{resolveValue(el.value, order)}</span>}
                {el.type === 'qrcode' && (
                  <QRCodeSVG value={resolveValue(el.value, order) || order.awb_number || order.id} size={el.width || 80} />
                )}
                {el.type === 'barcode' && (
                  <Barcode
                    value={resolveValue(el.value, order) || order.awb_number || order.id}
                    width={el.barWidth || 1.5}
                    height={el.height || 40}
                    fontSize={9}
                    displayValue={false}
                    margin={0}
                  />
                )}
                {el.type === 'logo' && (
                  el.value && el.value.startsWith('http') ? (
                    <img src={resolveValue(el.value, order)} alt="Logo" style={{ width: el.width || 100, height: el.height || 32, objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div style={{ width: el.width || 120, height: el.height || 32 }} className="bg-zinc-100 border border-zinc-400 flex items-center justify-center text-[11px] text-zinc-700 font-bold tracking-wide rounded">
                      {order.model ? order.model.toUpperCase() : 'LOGO KURIR'}
                    </div>
                  )
                )}
                {el.type === 'tembus_logo' && (
                  <img
                    src="/tembusweb-resi.svg"
                    alt="TEMBUS Logo"
                    style={{ width: el.width || 120, height: el.height || 30, objectFit: 'contain' }}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white p-8 border border-slate-200 rounded-2xl">
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
                {order.awb_number ? (
                  <>
                    <span className="text-[10px] font-bold text-slate-400 mt-2">No. Resi Kurir</span>
                    <span className="text-xs font-bold font-mono select-none text-slate-800">{order.awb_number}</span>
                    <span className="text-[10px] font-bold text-slate-400 mt-1">No. Pesanan</span>
                    <span className="text-[10px] font-mono select-none text-slate-500">{order.order_number}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-bold text-slate-400 mt-2">No. Resi TEMBUS</span>
                    <span className="text-xs font-bold font-mono select-none text-slate-800">{order.order_number}</span>
                  </>
                )}
                <span className="text-[10px] text-slate-400 select-none mt-1">
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
                    <User className="h-3.5 w-3.5 text-brand-emerald-500" /> Penerima (Recipient)
                  </h4>
                  <p className="text-sm font-extrabold text-slate-800 mt-1">{order.recipient_name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{order.recipient_phone || '-'}</p>
                  <div className="flex items-start gap-2 mt-2 select-none">
                    <MapPin className="h-4 w-4 shrink-0 text-brand-emerald-500 mt-0.5" />
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

            {(order.carrier_events || []).length > 0 && (
              <div className="border-t border-slate-200/60 pt-5 mt-5">
                <h4 className="text-xs font-bold uppercase text-slate-400">Update kurir eksternal</h4>
                <div className="mt-3 space-y-2">
                  {order.carrier_events?.map((event) => (
                    <div key={event.id} className={`rounded-lg border px-3 py-2 text-xs ${presentCarrierStatus(event.canonical_status).isUnknown ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-slate-800">
                          {presentCarrierStatus(event.canonical_status).label} · {event.provider}
                        </span>
                        <span>{new Date(event.occurred_at || event.received_at).toLocaleString('id-ID')}</span>
                      </div>
                      {presentCarrierStatus(event.canonical_status).isUnknown && (
                        <p className="mt-1">{presentCarrierStatus(event.canonical_status).description}</p>
                      )}
                      {event.provider_status && <p className="mt-1">Status asli: {event.provider_status}</p>}
                      {event.provider_status_description && <p>{event.provider_status_description}</p>}
                      {(event.provider_status_code || event.provider_location) && (
                        <p className="mt-1 text-slate-500">
                          {[event.provider_status_code && `Kode ${event.provider_status_code}`, event.provider_location && `Lokasi ${event.provider_location}`].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer of the resi document */}
            <div className="border-t border-slate-200/60 pt-4 flex flex-col md:flex-row md:items-center justify-between text-slate-400 text-[10px] select-none gap-2">
              <p className="font-medium select-none">Thank you for shipping with us! Keep this receipt for any disputes or tracking.</p>
              <p className="font-mono select-none font-bold">TEMBUS v1.0 • System Generated Receipt</p>
            </div>
          </div>
        )}
      </motion.div>

    </div>
  );
}
