import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import OrderExceptions from './pages/OrderExceptions'
import Couriers from './pages/Couriers'
import CourierApplications from './pages/CourierApplications'
import Merchants from './pages/Merchants'
import MerchantStaff from './pages/MerchantStaff'
import Banners from './pages/Banners'
import CourierFaceVerifications from './pages/CourierFaceVerifications'
import CourierSafetyEvents from './pages/CourierSafetyEvents'
import CourierGrowthConfig from './pages/CourierGrowthConfig'
import CourierMarketConfig from './pages/CourierMarketConfig'
import CourierPerformance from './pages/CourierPerformance'
import MerchantPerformance from './pages/MerchantPerformance' // FOOD-BIKE-051
import DriverWalletHold from './pages/DriverWalletHold' // FOOD-BIKE-054
import CourierPublicRegistration from './pages/CourierPublicRegistration'
import PricingConfig from './pages/PricingConfig'
import EconomicsControlPlane from './pages/EconomicsControlPlane'
import SettlementConfig from './pages/SettlementConfig'
import Disputes from './pages/Disputes'
import Cases from './pages/Cases'
import Customers from './pages/Customers'
import Analytics from './pages/Analytics'
import Zones from './pages/Zones'
import MeetingPoints from './pages/MeetingPoints'
import Vouchers from './pages/Vouchers'
import Promos from './pages/Promos'
import Notifications from './pages/Notifications'
import Broadcasts from './pages/Broadcasts'
import FeatureFlags from './pages/FeatureFlags'
import Finance from './pages/Finance'
import TaxCenter from './pages/TaxCenter'
import ChartOfAccounts from './pages/ChartOfAccounts'
import TariffEngine from './pages/TariffEngine'
import CostIntelligence from './pages/CostIntelligence'
import Settings from './pages/Settings'
import MapsRuntime from './pages/MapsRuntime'
import MarketConfiguration from './pages/MarketConfiguration'
import AuditLogs from './pages/AuditLogs'
import Agreements from './pages/Agreements'
import WarehouseOperations from './pages/WarehouseOperations'
import BusinessApiRequests from './pages/BusinessApiRequests'
import HRJobs from './pages/HRJobs'
import HRApplications from './pages/HRApplications'
import News from './pages/News'
import PaymentLinks from './pages/PaymentLinks'
import ResiTemplates from './pages/ResiTemplates'
import LogisticsDiscount from './pages/LogisticsDiscount'
import MerchantSettlements from './pages/MerchantSettlements'
import CustomReports from './pages/CustomReports'
import CampaignCalendar from './pages/CampaignCalendar'
import CourierRetention from './pages/CourierRetention'
import RiskReview from './pages/RiskReview'
import Experiments from './pages/Experiments'
import AppExperience from './pages/AppExperience'
import LocalizedContentPacks from './pages/LocalizedContentPacks'
import MobileReleasePolicies from './pages/MobileReleasePolicies'
import DashboardLayout from './components/DashboardLayout'
import ExperienceScopedPage from './components/experience/ExperienceScopedPage'
import { APP_EXPERIENCE_ROLES } from './config/appExperienceNavigation'

import { useEffect } from 'react'
import { useAuthStore } from './store/useAuthStore'

const queryClient = new QueryClient()

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore()

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

  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" />
  }

  return <DashboardLayout>{children}</DashboardLayout>
}

const APP_EXPERIENCE_ALLOWED_ROLES = [...APP_EXPERIENCE_ROLES]
const SCHEDULING_ALLOWED_ROLES = ['super_admin', 'ops_admin']

