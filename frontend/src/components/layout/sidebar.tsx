'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Flag, 
  Activity, 
  Settings, 
  History, 
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Feature Flags', href: '/feature-flags', icon: Flag },
  { name: 'Readiness', href: '/readiness', icon: Activity },
  { name: 'Audit Logs', href: '/audit-logs', icon: History },
  { name: 'Security', href: '/security', icon: ShieldCheck },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-surface border-r border-border">
      <div className="flex h-20 items-center px-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-xl">L</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white uppercase">LANCAR</span>
        </div>
      </div>
      
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 relative',
                isActive 
                  ? 'text-primary bg-primary/5' 
                  : 'text-muted-foreground hover:text-white hover:bg-white/5'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <item.icon className={cn(
                'mr-3 h-5 w-5 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-white'
              )} />
              {item.name}
              {isActive && (
                <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-3 rounded-xl bg-surface-raised border border-border/50">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-orange-400 flex items-center justify-center text-xs font-bold text-white">
            SA
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Super Admin</p>
            <p className="text-xs text-muted-foreground truncate">admin@lancar.id</p>
          </div>
        </div>
      </div>
    </div>
  );
}
