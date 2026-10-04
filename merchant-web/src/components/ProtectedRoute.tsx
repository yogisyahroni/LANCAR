import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { Clock3, XCircle } from 'lucide-react'
import { apiErrorMessage } from '../lib/api'
import { isLoggedIn } from '../lib/auth'
import { merchantOnboardingStatus, merchantStatusLabel } from '../lib/merchant-status'
import type { Merchant, MerchantPortalContext } from '../lib/types'
import { loadMerchantPortalContext } from '../lib/portal-context'
import { MerchantPageSkeleton } from './Skeleton'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [portalContext, setPortalContext] = useState<MerchantPortalContext | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    if (!isLoggedIn()) {
      return () => { mounted = false }
    }
    loadMerchantPortalContext()
      .then((context) => {
        if (!mounted) return
        setMerchant(context.merchant)
        setPortalContext(context)
      })
      .catch((err) => {
        if (!mounted) return
        setError(apiErrorMessage(err, 'Profil merchant tidak dapat dimuat.'))
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  if (!isLoggedIn()) {
    return <Navigate to="/masuk" state={{ from: location.pathname }} replace />
  }

  if (loading) return <MerchantPageSkeleton />

  if (error || !merchant) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-5 py-12">
        <div className="w-full rounded-[1.75rem] border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-black text-zinc-900">Portal belum bisa dibuka</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">{error || 'Akun ini belum memiliki profil toko yang aktif.'}</p>
          <div className="mt-5 flex justify-center gap-3">
            <button onClick={() => window.location.reload()} className="rounded-xl bg-[#003A20] px-5 py-3 text-sm font-bold text-white">Coba lagi</button>
            <Link to="/masuk" className="rounded-xl border border-zinc-200 px-5 py-3 text-sm font-bold text-zinc-700">Kembali ke login</Link>
          </div>
        </div>
      </main>
    )
  }

  const status = merchantOnboardingStatus(merchant.onboarding_status, merchant.verification_status)
  if (status !== 'ACTIVE') {
    const blocked = status === 'REJECTED' || status === 'SUSPENDED'
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-5 py-12">
        <div className={`w-full rounded-[1.75rem] border bg-white p-8 text-center shadow-sm ${blocked ? 'border-red-200' : 'border-amber-200'}`}>
          <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl ${blocked ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            {blocked ? <XCircle className="h-6 w-6" /> : <Clock3 className="h-6 w-6" />}
          </div>
          <h1 className="mt-4 text-xl font-black text-zinc-900">{merchantStatusLabel(status)}</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            {status === 'REJECTED'
              ? 'Data toko perlu diperbaiki sebelum portal dapat digunakan.'
              : status === 'SUSPENDED'
                ? 'Akses operasional sedang ditangguhkan. Hubungi bantuan TEMBUS untuk pemulihan.'
                : 'Tim TEMBUS sedang memproses data toko. Fitur portal akan aktif setelah disetujui.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link to="/status" className="rounded-xl border border-zinc-200 px-5 py-3 text-sm font-bold text-zinc-700">Cek status</Link>
            <Link to="/masuk" className="rounded-xl bg-[#003A20] px-5 py-3 text-sm font-bold text-white">Kembali ke login</Link>
          </div>
        </div>
      </main>
    )
  }

  const requiredCapability = location.pathname === '/staff'
    ? 'manage_staff'
    : location.pathname === '/promo'
      ? 'manage_promo'
      : ['/laporan', '/settlement'].includes(location.pathname)
        ? 'view_reports'
        : 'view_store'
  if (portalContext && !portalContext.capabilities.includes(requiredCapability)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-5 py-12">
        <div className="w-full rounded-[1.75rem] border border-amber-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-black text-zinc-900">Akses belum tersedia</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">Peran akun ini belum memiliki izin untuk membuka halaman tersebut.</p>
          <Link to="/dashboard" className="mt-5 inline-block rounded-xl bg-[#003A20] px-5 py-3 text-sm font-bold text-white">Kembali ke dashboard</Link>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
