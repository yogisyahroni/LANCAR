import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { isLoggedIn } from '../lib/auth'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!isLoggedIn()) {
    return <Navigate to="/masuk" state={{ from: location.pathname }} replace />
  }
  return <>{children}</>
}
