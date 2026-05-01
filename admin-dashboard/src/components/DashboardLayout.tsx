import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Truck, 
  BarChart3, 
  Settings, 
  LogOut, 
  ChevronLeft,
  Search,
  Bell,
  Menu
} from 'lucide-react'
import { cn } from '../lib/utils'

interface SidebarItemProps {
  icon: React.ElementType
  label: string
  active?: boolean
  collapsed?: boolean
}

const SidebarItem = ({ icon: Icon, label, active, collapsed }: SidebarItemProps) => (
  <motion.div
    whileHover={{ x: 4 }}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 group",
      active 
        ? "bg-primary text-white shadow-lg shadow-primary/20" 
        : "text-zinc-400 hover:bg-white/5 hover:text-white"
    )}
  >
    <Icon className={cn("h-5 w-5", active ? "text-white" : "group-hover:text-primary-light")} />
    {!collapsed && <span className="font-medium">{label}</span>}
  </motion.div>
)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex overflow-hidden">
      {/* Background decoration */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/20 rounded-full blur-[100px]" />
      </div>

      {/* Sidebar - Desktop */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 80 : 260 }}
        className="hidden lg:flex flex-col border-r border-white/5 bg-zinc-950/50 backdrop-blur-xl relative z-30"
      >
        <div className="p-6 flex items-center justify-between">
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2"
            >
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight">LAN<span className="text-primary-light">CAR</span></span>
            </motion.div>
          )}
          {isCollapsed && (
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center mx-auto">
              <Package className="h-5 w-5 text-white" />
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active collapsed={isCollapsed} />
          <SidebarItem icon={Package} label="Orders" collapsed={isCollapsed} />
          <SidebarItem icon={Truck} label="Couriers" collapsed={isCollapsed} />
          <SidebarItem icon={Users} label="Customers" collapsed={isCollapsed} />
          <SidebarItem icon={BarChart3} label="Analytics" collapsed={isCollapsed} />
          <div className="pt-4 mt-4 border-t border-white/5">
            <SidebarItem icon={Settings} label="Settings" collapsed={isCollapsed} />
          </div>
        </nav>

        <div className="p-4 mt-auto">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 transition-all"
          >
            <ChevronLeft className={cn("h-5 w-5 transition-transform duration-300", isCollapsed && "rotate-180")} />
          </button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar */}
        <header className="h-20 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-20">
          <div className="flex items-center gap-4 flex-1">
            <button 
              className="lg:hidden p-2 text-zinc-400"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="relative max-w-md w-full hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search analytics, orders, or couriers..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 text-zinc-400 hover:text-white transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary-light rounded-full border-2 border-zinc-950" />
            </button>
            <div className="h-8 w-px bg-white/5 mx-2" />
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-zinc-200 group-hover:text-primary-light transition-colors">Admin Lancar</p>
                <p className="text-xs text-zinc-500">Super Admin</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 p-[1px]">
                <div className="h-full w-full rounded-[11px] bg-zinc-900 flex items-center justify-center overflow-hidden">
                   <img src="https://ui-avatars.com/api/?name=Admin+Lancar&background=006437&color=fff" alt="Avatar" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {children}
        </div>
      </main>
    </div>
  )
}
