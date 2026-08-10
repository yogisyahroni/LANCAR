import { Routes, Route, Navigate } from 'react-router'
import Landing from './pages/Landing'
import Register from './pages/Register'
import StatusCheck from './pages/StatusCheck'
import Success from './pages/Success'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/daftar" element={<Register />} />
      <Route path="/status" element={<StatusCheck />} />
      <Route path="/sukses" element={<Success />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
