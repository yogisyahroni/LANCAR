'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useAuthStore } from '@/store/authStore';
import { getSocket, joinOrderRoom, leaveOrderRoom } from '@/lib/socket';
import { clientLog } from '@/lib/clientLogger';
import { ArrowLeft, MapPin, Truck, Calendar, Phone, CheckCircle2, MessageSquare, Download, AlertTriangle, Send, Loader2, Sparkles, Navigation, Image as ImageIcon, X, Share2, RefreshCw, FileSignature, UtensilsCrossed, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DisputeModal } from '@/components/orders/DisputeModal';
import { Order, Event, FoodOrderItem, RouteSnapshot, ChatMessage, TrackingData, TrackingProof, OnDemandRealtimePayload } from './orderDetailTypes';
import { createClientMessageId, decodePolyline, buildSvgRoute } from './orderDetailUtils';
import { RouteSnapshotPanel } from './RouteSnapshotPanel';
import { OrderDetailContent } from './OrderDetailContent';





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
        setOrder({
          ...res.data.order,
          food_items: res.data.food_items || res.data.order?.food_items || []
        });
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
  const serviceProofs = [
    ...(order?.tambal_ban_report ? [
      { label: 'Foto ban sebelum', url: order.tambal_ban_report.tire_photo_before_url },
      { label: 'Foto ban sesudah', url: order.tambal_ban_report.tire_photo_after_url },
    ] : []),
    ...(order?.towing_report ? [
      { label: 'Foto kendaraan sebelum', url: order.towing_report.vehicle_photo_before_url },
      { label: 'Foto loading', url: order.towing_report.loading_photo_url },
      { label: 'Foto unloading', url: order.towing_report.unloading_photo_url },
      { label: 'Foto completion', url: order.towing_report.completion_photo_url },
      { label: 'Tanda tangan penerima', url: order.towing_report.signature_url, signature: true },
    ] : []),
  ].filter((proof) => proof.url);
  const serviceReportNotes = order?.tambal_ban_report?.notes || order?.towing_report?.notes || '';
  const foodItems = order?.food_items || [];
  const packageDetails = order?.package_details || {};
  const packageDimensions = packageDetails.dimensions || {};
  const packageLength = Number(packageDetails.length_cm ?? packageDimensions.length ?? 0);
  const packageWidth = Number(packageDetails.width_cm ?? packageDimensions.width ?? 0);
  const packageHeight = Number(packageDetails.height_cm ?? packageDimensions.height ?? 0);
  const packageWeight = Number(packageDetails.weight_kg ?? 0);
  const packageCount = Number(packageDetails.package_count ?? packageDetails.count ?? 0);
  const hasPackageDetails = Boolean(
    packageDetails.category ||
    packageDetails.item_description ||
    packageDetails.description ||
    packageDetails.size_tier ||
    packageCount > 0 ||
    packageWeight > 0 ||
    packageLength > 0 ||
    packageWidth > 0 ||
    packageHeight > 0
  );

  const getStatusBadgeClass = (statusStr: string) => {
    switch (statusStr?.toLowerCase()) {
      case 'created':
      case 'pending':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'picked_up':
      case 'in_transit':
      case 'delivering':
        return 'bg-info/10 text-info border-info/20 animate-pulse';
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
    <OrderDetailContent
      order={order}
      tracking={tracking}
      events={events}
      proofs={proofs}
      proofGroups={proofGroups}
      serviceProofs={serviceProofs}
      serviceReportNotes={serviceReportNotes}
      foodItems={foodItems}
      packageCount={packageCount}
      packageDetails={packageDetails}
      activePhoto={activePhoto}
      isDisputeModalOpen={isDisputeModalOpen}
      showCancelModal={showCancelModal}
      cancellingOrder={cancellingOrder}
      retryingMatching={retryingMatching}
      sharingTracking={sharingTracking}
      uploading={uploading}
      loading={loading}
      trackingError={trackingError}
      chatMessages={chatMessages}
      chatInput={chatInput}
      chatsLoading={chatsLoading}
      fileInputRef={fileInputRef}
      chatScrollRef={chatScrollRef}
      selectedFile={selectedFile}
      previewImage={previewImage}
      id={id}
      uploadUrl={uploadUrl}
      formatDate={formatDate}
      formatPrice={formatPrice}
      formatTrackingTime={formatTrackingTime}
      getStatusBadgeClass={getStatusBadgeClass}
      addNotification={addNotification}
      handleCreatePublicTrackingLink={handleCreatePublicTrackingLink}
      handleDownloadResi={handleDownloadResi}
      handleReportIssue={handleReportIssue}
      handleRetryMatching={handleRetryMatching}
      handleCancelOrder={handleCancelOrder}
      handleSendMessage={handleSendMessage}
      handleFileUpload={handleFileUpload}
      handlePaste={handlePaste}
      setShowCancelModal={setShowCancelModal}
      setActivePhoto={setActivePhoto}
      setIsDisputeModalOpen={setIsDisputeModalOpen}
      setChatInput={setChatInput}
      setSelectedFile={setSelectedFile}
      setPreviewImage={setPreviewImage}
      api={api}
      cn={cn}
      formatTime={formatTime}
      Calendar={Calendar}
      hasPackageDetails={hasPackageDetails}
      MapPin={MapPin}
      Navigation={Navigation}
      Package={Package}
      packageHeight={packageHeight}
      packageLength={packageLength}
      packageWeight={packageWeight}
      packageWidth={packageWidth}
      Phone={Phone}
      Truck={Truck}
      UtensilsCrossed={UtensilsCrossed}
    />
  );
}
