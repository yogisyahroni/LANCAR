import React, { useState, useEffect } from 'react'
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
  DollarSign,
  AlertTriangle,
  Ticket,
  Map,
  ClipboardCheck,
  LogOut,
  History,
  Activity,
  ChevronRight,
  Layers,
  ShieldAlert
} from 'lucide-react'
import { cn } from '../lib/utils'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import { api } from '../lib/api'
import { toast } from 'sonner'

import { useAuthStore } from '../store/useAuthStore'

import { createPortal } from 'react-dom'

interface SidebarItemProps {
  icon: any
  label: string
  path: string
  collapsed: boolean
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const socket = useSocket()
  const navigate = useNavigate()
  const location = useLocation()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<DBNotification[]>([])
  const [activeToasts, setActiveToasts] = useState<DBNotification[]>([])

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/auth/web/notifications')
      if (res.data && Array.isArray(res.data.notifications)) {
        setNotifications(res.data.notifications)
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e)
    }
  }

  const removeToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    if (user?.id) {
      fetchNotifications()

      const handleNewNotif = (notif: DBNotification) => {
        console.log('📡 [WebSocket] Admin notification:', notif)
        
        // 1. Update list
        setNotifications(prev => {
          if (prev.find(n => n.id === notif.id)) return prev;
          return [notif, ...prev];
        })

        // 2. Trigger Custom Toast Popup (Like Customer Side)
        setActiveToasts(prev => [notif, ...prev])
        
        // Auto-remove toast after 6 seconds
        setTimeout(() => {
          removeToast(notif.id)
        }, 6000)

        // 3. Keep Sonner as backup/standard fallback
        toast.info(notif.title, {
          description: notif.body,
        })
      }

      socket.on('new_notification', handleNewNotif)
      return () => {
        socket.off('new_notification', handleNewNotif)
      }
    }
  }, [user?.id, socket, navigate])

  useEffect(() => {
    setIsNotifOpen(false)
  }, [location.pathname])

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Map, label: "Zones", path: "/zones" },
    { icon: Ticket, label: "Vouchers", path: "/vouchers" },
    { icon: Bell, label: "Notifications", path: "/notifications" },
    { icon: Package, label: "Orders", path: "/orders" },
    { icon: Layers, label: "Warehouse Ops", path: "/warehouse-operations" },
    { icon: Truck, label: "Couriers", path: "/couriers" },
    { icon: ClipboardCheck, label: "Courier Review", path: "/courier-applications" },
    { icon: ShieldAlert, label: "Courier Safety", path: "/courier-safety-events" },
    { icon: BarChart3, label: "3-Leg Readiness", path: "/three-legs-readiness" },
    { icon: Activity, label: "Feature Flags", path: "/feature-flags" },
    { icon: DollarSign, label: "Pricing", path: "/pricing" },
    { icon: AlertTriangle, label: "Disputes", path: "/disputes" },
    { icon: Users, label: "Customers", path: "/customers" },
    { icon: DollarSign, label: "Finance", path: "/finance" },
    { icon: BarChart3, label: "Analytics", path: "/analytics" },
    { icon: History, label: "Audit Logs", path: "/audit-logs" },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex overflow-hidden">
      {/* Background decoration */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/20 rounded-full blur-[100px]" />
      </div>

      {/* Global Custom Toast Notifications (Floating Popups - Matching Customer Portal) */}
      <div className="fixed top-24 right-6 z-[10000] flex flex-col gap-3 max-w-sm pointer-events-none select-none">
        <AnimatePresence mode="popLayout">
          {activeToasts.map((toastNotif) => (
            <motion.div
              layout
              key={toastNotif.id}
              initial={{ opacity: 0, x: 50, scale: 0.9, y: 0 }}
              animate={{ opacity: 1, x: 0, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
              whileHover={{ scale: 1.02 }}
              className="p-4 bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl pointer-events-auto flex justify-between gap-4 group cursor-pointer"
              onClick={() => {
                if (toastNotif.deep_link) navigate(toastNotif.deep_link)
                removeToast(toastNotif.id)
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="p-2 rounded-xl bg-primary/20 text-primary-light shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]">
                    <Bell size={14} className="animate-bounce" />
                  </div>
                  <h4 className="text-[14px] font-black text-zinc-100 uppercase tracking-tighter truncate">
                    {toastNotif.title || 'Notification'}
                  </h4>
                </div>
                <p className="text-[12px] text-zinc-400 mt-2 leading-relaxed font-medium">
                  {toastNotif.body}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary-light animate-pulse" />
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Baru Saja</span>
                  </div>
                  {toastNotif.deep_link && (
                    <span className="text-[9px] text-primary-light font-black uppercase tracking-widest flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Lihat Detail <ChevronRight size={10} />
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeToast(toastNotif.id)
                }}
                className="p-1.5 h-7 w-7 flex items-center justify-center rounded-xl text-zinc-600 hover:bg-white/10 hover:text-white transition-all shrink-0"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

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
                  <span className="font-bold text-2xl tracking-tight">LANCAR</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-zinc-500">
                  <X size={24} />
                </button>
              </div>
              <nav className="space-y-2">
                {navItems.map((item) => (
                  <SidebarItem key={item.path} {...item} collapsed={false} />
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-20 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-[999]">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button 
              type="button"
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

          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="relative">
              <button 
                type="button"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className={cn(
                  "p-2.5 rounded-xl transition-all duration-200",
                  isNotifOpen 
                    ? "bg-primary/20 text-primary-light" 
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
                aria-label="Notifications"
              >
                <Bell className={cn("h-5 w-5 transition-transform", isNotifOpen && "scale-110")} />
                {notifications.some(n => !n.is_read) && (
                  <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-950 animate-pulse" />
                )}
              </button>

              <AnimatePresence>
                {isNotifOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsNotifOpen(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-3 w-80 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-4 flex flex-col max-h-[500px] z-20 shadow-2xl shadow-black/80 overflow-hidden"
                    >
                      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
                        <div className="flex items-center gap-2">
                          <Bell size={14} className="text-primary-light" />
                          <span className="text-[11px] font-black text-zinc-300 uppercase tracking-[0.2em]">Notifications</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={async () => {
                              try {
                                await api.delete('/auth/web/notifications')
                                setNotifications([])
                              } catch (e) { console.error(e) }
                            }}
                            className="text-[9px] font-bold text-primary-light hover:text-white uppercase tracking-wider transition-colors"
                          >
                            Clear All
                          </button>
                          <button onClick={() => setIsNotifOpen(false)}>
                            <X size={14} className="text-zinc-500 hover:text-white transition-colors" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="overflow-y-auto space-y-2 flex-1 scrollbar-hide pr-1">
                        {notifications.length > 0 ? (
                          notifications.map((notif) => (
                            <div 
                              key={notif.id} 
                              className={cn(
                                "p-3.5 rounded-2xl border transition-all cursor-pointer group relative",
                                notif.is_read ? "bg-white/2 border-transparent opacity-60" : "bg-white/5 border-white/5 shadow-lg hover:bg-white/10"
                              )}
                              onClick={async () => {
                                if (!notif.is_read) {
                                  try {
                                    await api.patch(`/auth/web/notifications/${notif.id}/read`)
                                    setNotifications(prev => 
                                      prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
                                    )
                                  } catch (e) { console.error(e) }
                                }
                                if (notif.deep_link) {
                                  navigate(notif.deep_link)
                                  setIsNotifOpen(false)
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-[11px] font-black text-zinc-100 uppercase tracking-widest">{notif.title}</h4>
                                {!notif.is_read && <span className="w-2 h-2 bg-emerald-500 rounded-full mt-1 shrink-0 animate-pulse" />}
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed line-clamp-2 font-medium">{notif.body}</p>
                              <div className="flex items-center justify-between mt-3">
                                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest bg-black/20 px-1.5 py-0.5 rounded">
                                  {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {notif.type === 'dispute_chat' && (
                                  <span className="text-[8px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full uppercase font-black tracking-[0.1em] border border-red-500/20">Dispute</span>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                            <div className="h-14 w-14 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5">
                              <Bell className="h-7 w-7 text-zinc-400" />
                            </div>
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">No new notifications</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="h-8 w-px bg-white/10 mx-2" />
            <div className="flex items-center gap-3 group p-1.5 hover:bg-white/5 rounded-xl transition-all">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-zinc-200 group-hover:text-primary-light transition-colors">{user?.name || 'Admin Lancar'}</p>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{user?.role === 'superadmin' ? 'Super Admin' : 'Admin'}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 p-[1px] shadow-lg shadow-primary/10">
                <div className="h-full w-full rounded-[11px] bg-zinc-900 flex items-center justify-center overflow-hidden">
                   <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'Admin')}&background=006437&color=fff`} alt="Avatar" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
            <button 
              className="p-2.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
              onClick={() => logout()}
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
