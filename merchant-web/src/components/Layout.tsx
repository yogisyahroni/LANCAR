import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { ClipboardList, LayoutDashboard, LogOut, Menu as MenuIcon, Settings, Store, UtensilsCrossed, X } from 'lucide-react'
import { toast } from 'sonner'
import { clearSession } from '../lib/auth'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pesanan', label: 'Pesanan', icon: ClipboardList },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/pengaturan', label: 'Pengaturan', icon: Settings },
]

export default function Layout({ merchantName }: { merchantName?: string }) {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const logout = () => {
    clearSession()
    toast.success('Berhasil keluar')
    navigate('/masuk', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <img src="/favicon.svg" alt="TEMBUS" className="h-8 w-8" />
        <span className="font-black text-zinc-900">TEMBUS <span className="text-emerald-900">Mitra</span></span>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon }) => (
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
                <span className="max-w-[240px] truncate font-bold text-zinc-800">{merchantName || 'Toko Mitra'}</span>
              </div>
            </div>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-600 transition hover:border-red-200 hover:text-red-600">
              <LogOut className="h-3.5 w-3.5" /> Keluar
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">
          <Outlet context={{}} />
        </main>
      </div>
    </div>
  )
}
