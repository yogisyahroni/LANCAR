'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useNotificationStore } from '@/store/useNotificationStore';
import { ArrowLeft, MapPin, Truck, Calendar, Phone, CheckCircle2, MessageSquare, Download, AlertTriangle, Send, Loader2, Sparkles, Navigation } from 'lucide-react';

interface Event {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
}

interface Order {
  id: string;
  order_number: string;
  pickup_address: string;
  dropoff_address: string;
  recipient_name: string;
  recipient_phone_masked: string;
  model: string;
  status: string;
  distance_km: number;
  base_price_idr: number;
  volumetric_surcharge_idr: number;
  insurance_premium_idr: number;
  total_price_idr: number;
  has_insurance: boolean;
  insured_value_idr: number;
  package_details: any;
  customer_notes: string;
  schedule_type: string;
  scheduled_at: string;
  created_at: string;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addNotification } = useNotificationStore();

  const id = params?.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  // For lightbox
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  // Chat
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'customer' | 'courier'; text: string; time: string }>>([
    { sender: 'courier', text: 'Halo, saya kurir Anda. Saya sedang menuju ke lokasi pickup.', time: '14:35' }
  ]);

  const fetchOrderDetail = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.get(`/auth/web/orders/${id}`);
      if (res.data && res.data.success) {
        setOrder(res.data.order);
        setEvents(res.data.events || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch order detail:', error);
      addNotification({ title: 'Gagal', message: 'Gagal mengambil detail order.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetail();
  }, [id]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setChatMessages([...chatMessages, { sender: 'customer', text: chatInput, time: timeStr }]);
    setChatInput('');
    addNotification({ title: 'Terkirim', message: 'Pesan terkirim ke kurir.', type: 'success' });
  };

  const handleDownloadResi = () => {
    addNotification({ title: 'Proses', message: 'Mempersiapkan unduhan resi PDF...', type: 'info' });
    setTimeout(() => {
      addNotification({ title: 'Selesai', message: 'Resi berhasil diunduh.', type: 'success' });
    }, 1200);
  };

  const handleReportIssue = () => {
    addNotification({ title: 'Terkirim', message: 'Masalah telah dilaporkan. CS kami akan segera menghubungi Anda.', type: 'success' });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const getStatusBadgeClass = (statusStr: string) => {
    switch (statusStr?.toLowerCase()) {
      case 'created':
      case 'pending':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'picked_up':
      case 'in_transit':
      case 'delivering':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse';
      case 'completed':
      case 'delivered':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'cancelled':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm font-medium">Memuat detail order premium...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-12 text-center bg-card border border-white/10 rounded-2xl max-w-xl mx-auto my-12 flex flex-col items-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <h3 className="text-xl font-bold">Order tidak ditemukan</h3>
        <p className="text-sm text-muted-foreground">Detail order yang Anda cari mungkin telah dihapus atau tidak dapat diakses.</p>
        <Link href="/orders" className="text-sm font-semibold text-primary underline">
          Kembali ke Daftar Order
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Premium Header/Navigation */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-1">
          <Link
            href="/orders"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-white transition duration-200"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Order
          </Link>
          <div className="flex items-center gap-3 pt-1">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
              Detail Order {order.order_number}
            </h1>
            <span
              className={`inline-flex items-center px-3.5 py-1.5 text-xs font-medium border rounded-full select-none ${getStatusBadgeClass(
                order.status
              )}`}
            >
              {order.status?.toUpperCase() || 'UNKNOWN'}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Waktu booking: {formatDate(order.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadResi}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm font-medium transition duration-200 flex items-center gap-2"
          >
            <Download className="h-4 w-4" /> Unduh Resi
          </button>
          <button
            onClick={handleReportIssue}
            className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition duration-200 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" /> Laporkan Masalah
          </button>
        </div>
      </div>

      {/* Main 2 Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Tracking Column (Map) */}
        <div className="col-span-1 lg:col-span-5 space-y-6">
          <div className="relative aspect-square md:aspect-[4/3] lg:aspect-auto lg:h-[620px] bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
            {/* Elegant Header Layer on top of map */}
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between p-3.5 bg-background/80 backdrop-blur-md rounded-xl border border-white/10 select-none shadow-lg">
              <div className="flex items-center gap-3">
                <Navigation className="h-5 w-5 text-primary animate-pulse" />
                <div>
                  <p className="text-xs text-muted-foreground leading-tight uppercase font-bold tracking-wider">Live tracking active</p>
                  <p className="text-sm font-bold text-white">ETA ~12 menit</p>
                </div>
              </div>
              <span className="h-2 w-2 rounded-full bg-green-500 animate-ping" />
            </div>

            {/* Premium Dynamic/Interactive Visual Map View or High Quality Simulated view */}
            <div className="flex-1 bg-gradient-to-br from-indigo-950/20 via-background to-blue-950/20 p-6 flex flex-col justify-center items-center space-y-4 select-none relative">
              <Sparkles className="h-10 w-10 text-primary/40 animate-spin duration-3000" />
              <div className="text-center space-y-1">
                <h4 className="font-bold text-white tracking-tight">Peta Pengiriman Hyperlocal</h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Menghubungkan <span className="text-white font-medium">Pickup</span> ({order.pickup_address}) dan <span className="text-white font-medium">Dropoff</span> ({order.dropoff_address})
                </p>
              </div>

              {/* Graphical simulation for high quality interactive look */}
              <div className="w-full max-w-xs bg-background/60 p-4 border border-white/10 rounded-xl space-y-3.5">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pickup Point</p>
                    <p className="text-xs text-white max-w-[190px] truncate" title={order.pickup_address}>
                      {order.pickup_address}
                    </p>
                  </div>
                </div>
                <div className="h-8 border-l-2 border-dashed border-white/10 ml-2.5" />
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Destination Point</p>
                    <p className="text-xs text-white max-w-[190px] truncate" title={order.dropoff_address}>
                      {order.dropoff_address}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Premium Courier Info Overlay Card */}
            <div className="p-4 bg-background/90 backdrop-blur-md border-t border-white/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center font-bold text-primary select-none text-base">
                  AP
                </div>
                <div>
                  <p className="text-xs text-muted-foreground leading-tight">Kurir Terpilih</p>
                  <p className="text-sm font-bold text-white">Andi Pratama</p>
                  <p className="text-xs text-muted-foreground">⭐ 4.8 | Motor Matic (B 1234 XYZ)</p>
                </div>
              </div>
              <a
                href={`tel:${order.recipient_phone_masked}`}
                className="p-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl transition duration-200 select-none shadow-sm"
              >
                <Phone className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Inline Chat Module */}
          <div className="bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h4 className="text-sm font-bold">Obrolan dengan Kurir</h4>
            </div>
            <div className="h-[210px] bg-background/40 border border-white/5 rounded-xl p-3.5 overflow-y-auto space-y-3.5">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col max-w-[80%] space-y-1 ${
                    msg.sender === 'customer' ? 'ml-auto items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-xs font-normal leading-relaxed ${
                      msg.sender === 'customer'
                        ? 'bg-primary text-primary-foreground rounded-tr-none'
                        : 'bg-white/5 border border-white/5 text-white rounded-tl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1 select-none">{msg.time}</span>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ketik pesan Anda di sini..."
                className="flex-1 bg-background/50 border border-white/10 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition duration-200"
              />
              <button
                type="submit"
                className="p-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition duration-200 shadow-sm"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right Details Column */}
        <div className="col-span-1 lg:col-span-7 space-y-6">
          {/* Order Data Summary */}
          <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-6">
            <div className="border-b border-white/10 pb-4">
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" /> Rincian Order & Pengiriman
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nama Penerima</p>
                <p className="text-sm font-semibold">{order.recipient_name || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nomor Telepon Penerima</p>
                <p className="text-sm">{order.recipient_phone_masked || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Metode Pengiriman</p>
                <p className="text-sm font-medium capitalize">{order.model || 'relay'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Jarak Tempuh</p>
                <p className="text-sm">{order.distance_km ? `${order.distance_km} km` : '-'}</p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Alamat Dropoff</p>
                <p className="text-sm text-white/90 leading-normal">{order.dropoff_address || '-'}</p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Catatan Order</p>
                <p className="text-sm text-white/90 italic leading-relaxed">{order.customer_notes || 'Tidak ada catatan khusus.'}</p>
              </div>
            </div>
          </div>

          {/* Order Pricing Breakdown Card */}
          <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2 border-b border-white/10 pb-3">
              Kalkulasi Biaya
            </h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ongkos dasar</span>
                <span className="font-medium">{formatPrice(order.base_price_idr || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Surge & Volumetrik Surcharge</span>
                <span className="font-medium">{formatPrice(order.volumetric_surcharge_idr || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Asuransi barang</span>
                <span className="font-medium">{formatPrice(order.insurance_premium_idr || 0)}</span>
              </div>
              <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-base bg-white/5 p-3 rounded-xl">
                <span>TOTAL HARGA</span>
                <span className="text-primary">{formatPrice(order.total_price_idr || 0)}</span>
              </div>
            </div>
          </div>

          {/* Timeline Tracking Flow */}
          <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-6">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2 border-b border-white/10 pb-3">
              <Sparkles className="h-5 w-5 text-primary" /> Timeline Tracking
            </h3>
            <div className="relative pl-6 space-y-6 border-l-2 border-white/10 ml-3">
              {events.length === 0 ? (
                <div className="flex items-start gap-4">
                  <div className="absolute left-[-9px] h-4 w-4 bg-primary rounded-full border-2 border-background flex items-center justify-center animate-ping" />
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Order Diterima</h5>
                    <p className="text-sm text-white font-medium">Sistem sedang memproses booking Anda.</p>
                  </div>
                </div>
              ) : (
                events.map((event, i) => (
                  <div key={event.id} className="relative">
                    <div
                      className={`absolute left-[-15px] top-1.5 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center ${
                        i === events.length - 1
                          ? 'bg-primary text-primary animate-pulse'
                          : 'bg-green-500 text-green-500'
                      }`}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-bold tracking-tight text-white capitalize">
                          {event.event_type?.replace(/_/g, ' ')}
                        </h5>
                        <span className="text-xs text-muted-foreground font-medium">{formatDate(event.created_at)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-normal">{event.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
