'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { api } from '@/lib/api';
import {
  LayoutDashboard, 
  Package, 
  BarChart3, 
  Settings, 
  LogOut, 
  Layers, 
  Sun, 
  Moon, 
  Bell, 
  Search, 
  User, 
  X, 
  ChevronRight,
  MapPin,
  Menu,
  ChevronLeft,
  AlertTriangle,
  Key,
  Ticket,
  Link as LinkIcon
} from 'lucide-react';
import { CustomerPageSkeleton } from '@/components/ui/Skeleton';
import { NetworkStatusBanner } from '@/components/ui/AsyncRecoveryState';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import PushNotificationPrompt from '@/components/PushNotificationPrompt';
import WalletWidget from '@/components/WalletWidget';
import { cn } from '@/lib/utils';
import { clientLog } from '@/lib/clientLogger';
import { sanitizeDeepLink } from '@/lib/deepLink';

import { getSocket, disconnectSocket } from '@/lib/socket';
import { clearCustomerOrderDraft } from '@/components/orders/OrderSchemas';

interface DBNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  order_id?: string;
  metadata?: any;
  deep_link?: string;
}

// S3-CW-03: deep_link validation extracted to @/lib/deepLink (shared with /notifikasi page)

/**
 * Emitted by notification pages after mark-read/clear mutations so the bell
 * badge in this layout can re-sync without a full reload.
 */
