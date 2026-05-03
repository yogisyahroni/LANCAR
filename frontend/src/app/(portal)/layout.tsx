'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { api } from '@/lib/api';
import { 
  Loader2, 
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
  MapPin 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import PushNotificationPrompt from '@/components/PushNotificationPrompt';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, setAuth, setLoading, user } = useAuthStore();
  const { notifications, removeNotification } = useNotificationStore();
  const router = useRouter();
  const pathname = usePathname();

  // Navigation Items
  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Kirim Paket', href: '/orders/new', icon: Package },
    { name: 'Kirim Massal', href: '/orders/bulk', icon: Layers },
    { name: 'Riwayat Order', href: '/orders', icon: Package },
    { name: 'Resi Management', href: '/resi', icon: Layers },
    { name: 'Buku Alamat', href: '/alamat', icon: MapPin },
    { name: 'Laporan UMKM', href: '/laporan', icon: BarChart3 },
    { name: 'Profil & Settings', href: '/profil', icon: Settings },
  ];

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

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.get('/auth/web/me');
        setAuth(true, response.data.user);
      } catch (error) {
        console.error('Auth check failed:', error);
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

  // Notifications dropdown
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  
  // User dropdown
  const [isUserOpen, setIsUserOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await api.post('/auth/web/logout');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setAuth(false, null);
      router.push('/login');
    }
  };

  const filteredSearchItems = navItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground antialiased transition-colors duration-200">
      
      {/* Top fake progress bar */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="fixed top-0 left-0 h-1 bg-primary z-50 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Tablet: collapsed (w-20), Desktop: full (w-64) */}
      <aside className="hidden md:flex md:w-20 lg:w-64 border-r border-border/40 bg-card/60 backdrop-blur-xl flex-col shrink-0 transition-all duration-300 select-none z-30">
        <div className="h-16 flex items-center px-4 lg:px-6 border-b border-border/40 select-none shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0 shadow-sm border border-primary/20">
              L
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground hidden lg:inline select-none">
              Lancar Portal
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto mt-2">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 select-none cursor-pointer ${
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-primary animate-pulse' : ''}`} />
                <span className="hidden lg:inline text-sm select-none">{item.name}</span>
                {item.name === 'Riwayat Order' && (
                  <span className="ml-auto hidden lg:inline-flex items-center justify-center h-5 w-5 bg-primary text-white text-[10px] rounded-full shadow-sm">
                    3
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/40 shrink-0">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3.5 py-2.5 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200 cursor-pointer select-none"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="hidden lg:inline text-sm font-medium select-none">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Top Navbar */}
        <header className="h-16 border-b border-border/40 bg-card/60 backdrop-blur-xl flex items-center justify-between px-4 md:px-8 shrink-0 transition-colors duration-200 select-none z-20">
          
          {/* Mobile hamburger menu placeholder or empty space */}
          <div className="flex items-center gap-3">
            {/* Tablet/Desktop Search activation via click or text */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-all border border-border/40 cursor-pointer shadow-sm min-w-[140px] md:min-w-[180px] lg:min-w-[240px] select-none"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="text-xs">Search...</span>
              <kbd className="hidden sm:inline-flex ml-auto items-center gap-1 text-[10px] bg-card/60 px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground select-none font-mono">
                Ctrl K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all border border-border/40 cursor-pointer shadow-sm select-none"
              title="Toggle theme"
            >
              {isDark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
            </button>

            {/* Notification Bell with Badge and Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsNotifOpen(!isNotifOpen);
                  setIsUserOpen(false);
                }}
                className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all border border-border/40 cursor-pointer shadow-sm select-none relative"
              >
                <Bell className="h-5 w-5 shrink-0" />
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card animate-pulse" />
              </button>

              <AnimatePresence>
                {isNotifOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsNotifOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-2 w-80 bg-card border border-border/40 rounded-xl shadow-xl p-4 flex flex-col max-h-[380px] z-40 select-none backdrop-blur-xl"
                    >
                      <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-2">
                        <span className="text-xs font-semibold text-foreground">Notifications</span>
                        <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">New</span>
                      </div>
                      <div className="overflow-y-auto space-y-2 flex-1">
                        <div className="p-2.5 bg-muted/40 hover:bg-muted rounded-xl transition-all duration-200">
                          <h4 className="text-xs font-semibold text-foreground">Order sukses dibuat</h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">Paket ke Bandung sedang diproses.</p>
                          <span className="text-[9px] text-muted-foreground mt-1 block">Just now</span>
                        </div>
                        <div className="p-2.5 bg-muted/40 hover:bg-muted rounded-xl transition-all duration-200">
                          <h4 className="text-xs font-semibold text-foreground">Kurir Pickup OTW</h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">Kurir siap mengambil paket.</p>
                          <span className="text-[9px] text-muted-foreground mt-1 block">15 mins ago</span>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Profile / Avatar Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsUserOpen(!isUserOpen);
                  setIsNotifOpen(false);
                }}
                className="flex items-center gap-2 p-1 pl-3 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all border border-border/40 cursor-pointer shadow-sm select-none"
              >
                <div className="hidden sm:flex flex-col items-end shrink-0">
                  <span className="text-xs font-semibold text-foreground">
                    {user?.name || 'Customer'}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Standard Tier</span>
                </div>
                <div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold shadow-sm shrink-0 border border-primary/20">
                  {user?.name?.charAt(0).toUpperCase() || 'C'}
                </div>
              </button>

              <AnimatePresence>
                {isUserOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsUserOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-2 w-48 bg-card border border-border/40 rounded-xl shadow-xl p-2 flex flex-col z-40 select-none backdrop-blur-xl"
                    >
                      <Link
                        href="/profil"
                        onClick={() => setIsUserOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 select-none"
                      >
                        <User className="h-4 w-4 shrink-0" />
                        Profil & Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200 select-none cursor-pointer text-left w-full"
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

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-background/30 select-none relative pb-20 md:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (≤ 767px) */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 border-t border-border/40 bg-card/80 backdrop-blur-xl flex justify-around items-center px-2 z-50 md:hidden select-none">
          {navItems.slice(0, 5).map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 select-none ${
                  isActive ? 'text-primary font-bold animate-pulse' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="text-[10px] tracking-tight">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Global Command Palette / Search Dialog */}
      <AnimatePresence>
        {isSearchOpen && (
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4 z-50 select-none transition-all duration-300">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg bg-card/90 border border-border/40 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 select-none backdrop-blur-xl overflow-hidden"
            >
              <div className="flex items-center gap-3 border border-border/40 bg-muted/40 rounded-xl px-3 py-2.5 transition-all shadow-sm">
                <Search className="h-4 w-4 text-muted-foreground shrink-0 animate-pulse" />
                <input
                  type="text"
                  placeholder="Type to search pages..."
                  className="flex-1 text-sm bg-transparent border-none focus:outline-none text-foreground placeholder:text-muted-foreground select-text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer select-none"
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
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-border/40 select-none"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
                {filteredSearchItems.length === 0 && (
                  <div className="text-center p-6">
                    <span className="text-xs text-muted-foreground select-none">No pages found matching search query.</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Toast Notifications (Right-Top Corner) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none select-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="p-4 bg-card/90 backdrop-blur-xl border border-border/40 rounded-2xl shadow-xl pointer-events-auto flex justify-between gap-3 select-none"
            >
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-foreground truncate">
                  {notif.title || 'Notification'}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-normal">
                  {notif.message}
                </p>
              </div>
              <button
                onClick={() => removeNotification(notif.id)}
                className="p-1.5 h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer shrink-0 select-none"
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
