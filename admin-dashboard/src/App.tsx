import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Couriers from './pages/Couriers'
import CourierApplications from './pages/CourierApplications'
import CourierSafetyEvents from './pages/CourierSafetyEvents'
import CourierGrowthConfig from './pages/CourierGrowthConfig'
import CourierPublicRegistration from './pages/CourierPublicRegistration'
import PricingConfig from './pages/PricingConfig'
import Disputes from './pages/Disputes'
import Customers from './pages/Customers'
import Analytics from './pages/Analytics'
import Zones from './pages/Zones'
import Vouchers from './pages/Vouchers'
import Promos from './pages/Promos'
import Notifications from './pages/Notifications'
import Finance from './pages/Finance'
import Settings from './pages/Settings'
import MapsRuntime from './pages/MapsRuntime'
import AuditLogs from './pages/AuditLogs'
import FeatureFlags from './pages/FeatureFlags'
import WarehouseOperations from './pages/WarehouseOperations'
import DashboardLayout from './components/DashboardLayout'

import { useEffect } from 'react'
import { useAuthStore } from './store/useAuthStore'

const queryClient = new QueryClient()

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [])

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return isAuthenticated ? <DashboardLayout>{children}</DashboardLayout> : <Navigate to="/login" />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" theme="dark" richColors closeButton />
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/courier-register/:token" element={<CourierPublicRegistration />} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/orders" 
            element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/couriers" 
            element={
              <ProtectedRoute>
                <Couriers />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/courier-applications"
            element={
              <ProtectedRoute>
                <CourierApplications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/courier-safety-events"
            element={
              <ProtectedRoute>
                <CourierSafetyEvents />
              </ProtectedRoute>
            }
          />
          <Route
            path="/courier-growth"
            element={
              <ProtectedRoute>
                <CourierGrowthConfig />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/pricing" 
            element={
              <ProtectedRoute>
                <PricingConfig />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/disputes" 
            element={
              <ProtectedRoute>
                <Disputes />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/customers" 
            element={
              <ProtectedRoute>
                <Customers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/analytics" 
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/finance" 
            element={
              <ProtectedRoute>
                <Finance />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/zones" 
            element={
              <ProtectedRoute>
                <Zones />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/warehouse-operations" 
            element={
              <ProtectedRoute>
                <WarehouseOperations />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/vouchers" 
            element={
              <ProtectedRoute>
                <Vouchers />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/promos"
            element={
              <ProtectedRoute>
                <Promos />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/notifications" 
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/audit-logs" 
            element={
              <ProtectedRoute>
                <AuditLogs />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/feature-flags" 
            element={
              <ProtectedRoute>
                <FeatureFlags />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/maps-runtime"
            element={
              <ProtectedRoute>
                <MapsRuntime />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </QueryClientProvider>
  )
}

export default App
