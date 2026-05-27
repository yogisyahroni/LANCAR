'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BellRing, X, Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useNotificationStore } from '@/store/useNotificationStore';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

export default function PushNotificationPrompt() {
  const { addNotification } = useNotificationStore();
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Determine whether to display the notification banner
    if (typeof window === 'undefined') return;
    
    const wasPrompted = localStorage.getItem('tembus_push_prompted');
    if (wasPrompted === 'true') return;

    if ('Notification' in window && 'serviceWorker' in navigator) {
      if (Notification.permission === 'default') {
        // Delay popup slightly for a premium, non-intrusive feel
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tembus_push_prompted', 'true');
    }
  };

  const handleEnablePush = async () => {
    if (typeof window === 'undefined') return;

    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        localStorage.setItem('tembus_push_prompted', 'true');

        // Check if there's an active Service Worker
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          if (!VAPID_PUBLIC_KEY) {
            throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured');
          }

          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });
          const serializedSubscription = subscription.toJSON();

          // Post to our updated subscription backend route
          await api.post('/auth/web/notifications/subscribe', {
            endpoint: subscription.endpoint,
            keys: serializedSubscription.keys || { p256dh: '', auth: '' }
          });

          addNotification({
            title: 'Berhasil Aktif',
            message: 'Browser push notifications berhasil diaktifkan.',
            type: 'success'
          });
        }
      } else {
        addNotification({
          title: 'Akses Ditolak',
          message: 'Browser push notifications tidak diizinkan oleh pengguna.',
          type: 'info'
        });
      }
    } catch (error) {
      console.error('Error activating push notification:', error);
      addNotification({
        title: 'Error',
        message: 'Gagal mengaktifkan push notifications.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
      setIsVisible(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-6 right-6 max-w-sm w-full bg-card/80 backdrop-blur-xl border border-primary/30 rounded-2xl p-5 shadow-2xl z-50 flex flex-col gap-3 select-none"
        >
          <div className="flex items-start justify-between gap-4 select-none">
            <div className="flex items-center gap-3 select-none">
              <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary flex-shrink-0 select-none">
                <BellRing className="h-5 w-5" />
              </div>
              <div className="select-none">
                <h4 className="text-sm font-extrabold text-foreground tracking-tight select-none leading-none">
                  Aktifkan Notifikasi
                </h4>
                <p className="text-[11px] text-muted-foreground mt-1 select-none leading-relaxed">
                  Dapatkan info status pengiriman dan promo menarik langsung di browser Anda.
                </p>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="p-1 text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-all cursor-pointer select-none"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 select-none">
            <button
              onClick={handleEnablePush}
              disabled={isLoading}
              className="flex-1 py-2 bg-primary hover:bg-primary/90 disabled:opacity-70 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1 select-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Mengaktifkan...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Izinkan Notifikasi
                </>
              )}
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-bold text-xs rounded-xl transition-all cursor-pointer select-none"
            >
              Nanti
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
