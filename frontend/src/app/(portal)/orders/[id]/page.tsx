'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useAuthStore } from '@/store/authStore';
import { getSocket, joinOrderRoom, leaveOrderRoom } from '@/lib/socket';
import { clientLog } from '@/lib/clientLogger';
import { ArrowLeft, MapPin, Truck, Calendar, Phone, CheckCircle2, MessageSquare, Download, AlertTriangle, Send, Loader2, Sparkles, Navigation, Image as ImageIcon, X, Share2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DisputeModal } from '@/components/orders/DisputeModal';

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
  courier_name?: string;
  courier_vehicle?: string;
  courier_plate?: string;
  courier_rating?: number;
  route_snapshot?: RouteSnapshot | null;
  route_provider?: string | null;
  route_profile?: string | null;
  route_polyline?: string | null;
  route_distance_meters?: number | null;
  route_duration_seconds?: number | null;
}

interface RouteSnapshot {
  generated_at?: string;
  provider?: string;
  requested_provider?: string;
  active_provider?: string;
  scope?: string;
  route_profile?: string;
  vehicle_type?: string;
  service_code?: string;
  distance_km?: number;
  distance_meters?: number;
  duration_seconds?: number;
  eta?: string;
  eta_minutes?: number;
  route_polyline?: string;
  traffic_aware?: boolean;
  confidence?: string;
  fallback_reason?: string | null;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  message_type: string;
  created_at: string;
  order_id?: string;
}

let clientMessageFallbackCounter = 0;

const createClientMessageId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const entropy = new Uint32Array(2);
    window.crypto.getRandomValues(entropy);
    return `web-${Date.now()}-${entropy[0].toString(36)}${entropy[1].toString(36)}`;
  }
  clientMessageFallbackCounter += 1;
  return `web-${Date.now()}-${clientMessageFallbackCounter}`;
};

interface TrackingData {
  courier_id: string;
  location?: {
    latitude: number;
    longitude: number;
    heading?: number;
    timestamp?: string;
  };
  eta?: string;
  eta_minutes?: number;
  route_provider?: string;
  route_polyline?: string;
  order_route_snapshot?: RouteSnapshot | null;
  order_route_provider?: string | null;
  order_route_profile?: string | null;
  order_route_polyline?: string | null;
  order_route_distance_meters?: number | null;
  order_route_duration_seconds?: number | null;
  order_route_snapshot_hash?: string | null;
  order_route_version?: string | null;
}

interface TrackingProof {
  id: string;
  scan_type?: string | null;
  proof_label?: string | null;
  proof_category?: 'pickup' | 'pod' | 'cancellation' | 'operational' | string | null;
  photo_url?: string | null;
  image_urls?: string[] | null;
  override_reason?: string | null;
  reason_code?: string | null;
  reason_note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  recorded_at?: string | null;
}

interface OnDemandRealtimePayload {
  event: string;
  order_id: string;
  status?: string;
  stage?: string;
  location?: TrackingData['location'];
  chat?: ChatMessage;
}

function decodePolyline(encoded?: string | null): Array<{ lat: number; lng: number }> {
  if (!encoded) return [];
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byteValue = 0;
    do {
      if (index >= encoded.length) return points;
      byteValue = encoded.charCodeAt(index++) - 63;
      result |= (byteValue & 0x1f) << shift;
      shift += 5;
    } while (byteValue >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      if (index >= encoded.length) return points;
      byteValue = encoded.charCodeAt(index++) - 63;
      result |= (byteValue & 0x1f) << shift;
      shift += 5;
    } while (byteValue >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 100000, lng: lng / 100000 });
  }

  return points;
}

