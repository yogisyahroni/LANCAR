'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import { Loader2, LayoutDashboard, Package, BarChart3, Settings, LogOut, Layers } from 'lucide-react';
import Link from 'next/link';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, setAuth, setLoading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

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

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect in useEffect
  }

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Kirim Paket', href: '/orders/new', icon: Package },
    { name: 'Kirim Massal', href: '/orders/bulk', icon: Layers },
    { name: 'Riwayat Order', href: '/orders', icon: Package },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Settings', href: '/settings', icon: Settings },

  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/40 bg-card/50 backdrop-blur-xl flex flex-col">
        <div className="p-6 border-b border-border/40">
          <h1 className="text-xl font-bold tracking-tight text-primary">Lancar Portal</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ${
                  isActive 
                    ? 'bg-primary/10 text-primary font-medium' 
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border/40">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-border/40 bg-card/50 backdrop-blur-xl flex items-center justify-end px-8">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Welcome back</span>
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {useAuthStore.getState().user?.name?.charAt(0) || 'U'}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
