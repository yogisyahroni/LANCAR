'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, MessageSquare, Loader2, X, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { useNotificationStore } from '@/store/useNotificationStore';

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  message_type: 'text' | 'image';
  created_at: string;
}

interface DisputeChatProps {
  disputeId: string;
  onClose: () => void;
}

export default function DisputeChat({ disputeId, onClose }: DisputeChatProps) {
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const currentUserId = user?.id;

  const { data: messages = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dispute-chats', disputeId],
    queryFn: async () => {
      const res = await api.get(`/auth/web/disputes/${disputeId}/chats`);
      return res.data.data;
    }
  });

  const sendMutation = useMutation({
    mutationFn: async ({ text, type = 'text' }: { text: string, type?: 'text' | 'image' }) => {
      await api.post(`/auth/web/disputes/${disputeId}/chats`, { message: text, message_type: type });
    },
    onSuccess: () => {
      setMessage('');
      setPreviewImage(null);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['dispute-chats', disputeId] });
    },
    onError: () => addNotification({ title: 'Gagal', message: 'Gagal mengirim pesan', type: 'error' })
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!currentUserId) return;
    const socket = getSocket(currentUserId);
    if (!socket) return;

    // Join dispute room
    socket.emit('join_dispute_room', { dispute_id: disputeId });

    const handleNewMessage = (newMsg: Message) => {
      queryClient.setQueryData(['dispute-chats', disputeId], (old: any) => {
        const list = old || [];
        if (list.find((m: any) => m.id === newMsg.id)) return list;
        return [...list, newMsg];
      });
    };

    socket.on('new_dispute_chat', handleNewMessage);

    return () => {
      socket.off('new_dispute_chat', handleNewMessage);
      socket.emit('leave_dispute_room', { dispute_id: disputeId });
    };
  }, [currentUserId, disputeId, queryClient]);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await api.post(`/auth/web/disputes/${disputeId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (res.data.success) {
        sendMutation.mutate({ text: res.data.url, type: 'image' });
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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (previewImage && selectedFile) {
      handleFileUpload(selectedFile);
      return;
    }
    if (!message.trim() || sendMutation.isPending) return;
    sendMutation.mutate({ text: message });
  };

  const triggerFileInput = () => fileInputRef.current?.click();
  const errorMessage = (error as any)?.response?.data?.message || (error as any)?.message || 'Riwayat chat belum bisa dimuat dari database.';

  return (
    <div className="flex flex-col h-[550px] w-full bg-white dark:bg-zinc-900 rounded-2xl border border-border overflow-hidden shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <MessageSquare size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Chat Bantuan</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Dispute Resolution</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-all">
          <X size={20} />
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-primary" size={24} />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 text-center px-6">
            <MessageSquare size={32} className="text-destructive" />
            <div>
              <p className="text-sm font-bold text-foreground">Chat gagal dimuat</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold hover:bg-destructive/20 transition-all"
            >
              <RefreshCw size={14} />
              Coba Lagi
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MessageSquare size={32} opacity={0.2} />
            <p className="text-xs font-medium">Belum ada pesan</p>
          </div>
        ) : (
          messages.map((msg: Message) => {
            const isMe = msg.sender_id === currentUserId;
            const isImage = msg.message_type === 'image';
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[85%]",
                  isMe ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {isMe ? 'Anda' : msg.sender_role === 'customer' ? msg.sender_name : 'Admin Tembus'}
                  </span>
                  <span className="text-[9px] text-zinc-400">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className={cn(
                  "px-1 py-1 rounded-2xl text-sm shadow-sm overflow-hidden",
                  isMe 
                    ? "bg-primary text-white rounded-tr-none" 
                    : "bg-muted text-foreground rounded-tl-none border border-border",
                  !isImage && "px-4 py-2.5"
                )}>
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
              </div>
            );
          })
        )}
      </div>

      {/* Preview Section */}
      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3 bg-muted/50 border-t border-border flex items-center gap-3"
          >
            <div className="relative group">
              <img src={previewImage} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-border" />
              <button 
                onClick={() => { setPreviewImage(null); setSelectedFile(null); }}
                className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full shadow-lg"
              >
                <X size={10} />
              </button>
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-primary uppercase">Gambar siap kirim</p>
              <p className="text-[10px] text-muted-foreground">Klik kirim untuk mengunggah screenshot ini</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 bg-muted/20 border-t border-border">
        <div className="relative flex items-center gap-2">
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
            onClick={triggerFileInput}
            className="p-2.5 rounded-xl bg-background border border-border text-muted-foreground hover:text-foreground transition-all"
          >
            <ImageIcon size={18} />
          </button>
          <input 
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onPaste={handlePaste}
            placeholder={previewImage ? "Tambah keterangan..." : "Ketik pesan atau paste gambar..."}
            className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
          <button 
            type="submit"
            disabled={(!message.trim() && !previewImage) || sendMutation.isPending || uploading}
            className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {sendMutation.isPending || uploading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