function buildSvgRoute(points: Array<{ lat: number; lng: number }>) {
  if (points.length < 2) return "M28 112 C96 36, 150 130, 220 70 S320 44, 372 96";
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  return points.map((point, index) => {
    const x = 28 + ((point.lng - minLng) / lngSpan) * 344;
    const y = 24 + (1 - ((point.lat - minLat) / latSpan)) * 112;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function RouteSnapshotPanel({ order, tracking }: { order: Order; tracking: TrackingData | null }) {
  const snapshot = tracking?.order_route_snapshot || order.route_snapshot || null;
  const routePolyline =
    tracking?.route_polyline ||
    tracking?.order_route_polyline ||
    snapshot?.route_polyline ||
    order.route_polyline ||
    null;
  const routePoints = decodePolyline(routePolyline);
  const distanceMeters =
    tracking?.order_route_distance_meters ||
    snapshot?.distance_meters ||
    order.route_distance_meters ||
    (snapshot?.distance_km ? Math.round(snapshot.distance_km * 1000) : null);
  const durationSeconds =
    tracking?.order_route_duration_seconds ||
    snapshot?.duration_seconds ||
    order.route_duration_seconds ||
    (snapshot?.eta_minutes ? snapshot.eta_minutes * 60 : null);
  const provider =
    snapshot?.active_provider ||
    tracking?.order_route_provider ||
    tracking?.route_provider ||
    order.route_provider ||
    snapshot?.provider ||
    "runtime";
  const routeProfile = snapshot?.route_profile || tracking?.order_route_profile || order.route_profile || "on-demand";
  const distanceLabel = distanceMeters ? `${(distanceMeters / 1000).toFixed(1)} km` : "Estimasi jarak";
  const etaLabel = durationSeconds ? `~${Math.ceil(durationSeconds / 60)} menit` : snapshot?.eta || tracking?.eta || "ETA diperbarui";
  const svgPath = buildSvgRoute(routePoints);
  const hasProviderFallback = !routePolyline || Boolean(snapshot?.fallback_reason);

  const isCancelled = order.status.toLowerCase() === 'cancelled';

  return (
    <div className={`rounded-2xl border ${isCancelled ? 'border-slate-500/20 bg-slate-500/10' : 'border-emerald-500/15 bg-emerald-500/[0.06]'} p-4 shadow-sm`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wider ${isCancelled ? 'text-slate-400' : 'text-emerald-300'}`}>Route snapshot</p>
          <h3 className={`mt-1 text-base font-bold tracking-tight ${isCancelled ? 'text-slate-300' : 'text-white'}`}>{isCancelled ? 'Rute dibatalkan' : 'Rute pengiriman'}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{isCancelled ? '-' : distanceLabel} • {isCancelled ? '-' : etaLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${isCancelled ? 'bg-slate-500/20 text-slate-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
            {provider}
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {routeProfile}
          </span>
        </div>
      </div>
      <div className="relative h-36 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
        {/* Professional Map Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0f_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0f_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className={`absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,${isCancelled ? 'rgba(100,116,139,0.15)' : 'rgba(16,185,129,0.18)'},transparent_28%),radial-gradient(circle_at_80%_68%,rgba(249,115,22,0.14),transparent_26%)]`} />
        
        {isCancelled ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest text-center">RUTE DIBATALKAN</p>
            <p className="text-[10px] text-slate-500 mt-1">Sistem pelacakan dihentikan</p>
          </div>
        ) : (
          <svg viewBox="0 0 400 160" className="absolute inset-0 h-full w-full opacity-90" role="img" aria-label="Polyline rute order">
            <path
              d={svgPath}
              fill="none"
              stroke={routePoints.length >= 2 ? "#10b981" : "#64748b"}
              strokeDasharray={routePoints.length >= 2 ? "0" : "8 8"}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="6"
            />
            <circle cx="28" cy={routePoints.length >= 2 ? "112" : "112"} r="10" fill="#10b981" />
            <circle cx="372" cy={routePoints.length >= 2 ? "96" : "96"} r="10" fill="#f97316" />
          </svg>
        )}
      </div>
      {hasProviderFallback && (
        <p className="mt-3 text-xs text-muted-foreground">
          Rute sedang diperbarui. Customer dan kurir tetap memakai estimasi backend yang sama sampai provider peta mengirim geometri terbaru.
        </p>
      )}
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const id = params?.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [proofs, setProofs] = useState<TrackingProof[]>([]);
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [trackingError, setTrackingError] = useState('');
  const [loading, setLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [sharingTracking, setSharingTracking] = useState(false);
  const [retryingMatching, setRetryingMatching] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // For lightbox
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  // Chat
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchOrderChats = useCallback(async () => {
    if (!id) return;
    setChatsLoading(true);
    try {
      const res = await api.get(`/auth/web/orders/${id}/chats`);
      if (res.data && res.data.success) {
        setChatMessages(res.data.chats || []);
      }
    } catch (error) {
      clientLog.error('Failed to fetch customer order chats', { error, orderId: id });
    } finally {
      setChatsLoading(false);
    }
  }, [id]);

  const fetchOrderDetail = useCallback(async (showLoader = true) => {
    if (!id) return;
    if (showLoader) {
      setLoading(true);
    }
    try {
      const res = await api.get(`/auth/web/orders/${id}`);
      if (res.data && res.data.success) {
        setOrder(res.data.order);
        setEvents(res.data.events || []);
        setProofs(res.data.proofs || []);
        if (showLoader) {
          fetchOrderChats(); // Fetch chats after order detail
        }
      }
    } catch (error: any) {
      clientLog.error('Failed to fetch customer order detail', { error, orderId: id });
      if (showLoader) {
        addNotification({ title: 'Gagal', message: 'Gagal mengambil detail order.', type: 'error' });
      }
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [id, addNotification, fetchOrderChats]);

  const fetchTracking = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get('/tracking', { params: { order_id: id } });
      const data = res.data?.data || res.data;
      setTracking(data || null);
      setTrackingError('');
    } catch (error: any) {
      setTrackingError(error?.response?.data?.message || 'Tracking belum tersedia.');
    }
  }, [id]);

  // Real-time order room listener. This keeps customer web aligned with mobile
  // without waiting for the safety polling fallback.
  useEffect(() => {
    if (!user?.id || !id) return;

    const socket = getSocket(user.id, 'customer');
    if (!socket) return;

    joinOrderRoom(id);

    const appendChat = (chat?: ChatMessage) => {
      if (!chat || chat.order_id !== id) return;
      setChatMessages(prev => {
        if (prev.some(m => m.id === chat.id)) return prev;
        return [...prev, chat];
      });
    };

    const applyTrackingPayload = (payload: OnDemandRealtimePayload) => {
      if (payload.order_id !== id) return;
      if (payload.location) {
        setTracking(prev => ({
          courier_id: prev?.courier_id || '',
          ...prev,
          location: payload.location,
        }));
        setTrackingError('');
      }
      fetchTracking();
    };

    const handleOnDemandEvent = (payload: OnDemandRealtimePayload) => {
      if (payload.order_id !== id) return;
      if (payload.event === 'chat_message') {
        appendChat(payload.chat);
        return;
      }
      if (payload.event === 'tracking_updated') {
        applyTrackingPayload(payload);
      }
      if ([
        'offer_accepted',
        'courier_otw_pickup',
        'pickup_verified',
        'delivery_started',
        'pod_completed',
        'pickup_cancelled',
      ].includes(payload.event)) {
        fetchOrderDetail(false);
        fetchTracking();
      }
    };

    const handleLegacyTracking = (payload: OnDemandRealtimePayload) => {
      applyTrackingPayload(payload);
    };

    socket.on('on_demand_event', handleOnDemandEvent);
    socket.on('order_tracking_updated', handleLegacyTracking);
    socket.on('tracking:update', handleLegacyTracking);
    socket.on('new_chat_message', appendChat);

    return () => {
      socket.off('on_demand_event', handleOnDemandEvent);
      socket.off('order_tracking_updated', handleLegacyTracking);
      socket.off('tracking:update', handleLegacyTracking);
      socket.off('new_chat_message', appendChat);
      leaveOrderRoom(id);
    };
  }, [user?.id, id, fetchOrderDetail, fetchTracking]);

  useEffect(() => {
    fetchOrderDetail();
  }, [fetchOrderDetail]);

  useEffect(() => {
    if (!id) return;
    const interval = window.setInterval(() => {
      fetchOrderDetail(false);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [id, fetchOrderDetail]);

  useEffect(() => {
    if (!id) return;
    fetchTracking();
    const interval = window.setInterval(fetchTracking, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [id, fetchTracking]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await api.post(`/auth/web/orders/${id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (res.data.success) {
        await sendMessage(res.data.url, 'image');
      }
    } catch (error) {
      addNotification({ title: 'Gagal', message: 'Gagal mengunggah gambar', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setSelectedFile(file);
          setPreviewImage(URL.createObjectURL(file));
        }
      }
    }
  };

  const sendMessage = async (text: string, type: string = 'text') => {
    try {
      const res = await api.post(`/auth/web/orders/${id}/chats`, {
        message: text,
        message_type: type,
        client_message_id: createClientMessageId(),
      });
      if (res.data && res.data.success) {
        setChatMessages(prev => [...prev, res.data.chat]);
        setChatInput('');
        setPreviewImage(null);
        setSelectedFile(null);
        addNotification({ title: 'Terkirim', message: 'Pesan terkirim.', type: 'success' });
      }
    } catch (error) {
      clientLog.error('Failed to send customer order message', { error, orderId: id });
      addNotification({ title: 'Gagal', message: 'Gagal mengirim pesan.', type: 'error' });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (previewImage && selectedFile) {
      handleFileUpload(selectedFile);
      return;
    }
    if (!chatInput.trim()) return;
    await sendMessage(chatInput, 'text');
  };

  const handleDownloadResi = () => {
    if (!id) return;
    window.open(`/resi/${id}`, '_blank');
  };

  const handleCreatePublicTrackingLink = async () => {
    if (!id) return;
    setSharingTracking(true);
    try {
      const res = await api.post(`/auth/web/orders/${id}/public-tracking-link`);
      const url = res.data?.data?.url;
      if (!url) throw new Error('Public tracking URL missing');
      await navigator.clipboard.writeText(url);
      addNotification({
        title: 'Link disalin',
        message: 'Link tracking publik siap dibagikan ke penerima.',
        type: 'success'
      });
    } catch (error: any) {
      addNotification({
        title: 'Belum bisa dibagikan',
        message: error?.response?.data?.message || 'Link tracking bisa dibuat setelah kurir menerima pekerjaan.',
        type: 'error'
      });
    } finally {
      setSharingTracking(false);
    }
  };

  const handleReportIssue = () => {
    setIsDisputeModalOpen(true);
  };

  const handleRetryMatching = async () => {
    if (!id) return;
    setRetryingMatching(true);
    try {
      const res = await api.post(`/auth/web/orders/${id}/retry-matching`);
      addNotification({
        title: 'Pencarian Ulang Dimulai',
        message: res.data?.message || 'Kami sedang mencari kurir untuk pesanan Anda kembali.',
        type: 'success',
      });
      await fetchOrderDetail(false);
    } catch (error: any) {
      addNotification({
        title: 'Gagal Mencari Ulang',
        message: error?.response?.data?.error || 'Terjadi kesalahan saat memulai ulang pencarian kurir.',
        type: 'error',
      });
    } finally {
      setRetryingMatching(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!id) return;
    setCancellingOrder(true);
    try {
      const res = await api.post(`/auth/web/orders/${id}/cancel`, {
        reason: 'Dibatalkan oleh pelanggan (Kurir tidak ditemukan)',
      });
      addNotification({
        title: 'Pesanan Dibatalkan',
        message: res.data?.message || 'Pesanan Anda telah dibatalkan. Pengembalian dana (refund) diproses secara otomatis.',
        type: 'success',
      });
      setShowCancelModal(false);
      await fetchOrderDetail(false);
    } catch (error: any) {
      addNotification({
        title: 'Gagal Membatalkan',
        message: error?.response?.data?.error || 'Pesanan tidak dapat dibatalkan saat ini.',
        type: 'error',
      });
    } finally {
      setCancellingOrder(false);
    }
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

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('id-ID', {
      timeStyle: 'short',
    }).format(date);
  };

  const formatTrackingTime = (dateStr?: string) => {
    if (!dateStr) return 'Belum tersedia';
    return formatTime(dateStr);
  };

  const uploadUrl = (path?: string | null) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const baseUrl = String(api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  };

  const proofGroups = {
    pickup: proofs.filter((proof) => proof.proof_category === 'pickup'),
    pod: proofs.filter((proof) => proof.proof_category === 'pod'),
    cancellation: proofs.filter((proof) => proof.proof_category === 'cancellation')
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
      case 'no_courier_found':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30 animate-pulse';
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
              {order.status?.toUpperCase().replace(/_/g, ' ') || 'UNKNOWN'}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Waktu booking: {formatDate(order.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {order.status.toLowerCase() !== 'cancelled' && (
            <>
              <button
                onClick={handleCreatePublicTrackingLink}
                disabled={sharingTracking || !order.courier_name}
                className="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 disabled:opacity-50 disabled:hover:bg-primary/10 border border-primary/20 text-primary rounded-xl text-sm font-medium transition duration-200 flex items-center gap-2"
              >
                {sharingTracking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Bagikan Tracking
              </button>
              <button
                onClick={handleDownloadResi}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm font-medium transition duration-200 flex items-center gap-2"
              >
                <Download className="h-4 w-4" /> Download Resi
              </button>
            </>
          )}
          <button
            onClick={handleReportIssue}
            className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition duration-200 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" /> Laporkan Masalah
          </button>
        </div>
      </div>

      {/* No Courier Found Action Banner */}
      {order.status.toLowerCase() === 'no_courier_found' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-background p-6 shadow-xl backdrop-blur-md"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400">
                <AlertTriangle className="h-6 w-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  Belum Ada Kurir Ditemukan
                  <span className="inline-flex items-center rounded-full bg-orange-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-orange-300 border border-orange-500/30">
                    Pencarian Berakhir
                  </span>
                </h3>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  Pencarian otomatis telah selesai namun belum ada mitra kurir di sekitar area pick up yang menerima pesanan Anda. Anda dapat memulai ulang pencarian kurir sekarang atau membatalkan pesanan dengan pengembalian dana (refund) 100% secara otomatis.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={handleRetryMatching}
                disabled={retryingMatching || cancellingOrder}
                className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition duration-200 flex items-center gap-2 shadow-lg shadow-orange-500/20 active:scale-[0.98]"
              >
                {retryingMatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Coba Cari Kurir Lagi
              </button>
              <button
                onClick={() => setShowCancelModal(true)}
                disabled={retryingMatching || cancellingOrder}
                className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 border border-red-500/30 text-red-400 rounded-xl text-sm font-semibold transition duration-200 flex items-center gap-2 active:scale-[0.98]"
              >
                Batalkan & Ajukan Refund
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main 2 Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Tracking Column (Map) */}
        <div className="col-span-1 lg:col-span-5 space-y-6">
          <div className="relative aspect-square md:aspect-[4/3] lg:aspect-auto lg:h-[620px] bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
            {/* Elegant Header Layer on top of map */}
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between p-3.5 bg-background/80 backdrop-blur-md rounded-xl border border-white/10 select-none shadow-lg">
              <div className="flex items-center gap-3">
                <Navigation className={cn("h-5 w-5", order.status.toLowerCase() === 'cancelled' ? "text-slate-500" : "text-primary animate-pulse")} />
                <div>
                  <p className="text-xs text-muted-foreground leading-tight uppercase font-bold tracking-wider">
                    {order.status.toLowerCase() === 'cancelled' ? 'Status Pelacakan' : 'Live tracking'}
                  </p>
                  <p className="text-sm font-bold text-white">
                    {order.status.toLowerCase() === 'cancelled' 
                      ? 'Dibatalkan' 
                      : (tracking?.eta || (tracking?.location ? 'Lokasi kurir aktif' : 'Menunggu lokasi kurir'))}
                  </p>
                </div>
              </div>
              <span className={cn(
                "h-2 w-2 rounded-full",
                order.status.toLowerCase() === 'cancelled' ? "bg-slate-500" : tracking?.location ? "bg-green-500 animate-ping" : "bg-amber-400"
              )} />
            </div>

            {/* Premium Dynamic/Interactive Visual Map View or High Quality Simulated view */}
            <div className="flex-1 bg-zinc-950 p-6 flex flex-col justify-center items-center space-y-4 select-none relative overflow-hidden">
              {/* Map Grid Pattern */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:24px_24px]" />
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/30 via-transparent to-blue-950/30" />
              
              <Navigation className="h-10 w-10 text-primary/50 relative z-10" />
              <div className="text-center space-y-1 relative z-10">
                <h4 className="font-bold text-white tracking-tight">
                  {order.status.toLowerCase() === 'cancelled' ? 'Peta Pengiriman (Dibatalkan)' : 'Peta Pengiriman'}
                </h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  {order.status.toLowerCase() === 'cancelled' 
                    ? 'Pesanan dibatalkan. Tracking dihentikan.'
                    : tracking?.location
                      ? `Update terakhir ${formatTrackingTime(tracking.location.timestamp)}`
                      : trackingError || 'Lokasi kurir otomatis muncul setelah pekerjaan diterima dan tracking aktif.'}
                </p>
              </div>

              <div className="w-full max-w-xs bg-black/40 backdrop-blur-md p-4 border border-white/10 rounded-xl space-y-3.5 relative z-10">
                {tracking?.location && order.status.toLowerCase() !== 'cancelled' && (
                  <>
                    <div className="flex items-start gap-3">
                      <Truck className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Posisi kurir</p>
                        <p className="text-xs text-white max-w-[220px] truncate">
                          {tracking.location.latitude.toFixed(6)}, {tracking.location.longitude.toFixed(6)}
                        </p>
                      </div>
                    </div>
                    <div className="h-8 border-l-2 border-dashed border-white/10 ml-2.5" />
                  </>
                )}
                <div className="flex items-start gap-3 opacity-90">
                  <MapPin className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pickup Point</p>
                    <p className="text-xs text-white max-w-[190px] truncate" title={order.pickup_address}>
                      {order.pickup_address}
                    </p>
                  </div>
                </div>
                <div className="h-8 border-l-2 border-dashed border-white/10 ml-2.5 opacity-90" />
                <div className="flex items-start gap-3 opacity-90">
                  <MapPin className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Destination Point</p>
                    <p className="text-xs text-white max-w-[190px] truncate" title={order.dropoff_address}>
                      {order.dropoff_address}
                    </p>
                  </div>
                </div>
              </div>
              {tracking?.location && order.status.toLowerCase() !== 'cancelled' && (
                <a
                  href={`https://www.google.com/maps?q=${tracking.location.latitude},${tracking.location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:bg-primary/90"
                >
                  <MapPin className="h-4 w-4" /> Buka posisi kurir
                </a>
              )}
            </div>

            {/* Premium Courier Info Overlay Card */}
            <div className="p-4 bg-background/90 backdrop-blur-md border-t border-white/10 flex items-center justify-between gap-4">
              {order.status.toLowerCase() === 'cancelled' ? (
                <div className="flex items-center gap-3 text-red-500">
                  <AlertTriangle className="h-5 w-5" />
                  <p className="text-sm font-medium">Pesanan telah dibatalkan.</p>
                </div>
              ) : order.courier_name ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center font-bold text-primary select-none text-base">
                      {order.courier_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground leading-tight">Kurir Terpilih</p>
                      <p className="text-sm font-bold text-white">{order.courier_name}</p>
                      <p className="text-xs text-muted-foreground">
                        ⭐ {order.courier_rating || '5.0'} | {order.courier_vehicle || 'Motor'} ({order.courier_plate || '-'})
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className="p-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl transition duration-200 select-none shadow-sm"
                    aria-label="Buka obrolan dalam aplikasi"
                    title="Buka obrolan dalam aplikasi"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p className="text-sm font-medium italic">Mencari kurir terbaik untuk Anda...</p>
                </div>
              )}
            </div>
          </div>

          <RouteSnapshotPanel order={order} tracking={tracking} />

          {/* Inline Chat Module */}
          <div className="bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h4 className="text-sm font-bold">Obrolan dengan Kurir</h4>
            </div>
            <div 
              ref={chatScrollRef}
              className="h-[210px] bg-background/40 border border-white/5 rounded-xl p-3.5 overflow-y-auto space-y-3.5 scroll-smooth"
            >
              {chatsLoading && chatMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-30">
                  <MessageSquare className="h-8 w-8" />
                  <p className="text-[10px] font-medium uppercase tracking-widest">Belum ada percakapan</p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  const isMe = msg.sender_role === 'customer';
                  const isImage = msg.message_type === 'image';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[80%] space-y-1 ${
                        isMe ? 'ml-auto items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={cn(
                          "px-3.5 py-2.5 rounded-2xl text-xs font-normal leading-relaxed overflow-hidden",
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-tr-none shadow-md shadow-primary/20'
                            : 'bg-white/5 border border-white/5 text-white rounded-tl-none',
                          isImage && "p-1"
                        )}
                      >
                        {isImage ? (
                          <img 
                            src={`${api.defaults.baseURL}${msg.message}`} 
                            alt="Attachment" 
                            className="max-w-full rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(`${api.defaults.baseURL}${msg.message}`, '_blank')}
                          />
                        ) : (
                          msg.message
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground px-1 select-none">{formatTime(msg.created_at)}</span>
                    </div>
                  );
                })
              )}
            </div>

            <AnimatePresence>
              {previewImage && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 bg-muted/20 border border-white/5 rounded-xl flex items-center gap-3 mb-2"
                >
                  <div className="relative group">
                    <img src={previewImage} alt="Preview" className="h-14 w-14 object-cover rounded-lg border border-white/10" />
                    <button 
                      onClick={() => { setPreviewImage(null); setSelectedFile(null); }}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg"
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-primary uppercase">Gambar siap kirim</p>
                    <p className="text-[10px] text-muted-foreground">Klik kirim untuk mengunggah</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    setPreviewImage(URL.createObjectURL(file));
                  }
                }}
              />
              <button 
                type="button"
                disabled={!order.courier_name}
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:text-white transition-all disabled:opacity-50"
              >
                <ImageIcon size={18} />
              </button>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onPaste={handlePaste}
                disabled={!order.courier_name}
                placeholder={previewImage ? "Tambah keterangan..." : (order.courier_name ? "Ketik pesan atau paste gambar..." : "Menunggu kurir ditugaskan...")}
                className="flex-1 bg-background/50 border border-white/10 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition duration-200 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={(!chatInput.trim() && !previewImage) || !order.courier_name || uploading}
                className="p-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition duration-200 shadow-sm disabled:opacity-50 disabled:grayscale"
              >
                {uploading ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
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
                <p className="text-sm font-medium capitalize">{order.model || 'p2p'}</p>
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

          <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-primary" /> Bukti pickup, POD, dan pembatalan
              </h3>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
                {proofs.length} bukti
              </span>
            </div>

            {proofs.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-background/40 p-4 text-sm text-muted-foreground">
                Bukti operasional akan muncul setelah kurir melakukan scan pickup, foto barang, POD, atau pembatalan sebelum pickup.
              </div>
            ) : (
              <div className="space-y-4">
                {proofGroups.cancellation.map((proof) => (
                  <div key={proof.id} className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-red-400" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-red-100">{proof.proof_label || 'Bukti pembatalan pickup'}</p>
                        <p className="mt-1 text-xs leading-5 text-red-100/80">
                          {proof.reason_note || proof.override_reason?.replace(/^[^:]+:\s*/, '') || 'Kurir mengirim alasan pembatalan sebelum barang dipickup.'}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-red-100/60">{formatTrackingTime(proof.recorded_at || undefined)}</p>
                      </div>
                    </div>
                    {proof.photo_url && (
                      <button type="button" onClick={() => setActivePhoto(uploadUrl(proof.photo_url))} className="mt-3 overflow-hidden rounded-xl border border-red-500/20">
                        <img src={uploadUrl(proof.photo_url)} alt={proof.proof_label || 'Bukti pembatalan'} className="h-40 w-full object-cover transition hover:opacity-90" />
                      </button>
                    )}
                  </div>
                ))}

                {(['pickup', 'pod'] as const).map((group) => {
                  const groupProofs = proofGroups[group];
                  if (groupProofs.length === 0) return null;
                  return (
                    <div key={group} className="rounded-xl border border-white/10 bg-background/40 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        <p className="text-sm font-bold text-white">{group === 'pickup' ? 'Bukti pickup' : 'Bukti POD'}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {groupProofs.map((proof) => {
                          const imageUrl = uploadUrl(proof.photo_url || proof.image_urls?.[0]);
                          return (
                            <div key={proof.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <p className="text-sm font-semibold text-white">{proof.proof_label || proof.scan_type || 'Bukti pengiriman'}</p>
                              <p className="mt-1 text-[11px] font-medium text-muted-foreground">{formatTrackingTime(proof.recorded_at || undefined)}</p>
                              {imageUrl ? (
                                <button type="button" onClick={() => setActivePhoto(imageUrl)} className="mt-3 block overflow-hidden rounded-lg border border-white/10">
                                  <img src={imageUrl} alt={proof.proof_label || 'Bukti pengiriman'} className="h-36 w-full object-cover transition hover:opacity-90" />
                                </button>
                              ) : (
                                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
                                  Scan tercatat tanpa foto.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activePhoto && (
          <motion.button
            type="button"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActivePhoto(null)}
          >
            <img src={activePhoto} alt="Bukti pengiriman" className="max-h-[86vh] max-w-[92vw] rounded-2xl border border-white/10 object-contain shadow-2xl" />
          </motion.button>
        )}
      </AnimatePresence>

      <DisputeModal
        isOpen={isDisputeModalOpen}
        onClose={() => setIsDisputeModalOpen(false)}
        orderId={id as string}
        onSuccess={() => {
          addNotification({ title: 'Terkirim', message: 'Laporan Anda telah kami terima dan akan segera diproses.', type: 'success' });
        }}
      />

      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-card p-6 shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Konfirmasi Pembatalan</h3>
                    <p className="text-xs text-muted-foreground">Pengembalian dana 100% otomatis</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancellingOrder}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-white/5 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="my-5 space-y-3 text-sm text-muted-foreground">
                <p>
                  Apakah Anda yakin ingin membatalkan pesanan <strong className="text-white">{order.order_number}</strong>?
                </p>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Dana akan dikembalikan penuh (100%)
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Proses refund ke metode pembayaran awal atau saldo dompet Anda akan diproses secara instan oleh sistem.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancellingOrder}
                  className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white hover:bg-white/10 transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={cancellingOrder}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-semibold text-white transition flex items-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-50"
                >
                  {cancellingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Ya, Batalkan Pesanan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