const NOTIFICATIONS_UPDATED_EVENT = 'tembus:notifications-updated';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, setAuth, setLoading, user } = useAuthStore();
  const { notifications, addNotification, removeNotification } = useNotificationStore();
  const router = useRouter();
  const pathname = usePathname();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [bellNotifications, setBellNotifications] = useState<DBNotification[]>([]);

  // Socket initialization
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const socket = getSocket(user.id);
      if (socket) {
        socket.on('new_notification', (notif: DBNotification) => {
          clientLog.debug('Customer notification received', {
            type: notif.type,
            hasOrder: Boolean(notif.order_id),
            hasDeepLink: Boolean(notif.deep_link),
          });
          // Add to toast
          addNotification({
            title: notif.title,
            message: notif.body,
            type: 'info'
          });
          // Add to bell list
          setBellNotifications(prev => {
            // Avoid duplicates
            if (prev.find(n => n.id === notif.id)) return prev;
            return [notif, ...prev];
          });
          
          // If it's a dispute chat, we might want to refresh current chat view if open
          if (notif.type === 'dispute_chat') {
             // Dispatch a custom event for local components to listen to
             window.dispatchEvent(new CustomEvent('new_dispute_chat_notification', { detail: notif }));
          }
        });
      }
    }

    return () => {
      // We don't necessarily want to disconnect on every re-render, 
      // but if the layout unmounts or auth changes, we might.
      // For a persistent layout, this runs on unmount.
    };
  }, [isAuthenticated, user?.id, addNotification]);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.get('/auth/web/me');
        setAuth(true, response.data.user);
      } catch (error) {
        clientLog.error('Auth check failed', { error });
        setAuth(false, null);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    if (!isAuthenticated && isLoading) {
      checkAuth();
    } else if (!isAuthenticated && !isLoading) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router, setAuth, setLoading]);

  // Initial fetch for notifications + re-sync when notification pages mutate them
  const fetchBellNotifications = useCallback(async () => {
    if (isAuthenticated) {
      try {
        const res = await api.get('/auth/web/notifications');
        setBellNotifications(res.data.notifications || []);
      } catch (error) {
        clientLog.error('Failed to fetch notifications', { error });
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void fetchBellNotifications();
  }, [fetchBellNotifications]);

  useEffect(() => {
    const handler = () => void fetchBellNotifications();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handler);
  }, [fetchBellNotifications]);

  // Command palette state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Notifications & User dropdowns
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserOpen, setIsUserOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await api.post('/auth/web/logout');
    } catch (error) {
      clientLog.error('Logout failed', { error });
    } finally {
      clearCustomerOrderDraft();
      setAuth(false, null);
      router.push('/login');
    }
  };

  // Navigation Items — only customer-facing pages
  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Payment Links', href: '/payment-links', icon: LinkIcon },
    { name: 'Katalog Produk', href: '/products', icon: Package },
    { name: 'Kirim Paket', href: '/orders/new', icon: Package },
    { name: 'Kirim Massal', href: '/orders/bulk', icon: Layers },
    { name: 'Riwayat Order', href: '/orders', icon: Package },
    { name: 'Pusat Bantuan', href: '/disputes', icon: AlertTriangle },
    { name: 'Resi Management', href: '/resi', icon: Layers },
    { name: 'Voucher & Promo', href: '/voucher', icon: Ticket },
    { name: 'Buku Alamat', href: '/alamat', icon: MapPin },
    { name: 'Laporan UMKM', href: '/laporan', icon: BarChart3 },
    { name: 'Notifikasi', href: '/notifikasi', icon: Bell },
    { name: 'Profil & Settings', href: '/profil', icon: Settings },
  ];

  const orderCreationRoutes = ['/orders/new', '/orders/bulk'];
  const isNavigationItemActive = (href: string) => {
    if (href === '/orders') {
      return (
        pathname === href ||
        (
          pathname.startsWith('/orders/') &&
          !orderCreationRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
        )
      );
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Theme support
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  // Top fake progress/loading bar during navigation
  const [isNavigating, setIsNavigating] = useState(false);
  useEffect(() => {
    setIsNavigating(true);
    const timer = setTimeout(() => setIsNavigating(false), 500);
    return () => clearTimeout(timer);
  }, [pathname]);

  const filteredSearchItems = navItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-background p-6">
        <CustomerPageSkeleton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden transition-colors duration-300">
      
      {/* Background decoration */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/20 rounded-full blur-[100px]" />
      </div>

      {/* Top fake progress bar */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="fixed top-0 left-0 h-1 bg-primary z-[120] pointer-events-none shadow-[0_0_10px_rgba(34,197,94,0.7)]"
          />
        )}
      </AnimatePresence>

      <NetworkStatusBanner />

      {/* Sidebar - Desktop */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 80 : 280 }}
        className="hidden lg:flex flex-col border-r border-black/5 dark:border-white/5 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-xl relative z-30 transition-colors duration-300"
      >
        <div className="p-6 h-20 flex items-center justify-between shrink-0">
          {!isCollapsed ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3"
            >
              <img src="/tembusweb.svg" alt="Tembus" className="h-10 object-contain drop-shadow-md" />
            </motion.div>
          ) : (
            <div className="h-10 w-10 overflow-hidden flex items-center justify-center mx-auto">
              <img src="/tembusweb.svg" alt="Tembus" className="h-10 w-auto max-w-none object-cover object-left drop-shadow-md -ml-3" />
            </div>
          )}
        </div>
        
        <WalletWidget isCollapsed={isCollapsed} />
        
        <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto">
          {navItems.map((item) => {
            const active = isNavigationItemActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <motion.div
                  whileHover={{ x: 4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 group mb-1",
                    active 
                      ? "bg-primary text-white shadow-lg shadow-primary/20" 
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5 flex-shrink-0 transition-colors", active ? "text-white" : "group-hover:text-primary-light")} />
                  {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.name}</span>}
                </motion.div>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-black/5 dark:border-white/5 shrink-0">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-foreground transition-all group"
          >
            <ChevronLeft className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", isCollapsed && "rotate-180")} />
          </button>
        </div>
      </motion.aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-background z-[101] lg:hidden flex flex-col p-6 border-r border-border/40"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <img src="/tembusweb.svg" alt="Tembus" className="h-10 object-contain drop-shadow-md" />
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-muted-foreground hover:bg-muted rounded-xl transition-all">
                  <X size={24} />
                </button>
              </div>
              
              <WalletWidget />
              
              <nav className="space-y-1 overflow-y-auto flex-1 mt-4">
                {navItems.map((item) => {
                  const active = isNavigationItemActive(item.href);
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                      <div className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 mb-1",
                          active 
                            ? "bg-primary text-white shadow-lg shadow-primary/20" 
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
                        )}
                      >
                        <item.icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-white" : "text-zinc-500 dark:text-zinc-400")} />
                        <span className="font-medium whitespace-nowrap">{item.name}</span>
                      </div>
                    </Link>
                  )
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        {/* Topbar */}
        <header className="h-20 border-b border-black/5 dark:border-white/5 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50 transition-colors duration-300">
          <div className="flex items-center gap-4 flex-1">
            <button 
              className="lg:hidden p-2.5 text-zinc-500 dark:text-zinc-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="relative max-w-md w-full hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Cari order, resi, atau menu..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.length > 0) setIsSearchOpen(true);
                  else setIsSearchOpen(false);
                }}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-500 dark:placeholder:text-zinc-600 text-foreground"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-black/10 dark:border-white/10 text-zinc-500 font-mono">
                Ctrl K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="relative p-2.5 text-zinc-500 dark:text-zinc-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all"
              title="Toggle theme"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* Notification */}
            <div className="relative">
              <button 
                onClick={() => {
                  setIsNotifOpen(!isNotifOpen);
                  setIsUserOpen(false);
                }}
                className="relative p-2.5 text-zinc-500 dark:text-zinc-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all"
              >
                <Bell className="h-5 w-5" />
                {bellNotifications.some(n => !n.is_read) && (
                  <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-primary-light rounded-full border-2 border-background" />
                )}
              </button>
              <AnimatePresence>
                {isNotifOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsNotifOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl rounded-2xl p-4 flex flex-col max-h-[380px] z-50 select-none"
                    >
                      <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-2 mb-2">
                        <span className="text-xs font-semibold text-foreground">Notifications</span>
                        <button 
                          onClick={async () => {
                            try {
                              await api.delete('/auth/web/notifications');
                              setBellNotifications([]);
                            } catch (e) { clientLog.error('Failed to clear notifications', { error: e }); }
                          }}
                          className="text-[10px] text-primary hover:underline"
                        >
                          Clear All
                        </button>
                      </div>
                      <div className="overflow-y-auto space-y-2 flex-1 scrollbar-hide">
                        {bellNotifications.length > 0 ? (
                          bellNotifications.map((notif) => (
                            <div 
                              key={notif.id} 
                              className={cn(
                                "p-2.5 rounded-xl transition-all duration-200 cursor-pointer",
                                notif.is_read ? "bg-transparent opacity-60" : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                              )}
                              onClick={async () => {
                                if (!notif.is_read) {
                                  try {
                                    await api.patch(`/auth/web/notifications/${notif.id}/read`);
                                    setBellNotifications(prev => 
                                      prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
                                    );
                                  } catch (e) { clientLog.error('Failed to mark notification as read', { error: e }); }
                                }
                                if (notif.deep_link) {
                                  // S3-CW-03: Validate deep_link before navigation to prevent open redirect.
                                  // S3-CW-03b: Route allowlist enforced — only customer pages allowed.
                                  const safeLink = sanitizeDeepLink(notif.deep_link);
                                  if (safeLink) {
                                    router.push(safeLink);
                                  } else {
                                    clientLog.warn('Blocked suspicious deep_link from notification', { raw: notif.deep_link });
                                  }
                                  setIsNotifOpen(false);
                                }
                              }}
                            >
                              <div className="flex items-start justify-between">
                                <h4 className="text-xs font-semibold text-foreground">{notif.title}</h4>
                                {!notif.is_read && <span className="w-2 h-2 bg-primary rounded-full mt-1" />}
                              </div>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{notif.body}</p>
                              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1 block">
                                {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Bell className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mb-2" />
                            <p className="text-xs text-zinc-500">Tidak ada notifikasi baru</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="h-8 w-px bg-black/10 dark:bg-white/10 mx-1 md:mx-2 hidden sm:block" />

            {/* Profile Dropdown */}
            <div className="relative">
              <div 
                className="flex items-center gap-3 group p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all cursor-pointer"
                onClick={() => {
                  setIsUserOpen(!isUserOpen);
                  setIsNotifOpen(false);
                }}
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary-light transition-colors">{user?.name || 'Customer Tembus'}</p>
                  <p className="text-[10px] tracking-widest text-zinc-500 font-bold">
                    {user?.awb_sender_name ? `PENGIRIM: ${user.awb_sender_name.toUpperCase()}` : 'STANDARD TIER'}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-brand-emerald-600 p-[1px] shadow-lg shadow-primary/10">
                  <div className="h-full w-full rounded-[11px] bg-background flex items-center justify-center overflow-hidden">
                     <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'Customer')}&background=006437&color=fff`} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isUserOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsUserOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl rounded-2xl p-2 flex flex-col z-50 select-none"
                    >
                      <Link
                        href="/profil"
                        onClick={() => setIsUserOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-zinc-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-all duration-200 select-none"
                      >
                        <User className="h-4 w-4 shrink-0" />
                        Profil & Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 mt-1 rounded-xl text-sm text-zinc-600 dark:text-zinc-400 hover:bg-red-500/10 hover:text-red-500 transition-all duration-200 select-none cursor-pointer text-left w-full"
                      >
                        <LogOut className="h-4 w-4 shrink-0" />
                        Logout
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 scroll-smooth pb-24 md:pb-8">
          {children}
        </div>
        
        {/* Mobile Bottom Navigation Bar (≤ 767px) */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 border-t border-black/10 dark:border-white/10 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl flex justify-around items-center px-2 z-50 md:hidden select-none pb-safe">
          {navItems.slice(0, 5).map((item) => {
            const isActive = isNavigationItemActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 px-3 py-1 rounded-xl transition-all duration-200 select-none ${
                  isActive ? 'text-primary font-bold' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary animate-pulse")} />
                <span className="text-[10px] tracking-tight">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </main>

      {/* Global Command Palette / Search Dialog */}
      <AnimatePresence>
        {isSearchOpen && (
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4 z-[150] select-none transition-all duration-300">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg glass-card rounded-2xl shadow-2xl p-4 flex flex-col gap-3 select-none overflow-hidden"
            >
              <div className="flex items-center gap-3 border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2.5 transition-all shadow-sm">
                <Search className="h-4 w-4 text-zinc-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Cari fitur TEMBUS..."
                  className="flex-1 text-sm bg-transparent border-none focus:outline-none text-foreground placeholder:text-zinc-500 select-text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground transition-all cursor-pointer select-none"
                >
                  <X className="h-4 w-4 shrink-0" />
                </button>
              </div>

              {/* Navigation list */}
              <div className="max-h-72 overflow-y-auto select-none mt-1 space-y-1">
                {filteredSearchItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => {
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-black/10 dark:hover:border-white/10 select-none"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                  </Link>
                ))}
                {filteredSearchItems.length === 0 && (
                  <div className="text-center p-6">
                    <span className="text-xs text-zinc-500 select-none">No pages found matching search query.</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Toast Notifications (Right-Top Corner) */}
      <div className="fixed top-24 right-4 z-[150] flex flex-col gap-2 max-w-sm pointer-events-none select-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="p-4 glass-card rounded-2xl shadow-xl pointer-events-auto flex justify-between gap-3 select-none"
            >
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-foreground truncate">
                  {notif.title || 'Notification'}
                </h4>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                  {notif.message}
                </p>
              </div>
              <button
                onClick={() => removeNotification(notif.id)}
                className="p-1.5 h-7 w-7 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-all cursor-pointer shrink-0 select-none"
              >
                <X className="h-3.5 w-3.5 shrink-0" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <PushNotificationPrompt />
    </div>
  );
}
