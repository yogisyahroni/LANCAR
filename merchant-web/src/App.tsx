import { Routes, Route, Navigate } from 'react-router'
import Landing from './pages/Landing'
import Register from './pages/Register'
import StatusCheck from './pages/StatusCheck'
import Success from './pages/Success'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Menu from './pages/Menu'
import Settings from './pages/Settings'
import Promo from './pages/Promo'
import Reports from './pages/Reports'
import Settlements from './pages/Settlements'
import Staff from './pages/Staff'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/daftar" element={<Register />} />
      <Route path="/status" element={<StatusCheck />} />
      <Route path="/sukses" element={<Success />} />
      <Route path="/masuk" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pesanan" element={<Orders />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/promo" element={<Promo />} />
        <Route path="/laporan" element={<Reports />} />
        <Route path="/settlement" element={<Settlements />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/pengaturan" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
