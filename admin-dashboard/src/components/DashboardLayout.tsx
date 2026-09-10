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
  MapPin,
  ClipboardCheck,
  LogOut,
  UserCircle2,
  History,
  Activity,
  ChevronRight,
  ChevronDown,
  Layers,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  BadgePercent,
  Briefcase,
  FileText,
  Newspaper,
  Calculator,
  Receipt,
  Store,
  ShieldOff,
  Link as LinkIcon,
  Megaphone,
  Globe2,
  Beaker,
  Sun,
  Moon,
  Monitor,
  MessageSquareWarning,
  WalletCards,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { Link, useLocation, useNavigate } from 'react-router'
import { useSocket } from '../hooks/useSocket'
import { api } from '../lib/api'
import { clientLog } from '../lib/clientLogger'
import { toast } from 'sonner'

import { useAuthStore } from '../store/useAuthStore'
import { APP_EXPERIENCE_NAVIGATION } from '../config/appExperienceNavigation'
import { hasExperiencePermission } from '../lib/experiencePermissions'

import { createPortal } from 'react-dom'
import { useTheme } from '../providers/ThemeProvider'

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
    <Link to={path} aria-label={collapsed ? label : undefined} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
      <motion.div
        whileHover={{ x: 4 }}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 group mb-1",
          active 
            ? "bg-primary text-on-primary shadow-lg shadow-primary/20"
            : "text-foreground-muted hover:bg-surface-subtle hover:text-foreground"
        )}
      >
        <Icon aria-hidden="true" className={cn("h-5 w-5 flex-shrink-0", active ? "text-on-primary" : "group-hover:text-primary-light")} />
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
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isDesktopViewport, setIsDesktopViewport] = useState(false)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<DBNotification[]>([])
  const [activeToasts, setActiveToasts] = useState<DBNotification[]>([])

  const cycleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  }

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "UTAMA": true,
    "LOGISTIK & KURIR": true,
    "KEUANGAN, PAJAK (VAT) & TARIF": true,
    "MARKETING & PROMOSI": false,
    "APP EXPERIENCE": true,
    "ZONA & PEMETAAN": false,
    "PELANGGAN & B2B": false,
    "HR & REKRUTMEN": false,
    "SISTEM & AUDIT": false,
  })

  const toggleGroup = (title: string) => {
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }))
  }

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/auth/web/notifications')
      if (res.data && Array.isArray(res.data.notifications)) {
        setNotifications(res.data.notifications)
      }
    } catch (e) {
      clientLog.error('Failed to fetch notifications', { error: e })
    }
  }

  const removeToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    if (user?.id) {
      fetchNotifications()

      const handleNewNotif = (notif: DBNotification) => {
        clientLog.debug('Admin notification received', {
          type: notif.type,
          hasOrder: Boolean(notif.order_id),
          hasDeepLink: Boolean(notif.deep_link),
        })
        
        // 1. Update list
        setNotifications(prev => {
          if (prev.find(n => n.id === notif.id)) return prev;
          return [notif, ...prev];
        })

        // 2. Trigger Custom Toast Popup (Like Customer Side)
        setActiveToasts(prev => [notif, ...prev])
        
        // Critical alerts remain in page context until explicitly dismissed;
        // ordinary notifications stay perceivable for six seconds.
        if (notif.type !== 'critical') {
          setTimeout(() => {
            removeToast(notif.id)
          }, 6000)
        }

        // 3. Keep Sonner as a semantic backup/standard fallback. Critical
        // notifications must not be downgraded to an informational announcement.
        const notify = notif.type === 'success'
          ? toast.success
          : ['error', 'critical'].includes(notif.type)
            ? toast.error
            : notif.type === 'warning'
              ? toast.warning
              : toast.info
        notify(notif.title, { description: notif.body })
      }

      socket.on('new_notification', handleNewNotif)
      return () => {
        socket.off('new_notification', handleNewNotif)
      }
    }
  }, [user?.id, socket, navigate])

  useEffect(() => {
    setIsNotifOpen(false)
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const syncViewportState = () => {
      setIsDesktopViewport(mediaQuery.matches)
      if (mediaQuery.matches) {
        setIsMobileMenuOpen(false)
      }
    }

    syncViewportState()
    mediaQuery.addEventListener('change', syncViewportState)

    return () => {
      mediaQuery.removeEventListener('change', syncViewportState)
    }
  }, [])

  const allNavGroups = [
    {
      title: "UTAMA",
      items: [
        { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
        { icon: Package, label: "Orders", path: "/orders" },
        { icon: AlertTriangle, label: "Exception Queue", path: "/orders/exceptions" },
        { icon: Layers, label: "Warehouse Ops", path: "/warehouse-operations" },
        { icon: MessageSquareWarning, label: "Disputes", path: "/disputes" },
        { icon: ShieldCheck, label: "Support Cases", path: "/cases" },
      ]
    },
    {
      title: "LOGISTIK & KURIR",
      items: [
        { icon: Truck, label: "Couriers", path: "/couriers" },
        { icon: ClipboardCheck, label: "Courier Review", path: "/courier-applications" },
        { icon: Store, label: "Merchants", path: "/merchants" },
        { icon: UserCircle2, label: "Staff Oversight", path: "/merchant-staff", allowedRoles: ['super_admin'] }, // A3
        { icon: TrendingUp, label: "Courier Performance", path: "/courier-performance" },
        { icon: BarChart3, label: "Merchant Performance", path: "/merchant-performance" }, // FOOD-BIKE-051
        { icon: ShieldOff, label: "Driver Wallet Hold", path: "/driver-wallet-holds" }, // FOOD-BIKE-054
        { icon: ShieldAlert, label: "Face Verifications", path: "/courier-face-verifications" },
        { icon: ShieldAlert, label: "Courier Safety", path: "/courier-safety-events" },
        { icon: TrendingUp, label: "Courier Growth", path: "/courier-growth" },
        { icon: Globe2, label: "Market & Localization", path: "/courier-market-config", allowedRoles: ['super_admin', 'ops_admin', 'ops_security', 'finance_admin'] },
        { icon: ClipboardCheck, label: "Courier Retention", path: "/courier-retention", allowedRoles: ['super_admin', 'admin', 'ops_admin', 'ops_security'] },
        { icon: ShieldAlert, label: "Risk Review", path: "/risk-reviews", allowedRoles: ['super_admin', 'ops_admin', 'ops_security'] },
        { icon: Beaker, label: "Experiments", path: "/experiments", allowedRoles: ['super_admin', 'ops_admin', 'ops_security'] },
      ]
    },
    {
      title: "KEUANGAN, PAJAK (VAT) & TARIF",
      items: [
        { icon: DollarSign, label: "Finance & Payouts", path: "/finance" },
        { icon: Receipt, label: "Chart of Accounts", path: "/chart-of-accounts", allowedRoles: ['super_admin', 'finance_admin', 'finance'] },
        { icon: Calculator, label: "Tax Center", path: "/tax-center" },
        { icon: Calculator, label: "Tariff Engine", path: "/tariff-engine" },
        { icon: WalletCards, label: "Merchant Escrow", path: "/merchant-settlements" },
        { icon: BadgePercent, label: "Pricing & Tariffs", path: "/pricing" },
        { icon: ShieldCheck, label: "Economics Control Plane", path: "/economics", allowedRoles: ['super_admin', 'ops_admin', 'finance_admin', 'finance'] },
        { icon: Calculator, label: "OPEX / CAPEX (AI)", path: "/cost-intelligence", allowedRoles: ['super_admin'] },
        { icon: BadgePercent, label: "Logistics Margin", path: "/logistics-discount", restrictedRoles: ['cs_agent'] },
        { icon: LinkIcon, label: "Payment Links", path: "/payment-links", restrictedRoles: ['cs_agent'] },
      ]
    },
    {
      title: "MARKETING & PROMOSI",
      items: [
        { icon: Ticket, label: "Vouchers", path: "/vouchers" },
        { icon: BadgePercent, label: "Promos (Financial)", path: "/promos" },
        { icon: Newspaper, label: "Berita & Artikel", path: "/news", restrictedRoles: ['cs_agent'] },
        { icon: Megaphone, label: "Broadcast Center", path: "/broadcasts", allowedRoles: ['super_admin', 'admin', 'ops_admin'] }, // 10.2
        { icon: FileText, label: "Resi Templates", path: "/resi-templates", restrictedRoles: ['cs_agent', 'finance', 'finance_admin'] },
      ]
    },
    {
      title: "APP EXPERIENCE",
      items: APP_EXPERIENCE_NAVIGATION.map(({ icon, label, path, allowedRoles, requiredCapability }) => ({
        icon,
        label,
        path,
        allowedRoles,
        requiredCapability,
      })),
    },
    {
      title: "ZONA & PEMETAAN",
      items: [
        { icon: Map, label: "Zones", path: "/zones" },
        { icon: MapPin, label: "Meeting Points", path: "/meeting-points" },
        { icon: Map, label: "Maps Runtime", path: "/maps-runtime", restrictedRoles: ['finance', 'finance_admin'] },
      ]
    },
    {
      title: "PELANGGAN & B2B",
      items: [
        { icon: Users, label: "Customers", path: "/customers" },
        { icon: ShieldAlert, label: "API Requests", path: "/business-api-requests", restrictedRoles: ['cs_agent', 'finance', 'finance_admin'] },
      ]
    },
    {
      title: "HR & REKRUTMEN",
      items: [
        { icon: Briefcase, label: "HR - Jobs", path: "/hr/jobs", restrictedRoles: ['cs_agent'] },
        { icon: FileText, label: "HR - Applicants", path: "/hr/applications", restrictedRoles: ['cs_agent'] },
      ]
    },
    {
      title: "SISTEM & AUDIT",
      items: [
        { icon: BarChart3, label: "Analytics", path: "/analytics" },
        { icon: FileText, label: "Custom Reports", path: "/custom-reports" },
        { icon: Bell, label: "Notifications", path: "/notifications" },
        { icon: FileText, label: "Perjanjian Hukum", path: "/agreements" },
        { icon: History, label: "Audit Logs", path: "/audit-logs", restrictedRoles: ['finance', 'finance_admin', 'cs_agent'] },
        { icon: Settings, label: "Settings", path: "/settings", restrictedRoles: ['finance', 'finance_admin', 'cs_agent'] },
        { icon: Globe2, label: "Market Configuration", path: "/market-configuration", allowedRoles: ['super_admin', 'ops_admin', 'ops_security'] },
      ]
    }
  ]

  useEffect(() => {
    allNavGroups.forEach(group => {
      if (group.items.some(item => item.path === location.pathname || (
        group.title === 'APP EXPERIENCE' && location.pathname.startsWith('/app-experience/')
      ))) {
        setOpenGroups(prev => ({ ...prev, [group.title]: true }))
      }
    })
  }, [location.pathname])

  const renderNavGroups = (collapsed: boolean) => {
    return allNavGroups.map((group) => {
      const filteredItems = group.items.filter((item: any) => {
        if (item.requiredCapability) {
          return hasExperiencePermission(user, item.requiredCapability)
        }
        if (item.allowedRoles && user?.role) {
          return item.allowedRoles.includes(user.role)
        }
        if (item.restrictedRoles && user?.role) {
          return !item.restrictedRoles.includes(user.role)
        }
        return true
      })

      if (filteredItems.length === 0) return null

      const isOpen = openGroups[group.title] ?? true

      return (
        <div key={group.title} className="mb-2">
          {!collapsed ? (
            <button
              type="button"
              onClick={() => toggleGroup(group.title)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between px-3 py-2 cursor-pointer rounded-lg hover:bg-surface-subtle transition-colors select-none group text-left"
            >
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-foreground-muted group-hover:text-foreground">
                {group.title}
              </span>
              <ChevronDown
                size={14}
                className={cn(
                  "text-foreground-muted transition-transform duration-200",
                  !isOpen && "-rotate-90"
                )} aria-hidden="true" />
            </button>
          ) : (
            <div className="my-2 px-2 border-t border-border" />
          )}

          {(!collapsed ? isOpen : true) && (
            <div className={cn(!collapsed && "mt-1 space-y-0.5")}>
              {filteredItems.map((item) => (
                <SidebarItem key={item.path} {...item} collapsed={collapsed} />
              ))}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-on-primary">
        Skip to main content
      </a>
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
              role={['error', 'critical'].includes(toastNotif.type) ? 'alert' : 'status'}
              aria-live={['error', 'critical'].includes(toastNotif.type) ? 'assertive' : 'polite'}
              aria-atomic="true"
              className="p-4 bg-surface-raised border border-border rounded-2xl shadow-2xl pointer-events-auto flex justify-between gap-4 group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cn(
                    "p-2 rounded-xl",
                    ['error', 'critical'].includes(toastNotif.type)
                      ? "bg-error-surface text-error"
                      : toastNotif.type === 'warning'
                        ? "bg-warning-surface text-warning"
                        : toastNotif.type === 'success'
                          ? "bg-success-surface text-success"
                          : "bg-info-surface text-info",
                  )}>
                    {['error', 'critical'].includes(toastNotif.type)
                      ? <AlertTriangle size={14} aria-hidden="true" />
                      : <Bell size={14} className="animate-bounce" aria-hidden="true" />}
                  </div>
                  <h4 className="text-[14px] font-black text-foreground uppercase tracking-tighter truncate" title={toastNotif.title || 'Notification'}>
                    {toastNotif.title || 'Notification'}
                  </h4>
                </div>
                <p className="text-[12px] text-foreground-secondary mt-2 leading-relaxed font-medium">
                  {toastNotif.body}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-subtle border border-border">
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full animate-pulse",
                      ['error', 'critical'].includes(toastNotif.type)
                        ? "bg-error"
                        : toastNotif.type === 'warning'
                          ? "bg-warning"
                          : toastNotif.type === 'success'
                            ? "bg-success"
                            : "bg-info",
                    )} />
                    <span className="text-[9px] text-foreground-muted font-bold uppercase tracking-widest">Baru Saja</span>
                  </div>
                  {toastNotif.deep_link && (
                    <button
                      type="button"
                      onClick={() => {
                        if (toastNotif.deep_link) navigate(toastNotif.deep_link)
                        removeToast(toastNotif.id)
                      }}
                      className="inline-flex items-center gap-1 text-[9px] text-primary-light font-black uppercase tracking-widest hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      Lihat Detail <ChevronRight size={10} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeToast(toastNotif.id)
                }}
                aria-label="Dismiss notification"
                className="p-1.5 h-7 w-7 flex items-center justify-center rounded-xl text-foreground-muted hover:bg-surface-subtle hover:text-foreground transition-all shrink-0"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 80 : 280 }}
        className="hidden lg:flex flex-col border-r border-border bg-surface relative z-30"
      >
        <div className="p-6 h-20 flex items-center justify-between">
          {!isCollapsed ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3"
            >
              <img src="/tembusweb.svg" alt="Tembus Logo" className="h-10 object-contain drop-shadow-md" />
            </motion.div>
          ) : (
            <div className="h-10 w-10 overflow-hidden flex items-center justify-center mx-auto">
              <img src="/tembusweb.svg" alt="Tembus Logo" className="h-10 w-auto max-w-none object-cover object-left drop-shadow-md -ml-3" />
            </div>
          )}
        </div>

        <nav
          aria-label="Navigasi utama Admin"
          className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto overflow-x-hidden"
        >
          {renderNavGroups(isCollapsed)}
        </nav>

        <div className="p-4 border-t border-border">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-full flex items-center justify-center p-3 rounded-xl bg-surface-subtle hover:bg-border text-foreground-muted hover:text-foreground transition-all group"
          >
            <ChevronLeft aria-hidden="true" className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", isCollapsed && "rotate-180")} />
          </button>
        </div>
      </motion.aside>

      <AnimatePresence>
        {isMobileMenuOpen && !isDesktopViewport && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-scrim/60 z-[100] lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-background z-[101] lg:hidden flex flex-col p-6 overflow-y-auto border-r border-border"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <img src="/tembusweb.svg" alt="Tembus Logo" className="h-10 object-contain drop-shadow-md" />
                </div>
                <button type="button" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close navigation" className="p-2 text-foreground-muted hover:text-foreground rounded-lg">
                  <X size={24} aria-hidden="true" />
                </button>
              </div>
              <nav aria-label="Navigasi mobile Admin" className="space-y-1">
                {renderNavGroups(false)}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-20 border-b border-border bg-surface flex items-center justify-between px-6 sticky top-0 z-[999]">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button 
              type="button"
              aria-label="Open navigation"
              className="lg:hidden p-2 text-foreground-muted hover:text-foreground rounded-lg"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
            <div className="relative max-w-md w-full hidden md:block">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted" />
              <input 
                type="text" 
                aria-label="Search analytics, orders, or couriers"
                placeholder="Search analytics, orders, or couriers..."
                className="w-full bg-surface-subtle border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring transition-all placeholder:text-foreground-muted text-foreground"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            <button
              type="button"
              onClick={cycleTheme}
              aria-pressed={theme === 'dark'}
              aria-label={`Theme ${theme}; resolved ${resolvedTheme}. Activate to cycle theme.`}
              title={`Theme: ${theme}`}
              className="p-2.5 rounded-xl text-foreground-muted hover:text-foreground hover:bg-surface-subtle transition-colors"
            >
              {theme === 'system' ? <Monitor className="h-5 w-5" aria-hidden="true" /> : resolvedTheme === 'dark' ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
            </button>
            <div className="relative">
              <button 
                type="button"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className={cn(
                  "p-2.5 rounded-xl transition-all duration-200",
                  isNotifOpen 
                    ? "bg-primary/20 text-primary-light" 
                    : "text-foreground-muted hover:text-foreground hover:bg-surface-subtle"
                )}
                aria-label="Notifications"
              >
                <Bell className={cn("h-5 w-5 transition-transform", isNotifOpen && "scale-110")} aria-hidden="true" />
                {notifications.some(n => !n.is_read) && (
                  <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-border animate-pulse" />
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
                      className="absolute right-0 mt-3 w-80 bg-surface-raised border border-border rounded-3xl p-4 flex flex-col max-h-[500px] z-20 shadow-2xl shadow-scrim overflow-hidden"
                    >
                      <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
                        <div className="flex items-center gap-2">
                          <Bell size={14} className="text-primary-light" aria-hidden="true" />
                          <span className="text-[11px] font-black text-foreground-muted uppercase tracking-[0.2em]">Notifications</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={async () => {
                              try {
                                await api.delete('/auth/web/notifications')
                                setNotifications([])
                              } catch (e) { clientLog.error('Failed to clear notifications', { error: e }) }
                            }}
                            className="text-[9px] font-bold text-primary-light hover:text-foreground uppercase tracking-wider transition-colors"
                          >
                            Clear All
                          </button>
                          <button type="button" onClick={() => setIsNotifOpen(false)} aria-label="Close notifications">
                            <X size={14} aria-hidden="true" className="text-foreground-muted hover:text-foreground transition-colors" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="overflow-y-auto space-y-2 flex-1 scrollbar-hide pr-1">
                        {notifications.length > 0 ? (
                          notifications.map((notif) => (
                            <button
                              type="button"
                              key={notif.id} 
                              className={cn(
                                "w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer group relative",
                                notif.is_read ? "bg-surface-subtle border-transparent opacity-60" : "bg-surface-subtle border-border shadow-lg hover:bg-surface-subtle"
                              )}
                              onClick={async () => {
                                if (!notif.is_read) {
                                  try {
                                    await api.patch(`/auth/web/notifications/${notif.id}/read`)
                                    setNotifications(prev => 
                                      prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n)
                                    )
                                  } catch (e) { clientLog.error('Failed to mark notification as read', { error: e }) }
                                }
                                if (notif.deep_link) {
                                  navigate(notif.deep_link)
                                  setIsNotifOpen(false)
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-[11px] font-black text-foreground-muted uppercase tracking-widest" title={notif.title}>{notif.title}</h4>
                                {!notif.is_read && <span className="w-2 h-2 bg-success rounded-full mt-1 shrink-0 animate-pulse" />}
                              </div>
                              <p className="text-[11px] text-foreground-muted mt-1.5 leading-relaxed line-clamp-2 font-medium" title={notif.body}>{notif.body}</p>
                              <div className="flex items-center justify-between mt-3">
                                <span className="text-[9px] text-foreground-muted font-bold uppercase tracking-widest bg-surface-subtle px-1.5 py-0.5 rounded">
                                  {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {notif.type === 'dispute_chat' && (
                                  <span className="text-[8px] bg-error-surface text-error px-2 py-0.5 rounded-full uppercase font-black tracking-[0.1em] border border-error">Dispute</span>
                                )}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                            <div className="h-14 w-14 bg-surface-subtle rounded-full flex items-center justify-center mb-4 border border-border">
                              <Bell className="h-7 w-7 text-foreground-muted" aria-hidden="true" />
                            </div>
                            <p className="text-[10px] font-black text-foreground-muted uppercase tracking-[0.2em]">No new notifications</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="h-8 w-px bg-surface-subtle mx-2" />
            <div className="flex items-center gap-3 group p-1.5 hover:bg-surface-subtle rounded-xl transition-all">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-foreground-muted group-hover:text-primary-light transition-colors">{user?.name || 'Admin Tembus'}</p>
                <p className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold">{user?.role === 'superadmin' ? 'Super Admin' : 'Admin'}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-success p-[1px] shadow-lg shadow-primary/10">
                <div className="h-full w-full rounded-[11px] bg-surface flex items-center justify-center overflow-hidden">
                   <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'Admin')}&background=006437&color=fff`} alt="Avatar" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
            <button 
              className="p-2.5 text-on-error hover:text-error hover:bg-error-surface rounded-xl transition-all"
              onClick={() => logout()}
              title="Logout"
            >
              <LogOut size={20} aria-hidden="true" />
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
