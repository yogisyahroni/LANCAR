'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  CheckCheck,
  Inbox,
  Megaphone,
  Package,
  Settings2,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clientLog } from '@/lib/clientLogger';
import { useNotificationStore } from '@/store/useNotificationStore';
import { sanitizeDeepLink } from '@/lib/deepLink';
import { Skeleton } from '@/components/ui/Skeleton';

interface DBNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  order_id?: string;
  metadata?: unknown;
  deep_link?: string;
}

type Category = 'semua' | 'order' | 'promo' | 'sistem';

const PAGE_SIZE = 20;

// Emitted after mutations so the layout bell badge can re-sync.
const NOTIFICATIONS_UPDATED_EVENT = 'tembus:notifications-updated';

const categorize = (type?: string): Exclude<Category, 'semua'> => {
  const t = (type || '').toLowerCase();
  if (t.includes('promo') || t.includes('campaign') || t.includes('voucher')) return 'promo';
  if (
    t.includes('order') ||
    t.includes('delivery') ||
    t.includes('pickup') ||
    t.includes('courier') ||
    t.includes('dispute') ||
    t.includes('payment') ||
    t.includes('wallet')
  ) {
    return 'order';
  }
  return 'sistem';
};

const CATEGORY_META: Record<Category, { label: string; icon: typeof Bell }> = {
  semua: { label: 'Semua', icon: Inbox },
  order: { label: 'Order', icon: Package },
  promo: { label: 'Promo', icon: Megaphone },
  sistem: { label: 'Sistem', icon: Settings2 },
};

const formatTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  const now = new Date();
  const sameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(parsed);
  }
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

export default function NotifikasiPage() {
  const router = useRouter();
  const { addNotification } = useNotificationStore();

  const [notifications, setNotifications] = useState<DBNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>('semua');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const notifyError = useCallback(
    (message: string) => {
      addNotification({ title: 'Gagal', message, type: 'error' });
    },
    [addNotification]
  );

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/auth/web/notifications');
      setNotifications(res.data?.notifications || []);
    } catch (error) {
      clientLog.error('Failed to fetch notifications', { error });
      setNotifications([]);
      notifyError('Tidak dapat memuat daftar notifikasi.');
    } finally {
      setIsLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const filtered = useMemo(() => {
    if (activeCategory === 'semua') return notifications;
    return notifications.filter((n) => categorize(n.type) === activeCategory);
  }, [notifications, activeCategory]);

  const visible = filtered.slice(0, visibleCount);

  const markOneRead = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.patch(`/auth/web/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
      return true;
    } catch (error) {
      clientLog.error('Failed to mark notification as read', { error });
      return false;
    }
  }, []);

  const handleItemClick = async (notif: DBNotification) => {
    if (!notif.is_read) {
      void markOneRead(notif.id);
    }
    if (notif.deep_link) {
      // S3-CW-03/03b: same sanitization + route allowlist as the layout bell dropdown
      const safeLink = sanitizeDeepLink(notif.deep_link);
      if (safeLink) {
        router.push(safeLink);
      } else {
        clientLog.warn('Blocked suspicious deep_link from notification', { raw: notif.deep_link });
      }
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    setIsMutating(true);
    const results = await Promise.allSettled(unread.map((n) => api.patch(`/auth/web/notifications/${n.id}/read`)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: results[unread.findIndex((u) => u.id === n.id)]?.status === 'fulfilled' ? true : n.is_read }))
    );
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
    setIsMutating(false);
    if (failed > 0) {
      notifyError(`${failed} notifikasi gagal ditandai dibaca.`);
    }
  };

  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    setIsMutating(true);
    try {
      await api.delete('/auth/web/notifications');
      setNotifications([]);
      setVisibleCount(PAGE_SIZE);
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
    } catch (error) {
      clientLog.error('Failed to clear notifications', { error });
      notifyError('Gagal menghapus semua notifikasi.');
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-foreground">
            <span className="relative rounded-2xl bg-primary-soft p-2.5 text-primary dark:bg-primary/20 dark:text-brand-emerald-300">
              <Bell className="h-6 w-6" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-black text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
            Notifikasi
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} notifikasi belum dibaca.`
              : 'Semua notifikasi sudah dibaca.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={isMutating || unreadCount === 0}
            className="flex items-center gap-2 rounded-xl border border-black/10 bg-black/5 px-4 py-2.5 text-sm font-bold text-zinc-600 transition-all hover:bg-black/10 disabled:pointer-events-none disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            <CheckCheck className={`h-4 w-4 ${isMutating ? 'animate-pulse' : ''}`} />
            Tandai Dibaca
          </button>
          <button
            type="button"
            onClick={() => void handleClearAll()}
            disabled={isMutating || notifications.length === 0}
            className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-600 transition-all hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-40 dark:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            Hapus Semua
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div role="tablist" aria-label="Filter kategori notifikasi" className="mb-5 flex flex-wrap gap-2">
        {(Object.keys(CATEGORY_META) as Category[]).map((category) => {
          const meta = CATEGORY_META[category];
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => {
                setActiveCategory(category);
                setVisibleCount(PAGE_SIZE);
              }}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'border border-black/10 bg-black/5 text-zinc-600 hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10'
              }`}
            >
              <meta.icon className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <ul className="list-none space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Skeleton className="h-20 w-full" />
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="glass-card flex flex-col items-center rounded-2xl p-12 text-center">
          <BellOff className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm font-semibold text-foreground">
            {activeCategory === 'semua' ? 'Belum ada notifikasi' : `Tidak ada notifikasi ${CATEGORY_META[activeCategory].label.toLowerCase()}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Notifikasi order, promo, dan sistem akan muncul di sini.
          </p>
        </div>
      ) : (
        <>
          <ul className="list-none space-y-3" aria-live="polite" aria-busy={isMutating}>
            {visible.map((notif, index) => {
              const category = categorize(notif.type);
              const CategoryIcon = CATEGORY_META[category].icon;
              return (
                <motion.li
                  key={notif.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.25) }}
                >
                  <article
                    className={notif.is_read ? 'opacity-60' : ''}
                    aria-label={`${notif.title}${notif.is_read ? '' : ' (belum dibaca)'}`}
                  >
                    <button
                      type="button"
                      onClick={() => void handleItemClick(notif)}
                      className={`w-full rounded-2xl border p-4 text-left transition-all ${
                        notif.is_read
                          ? 'border-transparent bg-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
                          : 'border-black/10 bg-white/60 backdrop-blur-md hover:border-primary/30 dark:border-white/10 dark:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 shrink-0 rounded-xl p-2 ${
                            notif.is_read
                              ? 'text-muted-foreground'
                              : 'bg-primary-soft text-primary dark:bg-brand-emerald-500/15 dark:text-brand-emerald-300'
                          }`}
                        >
                          <CategoryIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h2 className="truncate text-sm font-bold text-foreground">{notif.title}</h2>
                            {!notif.is_read && (
                              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary-light" aria-hidden="true" />
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{notif.body}</p>
                          <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                            {CATEGORY_META[category].label} · {formatTime(notif.created_at)}
                          </span>
                        </div>
                      </div>
                    </button>
                  </article>
                </motion.li>
              );
            })}
          </ul>

          {/* Load more (client-side paging — API returns full list) */}
          {filtered.length > visibleCount && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="rounded-xl border border-black/10 bg-black/5 px-6 py-3 text-sm font-bold text-zinc-600 transition-all hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                Muat Lebih Banyak ({filtered.length - visibleCount} lagi)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
