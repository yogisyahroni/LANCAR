'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { getSocket, joinOrderRoom, leaveOrderRoom } from '@/lib/socket';
import { clientLog } from '@/lib/clientLogger';
import { api } from '@/lib/api';
import {
  ChatMessage,
  Event,
  OnDemandRealtimePayload,
  Order,
  TrackingData,
  TrackingProof,
} from './orderDetailTypes';
import { createClientMessageId } from './orderDetailUtils';

export function useOrderDetailRuntime(id: string) {
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();
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
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
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
      if (res.data?.success) setChatMessages(res.data.chats || []);
    } catch (error) {
      clientLog.error('Failed to fetch customer order chats', { error, orderId: id });
    } finally {
      setChatsLoading(false);
    }
  }, [id]);

  const fetchOrderDetail = useCallback(async (showLoader = true) => {
    if (!id) return;
    if (showLoader) setLoading(true);
    try {
      const res = await api.get(`/auth/web/orders/${id}`);
      if (res.data?.success) {
        setOrder({ ...res.data.order, food_items: res.data.food_items || res.data.order?.food_items || [] });
        setEvents(res.data.events || []);
        setProofs(res.data.proofs || []);
        if (showLoader) void fetchOrderChats();
      }
    } catch (error) {
      clientLog.error('Failed to fetch customer order detail', { error, orderId: id });
      if (showLoader) addNotification({ title: 'Gagal', message: 'Gagal mengambil detail order.', type: 'error' });
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [addNotification, fetchOrderChats, id]);

  const fetchTracking = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get('/tracking', { params: { order_id: id } });
      setTracking(res.data?.data || res.data || null);
      setTrackingError('');
    } catch (error: any) {
      setTrackingError(error?.response?.data?.message || 'Tracking belum tersedia.');
    }
  }, [id]);

  useEffect(() => {
    if (!user?.id || !id) return;
    const socket = getSocket(user.id, 'customer');
    if (!socket) return;
    joinOrderRoom(id);

    const appendChat = (chat?: ChatMessage) => {
      if (!chat || chat.order_id !== id) return;
      setChatMessages((previous) => previous.some((message) => message.id === chat.id)
        ? previous
        : [...previous, chat]);
    };
    const applyTrackingPayload = (payload: OnDemandRealtimePayload) => {
      if (payload.order_id !== id) return;
      if (payload.location) {
        setTracking((previous) => ({ courier_id: previous?.courier_id || '', ...previous, location: payload.location }));
        setTrackingError('');
      }
      void fetchTracking();
    };
    const handleOnDemandEvent = (payload: OnDemandRealtimePayload) => {
      if (payload.order_id !== id) return;
      if (payload.event === 'chat_message') {
        appendChat(payload.chat);
        return;
      }
      if (payload.event === 'tracking_updated') applyTrackingPayload(payload);
      if (['offer_accepted', 'courier_otw_pickup', 'pickup_verified', 'delivery_started', 'pod_completed', 'pickup_cancelled'].includes(payload.event)) {
        void fetchOrderDetail(false);
        void fetchTracking();
      }
    };
    const handleLegacyTracking = (payload: OnDemandRealtimePayload) => applyTrackingPayload(payload);

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
  }, [fetchOrderDetail, fetchTracking, id, user?.id]);

  useEffect(() => { void fetchOrderDetail(); }, [fetchOrderDetail]);
  useEffect(() => {
    if (!id) return;
    const interval = window.setInterval(() => void fetchOrderDetail(false), 8000);
    return () => window.clearInterval(interval);
  }, [fetchOrderDetail, id]);
  useEffect(() => {
    if (!id) return;
    void fetchTracking();
    const interval = window.setInterval(() => void fetchTracking(), 5000);
    return () => window.clearInterval(interval);
  }, [fetchTracking, id]);
  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const sendMessage = async (text: string, type = 'text') => {
    try {
      const res = await api.post(`/auth/web/orders/${id}/chats`, { message: text, message_type: type, client_message_id: createClientMessageId() });
      if (res.data?.success) {
        setChatMessages((previous) => [...previous, res.data.chat]);
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

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/auth/web/orders/${id}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.success) await sendMessage(res.data.url, 'image');
    } catch {
      addNotification({ title: 'Gagal', message: 'Gagal mengunggah gambar', type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    for (const item of Array.from(event.clipboardData.items)) {
      if (!item.type.includes('image')) continue;
      const file = item.getAsFile();
      if (file) {
        setSelectedFile(file);
        setPreviewImage(URL.createObjectURL(file));
      }
    }
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (previewImage && selectedFile) {
      await handleFileUpload(selectedFile);
      return;
    }
    if (chatInput.trim()) await sendMessage(chatInput, 'text');
  };

  const handleDownloadResi = () => {
    if (id) window.open(`/resi/${id}`, '_blank');
  };

  const handleReportIssue = () => setIsDisputeModalOpen(true);

  const handleCreatePublicTrackingLink = async () => {
    if (!id) return;
    setSharingTracking(true);
    try {
      const res = await api.post(`/auth/web/orders/${id}/public-tracking-link`);
      const url = res.data?.data?.url;
      if (!url) throw new Error('Public tracking URL missing');
      await navigator.clipboard.writeText(url);
      addNotification({ title: 'Link disalin', message: 'Link tracking publik siap dibagikan ke penerima.', type: 'success' });
    } catch (error: any) {
      addNotification({ title: 'Belum bisa dibagikan', message: error?.response?.data?.message || 'Link tracking bisa dibuat setelah kurir menerima pekerjaan.', type: 'error' });
    } finally {
      setSharingTracking(false);
    }
  };

  const handleRetryMatching = async () => {
    if (!id) return;
    setRetryingMatching(true);
    try {
      const res = await api.post(`/auth/web/orders/${id}/retry-matching`);
      addNotification({ title: 'Pencarian Ulang Dimulai', message: res.data?.message || 'Kami sedang mencari kurir untuk pesanan Anda kembali.', type: 'success' });
      await fetchOrderDetail(false);
    } catch (error: any) {
      addNotification({ title: 'Gagal Mencari Ulang', message: error?.response?.data?.error || 'Terjadi kesalahan saat memulai ulang pencarian kurir.', type: 'error' });
    } finally {
      setRetryingMatching(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!id) return;
    setCancellingOrder(true);
    try {
      const res = await api.post(`/auth/web/orders/${id}/cancel`, { reason: 'Dibatalkan oleh pelanggan (Kurir tidak ditemukan)' });
      addNotification({ title: 'Pesanan Dibatalkan', message: res.data?.message || 'Pesanan Anda telah dibatalkan. Pengembalian dana (refund) diproses secara otomatis.', type: 'success' });
      setShowCancelModal(false);
      await fetchOrderDetail(false);
    } catch (error: any) {
      addNotification({ title: 'Gagal Membatalkan', message: error?.response?.data?.error || 'Pesanan tidak dapat dibatalkan saat ini.', type: 'error' });
    } finally {
      setCancellingOrder(false);
    }
  };

  return {
    user, addNotification, order, events, proofs, isDisputeModalOpen, setIsDisputeModalOpen,
    tracking, trackingError, loading, chatsLoading, sharingTracking, retryingMatching,
    cancellingOrder, showCancelModal, setShowCancelModal, activePhoto, setActivePhoto,
    chatInput, setChatInput, chatMessages, uploading, previewImage, setPreviewImage,
    selectedFile, setSelectedFile, chatScrollRef, fileInputRef, handleFileUpload,
    handlePaste, handleSendMessage, handleCreatePublicTrackingLink, handleRetryMatching,
    handleCancelOrder, handleDownloadResi, handleReportIssue,
  };
}