const ProtectedExperienceManifest = () => (
  <ProtectedRoute allowedRoles={APP_EXPERIENCE_ALLOWED_ROLES}>
    <AppExperience />
  </ProtectedRoute>
)

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
            path="/orders/exceptions"
            element={
              <ProtectedRoute>
                <OrderExceptions />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/business-api-requests" 
            element={
              <ProtectedRoute>
                <BusinessApiRequests />
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
            path="/courier-performance" 
            element={
              <ProtectedRoute>
                <CourierPerformance />
              </ProtectedRoute>
            } 
          />
          {/* FOOD-BIKE-051: dashboard performa merchant food delivery */}
          <Route 
            path="/merchant-performance" 
            element={
              <ProtectedRoute>
                <MerchantPerformance />
              </ProtectedRoute>
            } 
          />
          {/* FOOD-BIKE-054: hold balance & penalty log driver */}
          <Route 
            path="/driver-wallet-holds" 
            element={
              <ProtectedRoute>
                <DriverWalletHold />
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
            path="/merchants"
            element={
              <ProtectedRoute>
                <Merchants />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/merchant-staff"
            element={
              <ProtectedRoute>
                <MerchantStaff />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/banners"
            element={
              <ProtectedRoute>
                <Banners />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/courier-face-verifications" 
            element={
              <ProtectedRoute>
                <CourierFaceVerifications />
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
          <Route path="/courier-market-config" element={<ProtectedRoute allowedRoles={['super_admin', 'ops_admin', 'ops_security', 'finance_admin']}><CourierMarketConfig /></ProtectedRoute>} />
          <Route path="/courier-retention" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'ops_admin', 'ops_security']}><CourierRetention /></ProtectedRoute>} />
          <Route path="/risk-reviews" element={<ProtectedRoute allowedRoles={['super_admin', 'ops_admin', 'ops_security']}><RiskReview /></ProtectedRoute>} />
          <Route 
            path="/pricing" 
            element={
              <ProtectedRoute>
                <PricingConfig />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/economics"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'ops_admin', 'finance_admin', 'finance']}>
                <EconomicsControlPlane />
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
            path="/cases"
            element={
              <ProtectedRoute>
                <Cases />
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
            path="/hr/jobs" 
            element={
              <ProtectedRoute>
                <HRJobs />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/hr/applications" 
            element={
              <ProtectedRoute>
                <HRApplications />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/news" 
            element={
              <ProtectedRoute>
                <News />
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
          <Route path="/custom-reports" element={<ProtectedRoute><CustomReports /></ProtectedRoute>} />
          <Route path="/campaign-calendar" element={<ProtectedRoute><CampaignCalendar /></ProtectedRoute>} />
          <Route 
            path="/finance" 
            element={
              <ProtectedRoute>
                <Finance />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/tax-center" 
            element={
              <ProtectedRoute>
                <TaxCenter />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/chart-of-accounts" 
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'finance_admin', 'finance']}>
                <ChartOfAccounts />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/tariff-engine" 
            element={
              <ProtectedRoute>
                <TariffEngine />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/merchant-settlements" 
            element={
              <ProtectedRoute>
                <MerchantSettlements />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/cost-intelligence" 
            element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <CostIntelligence />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/payment-links" 
            element={
              <ProtectedRoute>
                <PaymentLinks />
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
            path="/meeting-points"
            element={
              <ProtectedRoute>
                <MeetingPoints />
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
          {/* 10.2: Broadcast Center — role match BROADCAST_ROLES backend */}
          <Route
            path="/broadcasts"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'ops_admin']}>
                <Broadcasts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/feature-flags"
            element={
              <ProtectedRoute allowedRoles={APP_EXPERIENCE_ALLOWED_ROLES}>
                <FeatureFlags />
              </ProtectedRoute>
            }
          />
          <Route path="/experiments" element={<ProtectedRoute allowedRoles={['super_admin', 'ops_admin', 'ops_security']}><Experiments /></ProtectedRoute>} />
          <Route path="/app-experience" element={<Navigate to="/app-experience/overview" replace />} />
          <Route path="/app-experience/overview" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/home-layout" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/campaigns" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/campaign-intro" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/service-visibility" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/kill-switches" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/targeting" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/assets" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/deep-links" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/design-tokens" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/preview" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/approval" element={<ProtectedExperienceManifest />} />
          <Route path="/app-experience/revisions" element={<ProtectedExperienceManifest />} />
          <Route
            path="/app-experience/feature-flags"
            element={
              <ProtectedRoute allowedRoles={APP_EXPERIENCE_ALLOWED_ROLES}>
                <ExperienceScopedPage><FeatureFlags /></ExperienceScopedPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="/app-experience/scheduling"
            element={
              <ProtectedRoute allowedRoles={SCHEDULING_ALLOWED_ROLES}>
                <ExperienceScopedPage><CampaignCalendar /></ExperienceScopedPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="/app-experience/version-policy"
            element={
              <ProtectedRoute allowedRoles={APP_EXPERIENCE_ALLOWED_ROLES}>
                <ExperienceScopedPage><MobileReleasePolicies /></ExperienceScopedPage>
              </ProtectedRoute>
            }
          />
          <Route
            path="/app-experience/analytics"
            element={
              <ProtectedRoute allowedRoles={APP_EXPERIENCE_ALLOWED_ROLES}>
                <ExperienceScopedPage><Analytics /></ExperienceScopedPage>
              </ProtectedRoute>
            }
          />
          <Route path="/localized-content" element={<ProtectedRoute allowedRoles={['super_admin', 'ops_admin', 'ops_security']}><LocalizedContentPacks /></ProtectedRoute>} />
          <Route path="/mobile-release-policies" element={<ProtectedRoute allowedRoles={['super_admin', 'ops_admin', 'ops_security']}><MobileReleasePolicies /></ProtectedRoute>} />

          <Route 
            path="/audit-logs" 
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'ops_security']}>
                <AuditLogs />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/agreements" 
            element={
              <ProtectedRoute>
                <Agreements />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'ops_admin']}>
                <Settings />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/resi-templates" 
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <ResiTemplates />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/logistics-discount" 
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'finance_admin']}>
                <LogisticsDiscount />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/maps-runtime"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'ops_security']}>
                <MapsRuntime />
              </ProtectedRoute>
            }
          />
          <Route
            path="/market-configuration"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'ops_admin', 'ops_security']}>
                <MarketConfiguration />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </QueryClientProvider>
  )
}

export default App
