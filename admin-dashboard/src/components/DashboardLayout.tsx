import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Truck, 
  BarChart3, 
  Settings, 
  ChevronLeft,
  Search,
  Bell,
  Menu,
  X,
  Shield,
  DollarSign,
  AlertTriangle,
  Ticket,
  Clock,
  Map,
  LogOut
} from 'lucide-react'
import { cn } from '../lib/utils'
import { Link, useLocation } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'

interface SidebarItemProps {
  icon: React.ElementType
  label: string
  path: string
  collapsed?: boolean
}

const SidebarItem = ({ icon: Icon, label, path, collapsed }: SidebarItemProps) => {
  const location = useLocation()
  const active = location.pathname === path

  return (
    <Link to={path}>
      <motion.div
        whileHover={{ x: 4 }}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 group mb-1",
          active 
            ? "bg-primary text-white shadow-lg shadow-primary/20" 
            : "text-zinc-400 hover:bg-white/5 hover:text-white"
        )}
      >
        <Icon className={cn("h-5 w-5 flex-shrink-0", active ? "text-white" : "group-hover:text-primary-light")} />
        {!collapsed && <span className="font-medium whitespace-nowrap">{label}</span>}
      </motion.div>
    </Link>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useSocket()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Map, label: "Zones", path: "/zones" },
    { icon: Ticket, label: "Vouchers", path: "/vouchers" },
    { icon: Bell, label: "Notifications", path: "/notifications" },
    { icon: Clock, label: "SLA Config", path: "/sla-config" },
    { icon: Package, label: "Orders", path: "/orders" },
    { icon: Truck, label: "Couriers", path: "/couriers" },
    { icon: BarChart3, label: "3-Leg Readiness", path: "/three-legs-readiness" },
    { icon: Shield, label: "Feature Flags", path: "/feature-flags" },
    { icon: DollarSign, label: "Pricing", path: "/pricing" },
    { icon: AlertTriangle, label: "Disputes", path: "/disputes" },
    { icon: Users, label: "Customers", path: "/customers" },
    { icon: DollarSign, label: "Finance", path: "/finance" },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex overflow-hidden">
      {/* Background decoration */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/20 rounded-full blur-[100px]" />
      </div>

      {/* Sidebar - Desktop */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 80 : 280 }}
        className="hidden lg:flex flex-col border-r border-white/5 bg-zinc-950/50 backdrop-blur-xl relative z-30"
      >
        <div className="p-6 h-20 flex items-center justify-between">
          {!isCollapsed ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3"
            >
              <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <Package className="h-6 w-6 text-white" />
              </div>
              <span className="font-bold text-2xl tracking-tight">LAN<span className="text-primary-light">CAR</span></span>
            </motion.div>
          ) : (
            <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center mx-auto shadow-lg shadow-primary/20">
              <Package className="h-6 w-6 text-white" />
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-6">
          {navItems.map((item) => (
            <SidebarItem key={item.path} {...item} collapsed={isCollapsed} />
          ))}
          <div className="pt-4 mt-4 border-t border-white/5">
            <SidebarItem icon={Settings} label="Settings" path="/settings" collapsed={isCollapsed} />
          </div>
        </nav>

        <div className="p-4 border-t border-white/5">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center p-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all group"
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
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-zinc-950 z-[101] lg:hidden flex flex-col p-6"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center">
                    <Package className="h-6 w-6 text-white" />
                  </div>
                  <span className="font-bold text-2xl">LANCAR</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-zinc-500">
                  <X size={24} />
                </button>
              </div>
              <nav className="space-y-2">
                {navItems.map((item) => (
                  <SidebarItem key={item.path} {...item} />
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar */}
        <header className="h-20 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-4 flex-1">
            <button 
              className="lg:hidden p-2 text-zinc-400 hover:text-white"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="relative max-w-md w-full hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search analytics, orders, or couriers..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-primary-light rounded-full border-2 border-zinc-950" />
            </button>
            <div className="h-8 w-px bg-white/10 mx-2" />
            <div className="flex items-center gap-3 group p-1.5 hover:bg-white/5 rounded-xl transition-all">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-zinc-200 group-hover:text-primary-light transition-colors">Admin Lancar</p>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Super Admin</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 p-[1px] shadow-lg shadow-primary/10">
                <div className="h-full w-full rounded-[11px] bg-zinc-900 flex items-center justify-center overflow-hidden">
                   <img src="https://ui-avatars.com/api/?name=Admin+Lancar&background=006437&color=fff" alt="Avatar" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
            <button 
              className="p-2.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
              onClick={() => {
                // Logout logic here
                document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
                window.location.href = "/login";
              }}
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 scroll-smooth">
          {children}
        </div>
      </main>
    </div>
  )
}
