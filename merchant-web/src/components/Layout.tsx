import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Banknote, Bell, Check, ChevronDown, CircleHelp, ClipboardList, LayoutDashboard, LogOut, Menu as MenuIcon, Percent, Settings, Store, Users, UtensilsCrossed, X, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { clearSession, getStoredUser } from '../lib/auth'
import { api } from '../lib/api'
import type { Merchant, MerchantNotification, MerchantPortalContext } from '../lib/types'
import { loadMerchantPortalContext } from '../lib/portal-context'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, capability: 'view_store' },
  { to: '/pesanan', label: 'Pesanan', icon: ClipboardList, capability: 'view_store' },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed, capability: 'view_store' },
  { to: '/promo', label: 'Promo', icon: Percent, capability: 'manage_promo' },
  { to: '/laporan', label: 'Laporan', icon: BarChart3, capability: 'view_reports' },
  { to: '/settlement', label: 'Settlement', icon: Banknote, capability: 'view_reports' },
  { to: '/staff', label: 'Staff', icon: Users, capability: 'manage_staff' },
  { to: '/pengaturan', label: 'Pengaturan', icon: Settings, capability: 'view_store' },
]

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [portalContext, setPortalContext] = useState<MerchantPortalContext | null>(null)
  const [notifications, setNotifications] = useState<MerchantNotification[]>([])
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    loadMerchantPortalContext()
      .then((context) => {
        if (!mounted) return
        setMerchant(context.merchant)
        setPortalContext(context)
        api.get<{ data: MerchantNotification[] }>('/notifications?limit=8')
          .then((response) => { if (mounted) setNotifications(response.data?.data || []) })
          .catch(() => { /* Notification center is optional to the operational shell. */ })
      })
      .catch(() => { /* ProtectedRoute owns the user-facing recovery state. */ })
    return () => { mounted = false }
  }, [])

  const visibleNav = NAV.filter(({ capability }) => !portalContext || portalContext.capabilities.includes(capability))
  const outletName = merchant?.outlet_name || merchant?.nama_toko || 'Toko Mitra'
  const outletAddress = merchant?.branch_address || merchant?.alamat || ''

  const logout = () => {
    clearSession()
    toast.success('Berhasil keluar')
    navigate('/masuk', { replace: true })
  }

  const markNotificationRead = async (notification: MerchantNotification) => {
    if (notification.is_read) return
    try {
      await api.patch('/notifications/read', { notification_id: notification.id })
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item))
    } catch {
      toast.error('Notifikasi belum dapat ditandai sudah dibaca')
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length
  const currentUser = getStoredUser()
  const pageTitle = NAV.find((item) => item.to === location.pathname)?.label || 'Portal Mitra'

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <img src="/tembus-login-logo.webp" alt="TEMBUS" className="merchant-brand-image merchant-brand-image--sidebar" />
        <span className="font-black text-emerald-900">Mitra</span>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {visibleNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${
                isActive ? 'bg-[#003A20] text-white shadow-md shadow-emerald-900/20' : 'text-zinc-600 hover:bg-emerald-900/5 hover:text-emerald-900'
              }`
            }
          >
            <Icon className="h-5 w-5" /> {label}
          </NavLink>
        ))}
      </nav>
      <button onClick={logout} className="mx-3 mb-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-500 transition hover:bg-red-50 hover:text-red-600">
        <LogOut className="h-5 w-5" /> Keluar
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-zinc-100 bg-white lg:block">{sidebar}</aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button onClick={() => setSidebarOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-zinc-100 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 lg:hidden">
                <MenuIcon className="h-5 w-5" />
              </button>
              <div className="hidden items-center gap-1.5 text-sm text-zinc-400 sm:flex">
                <Store className="h-4 w-4 text-emerald-900" />
                <span className="max-w-[260px] truncate font-bold text-zinc-800">{outletName}</span>
                {outletAddress && <span className="hidden max-w-[180px] truncate text-xs text-zinc-400 xl:inline">{outletAddress}</span>}
              </div>
              <div className="hidden items-center gap-2 text-xs text-zinc-400 lg:flex">
                <span>/</span>
                <span className="font-bold text-zinc-700">{pageTitle}</span>
              </div>
            </div>
            <div className="relative flex items-center gap-2">
              <a href="https://bawain.my.id/bantuan/pusat-bantuan" target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-900 sm:inline-flex">
                <CircleHelp className="h-4 w-4" /> Bantuan
              </a>
              <button
                onClick={() => setNotificationOpen((open) => !open)}
                aria-label="Buka notifikasi"
                className="relative rounded-full border border-zinc-200 p-2.5 text-zinc-600 transition hover:border-emerald-200 hover:text-emerald-900"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#F97316] px-1 text-center text-[10px] font-black leading-4 text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {notificationOpen && (
                <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                    <p className="text-sm font-black text-zinc-900">Notifikasi</p>
                    {unreadCount > 0 && <span className="text-xs font-bold text-emerald-800">{unreadCount} belum dibaca</span>}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {!notifications.length ? <p className="px-4 py-8 text-center text-sm text-zinc-500">Belum ada notifikasi.</p> : notifications.map((notification) => (
                      <button key={notification.id} onClick={() => markNotificationRead(notification)} className={`flex w-full gap-3 border-b border-zinc-50 px-4 py-3 text-left transition hover:bg-emerald-50 ${notification.is_read ? 'bg-white' : 'bg-emerald-50/50'}`}>
                        <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${notification.is_read ? 'bg-zinc-100 text-zinc-400' : 'bg-emerald-100 text-emerald-800'}`}>
                          {notification.is_read ? <Check className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-zinc-900">{notification.title}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{notification.body}</span>
                          <span className="mt-1 block text-[11px] text-zinc-400">{new Date(notification.created_at).toLocaleString('id-ID')}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="relative">
                <button onClick={() => setAccountOpen((open) => !open)} aria-label="Buka menu akun" className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-700 transition hover:border-emerald-200 hover:text-emerald-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-900 text-[10px] font-black text-white">{(currentUser?.name || currentUser?.email || 'M').slice(0, 1).toUpperCase()}</span>
                  <span className="hidden max-w-28 truncate md:inline">{currentUser?.name || currentUser?.email || 'Akun mitra'}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {accountOpen && <div className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-zinc-100 bg-white p-2 shadow-xl">
                  <div className="border-b border-zinc-100 px-3 py-2">
                    <p className="text-xs font-bold text-zinc-900">Akun aktif</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{currentUser?.email || 'Pengguna portal'}</p>
                  </div>
                  <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-red-600 transition hover:bg-red-50">
                    <LogOut className="h-3.5 w-3.5" /> Keluar dari portal
                  </button>
                </div>}
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">
          <Outlet context={{}} />
        </main>
      </div>
    </div>
  )
}
