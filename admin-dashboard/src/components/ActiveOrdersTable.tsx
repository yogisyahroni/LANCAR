import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  MapPin, 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  Package,
  Calendar,
  AlertCircle,
  Filter,
  Loader2,
  Users,
  BarChart3,
  Truck,
  RefreshCw,
  Store,
  UtensilsCrossed
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { adminApiRootUrl } from '../lib/runtimeConfig'
import { toast } from 'sonner'
import { format } from 'date-fns'

// FB-123: scheduled_at (ISO UTC) → jam lokal "HH:mm".
const formatScheduledTime = (iso?: string | null) => {
  if (!iso) return ''
  try {
    return format(new Date(iso), 'HH:mm')
  } catch {
    return ''
  }
}

const uploadUrl = (path?: string | null) => {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${adminApiRootUrl}${path}`
}

const getErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

const getInitials = (name?: string | null) => {
  const safeName = (name || 'Unassigned').trim()
  return safeName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

function InitialsAvatar({ name }: { name?: string | null }) {
  return (
    <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 text-primary-light flex items-center justify-center shadow-inner">
      <span className="text-[10px] font-black uppercase tracking-widest">{getInitials(name)}</span>
    </div>
  )
}

function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="py-20 text-center space-y-4">
      <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
      <div>
        <p className="text-zinc-200 font-black uppercase tracking-widest text-xs">{title}</p>
        <p className="text-zinc-600 text-sm mt-2">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
      >
        <RefreshCw size={14} />
        Retry
      </button>
    </div>
  )
}

const readNumber = (...values: any[]) => {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const readObject = (value: any) => {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const formatShortTime = (value?: string | null) => {
  if (!value) return '---'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '---' : format(date, 'HH:mm')
}

function TambalBanReportPanel({ report }: { report: any }) {
  if (!report) return null;
  return (
    <div className="p-8 rounded-[40px] bg-zinc-900 border border-white/5 space-y-6 shadow-inner">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
          <AlertCircle size={14} className="text-orange-500" />
          Laporan Tambal Ban
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Kerusakan</p>
          <p className="text-sm font-black text-zinc-100 mt-1">{report.damage_type || 'N/A'}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Deskripsi</p>
          <p className="text-sm font-black text-zinc-100 mt-1">{report.description || 'N/A'}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Catatan Teknisi</p>
        <p className="text-sm font-black text-zinc-100 mt-1">{report.technician_notes || '-'}</p>
      </div>
    </div>
  )
}

function TowingReportPanel({ report }: { report: any }) {
  if (!report) return null;
  return (
    <div className="p-8 rounded-[40px] bg-zinc-900 border border-white/5 space-y-6 shadow-inner">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
          <Truck size={14} className="text-blue-500" />
          Laporan Towing
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Tipe Towing</p>
          <p className="text-sm font-black text-zinc-100 mt-1">{report.towing_type || 'N/A'}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Kondisi Kendaraan</p>
          <p className="text-sm font-black text-zinc-100 mt-1">{report.vehicle_condition || 'N/A'}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Catatan Driver</p>
        <p className="text-sm font-black text-zinc-100 mt-1">{report.driver_notes || '-'}</p>
      </div>
    </div>
  )
}

function RouteTelemetryPanel({ orderDetail }: { orderDetail: any }) {
  const pickupLat = readNumber(orderDetail.pickup_lat, orderDetail.pickup?.lat, orderDetail.pickup_location?.lat, orderDetail.route_snapshot?.pickup?.lat)
  const pickupLng = readNumber(orderDetail.pickup_lng, orderDetail.pickup?.lng, orderDetail.pickup_location?.lng, orderDetail.route_snapshot?.pickup?.lng)
  const dropoffLat = readNumber(orderDetail.dropoff_lat, orderDetail.dropoff?.lat, orderDetail.dropoff_location?.lat, orderDetail.route_snapshot?.dropoff?.lat)
  const dropoffLng = readNumber(orderDetail.dropoff_lng, orderDetail.dropoff?.lng, orderDetail.dropoff_location?.lng, orderDetail.route_snapshot?.dropoff?.lng)
  const courierLat = readNumber(orderDetail.courier_lat, orderDetail.courier_location?.lat, orderDetail.live_location?.lat)
  const courierLng = readNumber(orderDetail.courier_lng, orderDetail.courier_location?.lng, orderDetail.live_location?.lng)
  const hasRoute = pickupLat !== null && pickupLng !== null && dropoffLat !== null && dropoffLng !== null
  const formatCoord = (lat: number | null, lng: number | null) => lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Belum tersedia'

  return (
    <div className="h-72 rounded-[40px] bg-zinc-900 border border-white/5 relative overflow-hidden shadow-2xl p-8 flex flex-col justify-between">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,100,55,0.16),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent)]" />
      <div className="relative space-y-5">
        <div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Route Telemetry</p>
          <p className="text-sm font-black text-white leading-none">
            {hasRoute ? 'Koordinat berasal dari database order' : 'Route snapshot belum tersedia dari database'}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Pickup</p>
            <p className="text-xs font-mono text-zinc-300 mt-1">{formatCoord(pickupLat, pickupLng)}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Dropoff</p>
            <p className="text-xs font-mono text-zinc-300 mt-1">{formatCoord(dropoffLat, dropoffLng)}</p>
          </div>
          <div className="rounded-2xl bg-primary/10 border border-primary/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary-light">Courier Live</p>
            <p className="text-xs font-mono text-zinc-200 mt-1">{formatCoord(courierLat, courierLng)}</p>
          </div>
        </div>
      </div>
      <div className="relative flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-600">
        <MapPin size={14} className={hasRoute ? 'text-primary-light' : 'text-zinc-700'} />
        Static placeholder map removed
      </div>
    </div>
  )
}

function OperationalMonitoringPanel({ orderDetail }: { orderDetail: any }) {
  const packages = Array.isArray(orderDetail.packages) ? orderDetail.packages : []
  const dispatches = Array.isArray(orderDetail.dispatches) ? orderDetail.dispatches : []
  const proofAttempts = Array.isArray(orderDetail.proof_attempts) ? orderDetail.proof_attempts : []
  const faceVerifications = Array.isArray(orderDetail.face_verifications) ? orderDetail.face_verifications : []
  const selectedDispatch = dispatches.find((dispatch: any) => dispatch.status === 'accepted') || dispatches[0]
  const latestProofAttempt = proofAttempts[0]
  const latestFaceVerification = faceVerifications[0]
  const dispatchMetadata = readObject(selectedDispatch?.metadata)
  const proofPolicy = readObject(latestProofAttempt?.policy_snapshot)
  const acceptedPackages = packages.filter((item: any) => ['pod_verified', 'delivered'].includes(String(item.status))).length
  const pickupReadyPackages = packages.filter((item: any) => item.pickup_scan_verified_at && item.pickup_photo_verified_at).length

  return (
    <div className="p-8 rounded-[40px] bg-white/[0.02] border border-white/5 space-y-6 shadow-inner">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
          <BarChart3 size={14} className="text-primary-light" />
          Courier V2 Monitoring
        </p>
        <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black text-primary-light">
          P1
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Packages</p>
          <p className="text-lg font-black text-zinc-100 mt-1">{packages.length}</p>
          <p className="text-[10px] text-zinc-500 font-bold">{pickupReadyPackages} pickup verified</p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">POD</p>
          <p className="text-lg font-black text-zinc-100 mt-1">{acceptedPackages}/{packages.length || 1}</p>
          <p className="text-[10px] text-zinc-500 font-bold">same-order scope</p>
        </div>
      </div>

      <div className="rounded-[28px] bg-primary/5 border border-primary/10 p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-zinc-100 uppercase tracking-widest">Dispatch Decision</p>
            <p className="text-sm text-zinc-400 mt-1">{selectedDispatch?.courier_name || 'Belum ada offer dispatch'}</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-zinc-400">
            {selectedDispatch?.status || 'pending'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/[0.03] p-2">
            <p className="text-[10px] text-zinc-600 font-black uppercase">Rank</p>
            <p className="text-xs text-zinc-200 font-black">{selectedDispatch?.rank_number ?? '---'}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.03] p-2">
            <p className="text-[10px] text-zinc-600 font-black uppercase">Score</p>
            <p className="text-xs text-zinc-200 font-black">{readNumber(selectedDispatch?.score)?.toFixed(1) || '---'}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.03] p-2">
            <p className="text-[10px] text-zinc-600 font-black uppercase">Distance</p>
            <p className="text-xs text-zinc-200 font-black">{selectedDispatch?.distance_m ? `${selectedDispatch.distance_m}m` : '---'}</p>
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-zinc-500 font-bold">
          {dispatchMetadata.assignment_policy || dispatchMetadata.route_policy || 'Dispatch metadata belum tersedia dari route matcher.'}
        </p>
      </div>

      <div className="rounded-[28px] bg-white/[0.03] border border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black text-zinc-100 uppercase tracking-widest">Proof Risk</p>
          <span className={cn(
            "px-3 py-1 rounded-full border text-[10px] font-black uppercase",
            latestProofAttempt?.proof_status === 'accepted'
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : latestProofAttempt ? "bg-red-500/10 border-red-500/20 text-red-300" : "bg-white/5 border-white/10 text-zinc-500"
          )}>
            {latestProofAttempt?.proof_status || 'no attempt'}
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {latestProofAttempt
            ? `${latestProofAttempt.proof_step} • ${latestProofAttempt.distance_m ?? '---'}m/${latestProofAttempt.radius_m ?? '---'}m • accuracy ${latestProofAttempt.accuracy_m ?? '---'}m`
            : 'Proof attempt belum masuk.'}
        </p>
        {latestProofAttempt?.override_reason && (
          <p className="text-[10px] text-amber-200 font-bold">Override: {latestProofAttempt.override_reason}</p>
        )}
        <p className="text-[10px] text-zinc-600 font-bold">
          Policy: {proofPolicy.proof_gps_override_policy || proofPolicy.pod_label || 'snapshot belum tersedia'}
        </p>
      </div>

      <div className="rounded-[28px] bg-white/[0.03] border border-white/10 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black text-zinc-100 uppercase tracking-widest">Face Verification</p>
          <span className="text-[10px] text-zinc-500 font-black uppercase">{formatShortTime(latestFaceVerification?.created_at)}</span>
        </div>
        <p className={cn(
          "text-sm font-black",
          latestFaceVerification?.status === 'verified' ? "text-emerald-300" : latestFaceVerification ? "text-amber-300" : "text-zinc-500"
        )}>
          {latestFaceVerification?.status || 'Belum ada verifikasi wajah'}
        </p>
        <p className="text-[10px] text-zinc-600 font-bold">
          {latestFaceVerification
            ? `${latestFaceVerification.verification_type} • liveness ${latestFaceVerification.liveness_score ?? '---'}`
            : 'Pickup dan POD wajib face verification sebelum bukti diterima server.'}
        </p>
      </div>
    </div>
  )
}

export default function ActiveOrdersTable() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const limit = 10

  // Fetch Orders — auto-refetch every 10s for near-realtime updates
  const { data: ordersData, isLoading: isLoadingOrders, isError: isOrdersError, error: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ['admin-orders', page, searchTerm],
    queryFn: async () => {
      const res = await api.get('/admin/orders', {
        params: {
          page,
          limit,
          search: searchTerm
        }
      })
      return res.data
    },
    refetchInterval: 10000
  })

  // Fetch Order Detail when selected
  const { data: orderDetail, isLoading: isLoadingDetail, isError: isDetailError, error: detailError, refetch: refetchDetail } = useQuery({
    queryKey: ['admin-order-detail', selectedOrderId],
    queryFn: async () => {
      if (!selectedOrderId) return null
      const res = await api.get(`/admin/orders/${selectedOrderId}`)
      return res.data
    },
    enabled: !!selectedOrderId
  })

  // Mutations
  const reassignMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return api.post(`/admin/orders/${orderId}/reassign`, { courier_id: 'pending', reason: 'Admin manual trigger' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({ queryKey: ['admin-order-detail', selectedOrderId] })
      toast.success('Order reassignment triggered')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to reassign order')
    }
  })

  const flagIssueMutation = useMutation({
    mutationFn: async ({ orderId, type, description }: { orderId: string, type: string, description: string }) => {
      return api.post(`/admin/orders/${orderId}/flag`, { type, description })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      queryClient.invalidateQueries({ queryKey: ['admin-order-detail', selectedOrderId] })
      toast.warning('Order flagged for investigation')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to flag order')
    }
  })

  // Dedup by id sebagai defensive layer — backend seharusnya sudah unik,
  // ini mencegah React key warning jika ada edge case duplikasi dari network.
  const rawOrders = ordersData?.data || []
  const orders = rawOrders.filter((order: any, index: number, self: any[]) =>
    index === self.findIndex((o: any) => o.id === order.id)
  )
  const total = ordersData?.total || 0
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search by ID, Customer, or Courier..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setPage(1)
            }}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium text-zinc-200"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm font-black uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all">
            <Filter size={18} />
            Filters
          </button>
          <button 
            onClick={() => refetchOrders()}
            className="p-3 bg-primary/10 border border-primary/20 rounded-2xl text-primary-light hover:bg-primary/20 transition-all"
          >
            <Clock size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        {isLoadingOrders ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-xs font-black text-zinc-500 uppercase tracking-widest">Scanning Grid...</p>
          </div>
        ) : isOrdersError ? (
          <ErrorState
            title="Order grid gagal dimuat"
            message={getErrorMessage(ordersError, 'Data order belum bisa diambil dari API admin.')}
            onRetry={() => refetchOrders()}
          />
        ) : orders.length === 0 ? (
          <div className="py-20 text-center">
            <Package className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
            <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">No active orders found</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="px-6 py-4">ID & Model</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Courier</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((order: any, i: number) => (
                <motion.tr 
                  key={`order-${order.id}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="group hover:bg-white/[0.03] transition-all cursor-pointer border-l-2 border-transparent hover:border-primary"
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all shadow-lg",
                        "bg-emerald-500/10 text-emerald-400"
                      )}>
                        <Package size={18} />
                      </div>
                      <div>
                        <span className="font-black text-zinc-100 block text-sm tracking-tight">{order.id}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{order.model}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-zinc-300">{order.customer_name || 'Customer belum tersedia dari API'}</p>
                    <p className="text-[10px] text-zinc-600 font-medium">{order.customer_phone || order.customer_email || 'Profil customer belum tersinkron'}</p>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={order.courier_name} />
                      <span className="text-zinc-300 text-sm font-black">{order.courier_name || 'Kurir belum ditugaskan'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        order.status === 'delivered' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                        order.status === 'delayed' || order.status === 'failed' ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                        order.status === 'scheduled' ? "bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" :
                        "bg-primary animate-pulse shadow-[0_0_8px_rgba(0,100,55,0.5)]"
                      )} />
                      <span className={cn(
                        "text-xs font-black uppercase tracking-widest",
                        order.status === 'delayed' ? "text-red-400" :
                        order.status === 'scheduled' ? "text-violet-300" : "text-zinc-200"
                      )}>{order.status}</span>
                      {/* FB-123: badge Terjadwal untuk order food terjadwal */}
                      {order.scheduled_at && (
                        <span className="text-[10px] font-bold bg-violet-500/10 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5 ml-1">
                          🕐 Terjadwal — {formatScheduledTime(order.scheduled_at)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <span className="text-sm font-black text-zinc-100">Rp {parseInt(order.total_amount).toLocaleString()}</span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-8 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
        <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black">
          {isLoadingOrders ? 'Calculating Grid...' : `Displaying ${orders.length} of ${total} logical units`}
        </p>
        <div className="flex items-center gap-2">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 disabled:opacity-20 hover:text-white transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-1">
             {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => (
               <button
                 key={i}
                 onClick={() => setPage(i + 1)}
                 className={cn(
                   "w-10 h-10 rounded-xl text-xs font-black transition-all",
                   page === i + 1 ? "bg-primary text-white shadow-lg" : "text-zinc-500 hover:bg-white/5"
                 )}
               >
                 {i + 1}
               </button>
             ))}
          </div>
          <button 
            disabled={page === totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 disabled:opacity-20 hover:text-white transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrderId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrderId(null)}
              className="absolute inset-0 bg-zinc-950/90 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-[48px] relative z-10 border-white/10 flex flex-col shadow-2xl"
            >
              {isLoadingDetail ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-40">
                  <Loader2 className="w-16 h-16 text-primary animate-spin" />
                  <p className="text-sm font-black text-zinc-500 uppercase tracking-[0.3em]">Downloading Order Context...</p>
                </div>
              ) : isDetailError ? (
                <ErrorState
                  title="Detail order gagal dimuat"
                  message={getErrorMessage(detailError, 'Detail order belum bisa diambil dari database.')}
                  onRetry={() => refetchDetail()}
                />
              ) : orderDetail ? (
                <>
                  <div className="flex-1 overflow-y-auto p-12">
                    <div className="flex flex-col lg:flex-row justify-between gap-16">
                      <div className="flex-1 space-y-12">
                        <div className="flex items-start gap-8">
                          <div className={cn(
                            "h-20 w-20 rounded-[32px] flex items-center justify-center text-white shadow-2xl transition-all shrink-0",
                            "bg-emerald-500 shadow-emerald-500/20"
                          )}>
                            <Package size={40} />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-4">
                              <h2 className="text-5xl font-black text-zinc-100 tracking-tighter">{orderDetail.id}</h2>
                              <div className="flex gap-2">
                                <span className="px-4 py-1.5 rounded-full bg-white/5 text-zinc-400 border border-white/10 text-[10px] font-black uppercase tracking-widest">
                                  {orderDetail.model}
                                </span>
                                <span className={cn(
                                  "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                  orderDetail.status === 'delivered' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-primary/10 text-primary-light border-primary/20"
                                )}>
                                  {orderDetail.status}
                                </span>
                              </div>
                            </div>
                            <p className="text-zinc-500 font-bold flex items-center gap-2 tracking-tight">
                              <Calendar size={14} />
                              Created on {format(new Date(orderDetail.created_at), 'MMMM dd, yyyy HH:mm')}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-6 p-8 rounded-[40px] bg-white/[0.02] border border-white/5 shadow-inner">
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                              <Users size={14} className="text-primary-light" />
                              Participants
                            </p>
                            <div className="space-y-6">
                              <div className="flex items-center justify-between group">
                                <span className="text-sm text-zinc-500 font-bold italic group-hover:text-zinc-400 transition-colors">Customer</span>
                                <div className="text-right">
                                  <p className="text-sm font-black text-zinc-100">{orderDetail.customer_name}</p>
                                  <p className="text-[10px] text-zinc-600 font-medium">{orderDetail.customer_phone}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between group">
                                <span className="text-sm text-zinc-500 font-bold italic group-hover:text-zinc-400 transition-colors">Current Courier</span>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                  <p className="text-sm font-black text-zinc-100">{orderDetail.courier_name || 'Kurir belum ditugaskan'}</p>
                                  <p className="text-[10px] text-zinc-600 font-medium">{orderDetail.courier_phone || '---'}</p>
                                </div>
                                  <InitialsAvatar name={orderDetail.courier_name} />
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-6 p-8 rounded-[40px] bg-white/[0.02] border border-white/5 shadow-inner">
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                              <BarChart3 size={14} className="text-primary-light" />
                              Financial Overview
                            </p>
                            <div className="space-y-6">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-zinc-500 font-bold italic">Base Fare</span>
                                <span className="text-sm font-black text-zinc-100">Rp {parseInt(orderDetail.base_fare).toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-zinc-500 font-bold italic">Platform Fee</span>
                                <span className="text-sm font-black text-zinc-400">Rp {parseInt(orderDetail.platform_fee).toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                <span className="text-sm font-black text-primary-light uppercase tracking-widest">Total Amount</span>
                                <span className="text-xl font-black text-zinc-100">Rp {parseInt(orderDetail.total_amount).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* FB-110: rincian food (merchant + item + timeline masak) */}
                        {orderDetail.food_items?.length > 0 && (
                          <div className="space-y-6 p-8 rounded-[40px] bg-white/[0.02] border border-white/5 shadow-inner">
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                              <UtensilsCrossed size={14} className="text-primary-light" />
                              Food Order Detail
                            </p>
                            {orderDetail.food_merchant && (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between group">
                                  <span className="text-sm text-zinc-500 font-bold italic group-hover:text-zinc-400 transition-colors flex items-center gap-2">
                                    <Store size={14} className="text-primary-light" /> Merchant
                                  </span>
                                  <div className="text-right">
                                    <p className="text-sm font-black text-zinc-100">{orderDetail.food_merchant.merchant_name}</p>
                                    <p className="text-[10px] text-zinc-600 font-medium">{orderDetail.food_merchant.merchant_address}</p>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-zinc-500 font-bold italic">Diterima Merchant</span>
                                  <span className="text-sm font-black text-zinc-100">
                                    {orderDetail.food_merchant.merchant_accepted_at
                                      ? format(new Date(orderDetail.food_merchant.merchant_accepted_at), 'dd MMM yyyy HH:mm')
                                      : '—'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-zinc-500 font-bold italic">Makanan Siap</span>
                                  <span className="text-sm font-black text-zinc-100">
                                    {orderDetail.food_merchant.food_ready_at
                                      ? format(new Date(orderDetail.food_merchant.food_ready_at), 'dd MMM yyyy HH:mm')
                                      : '—'}
                                  </span>
                                </div>
                              </div>
                            )}
                            <div className="pt-2 space-y-3">
                              {orderDetail.food_items.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between border-t border-white/5 pt-3">
                                  <div>
                                    <p className="text-sm font-black text-zinc-100">
                                      {item.quantity}× {item.item_name}
                                    </p>
                                    {item.notes && (
                                      <p className="text-[10px] text-zinc-600 font-medium">Catatan: {item.notes}</p>
                                    )}
                                  </div>
                                  <span className="text-sm font-black text-zinc-100">Rp {parseInt(item.subtotal).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-10">
                          <h3 className="text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-4">
                            <Clock className="text-primary-light" size={28} />
                            Logical Event Stream
                          </h3>
                          <div className="relative pl-12 space-y-12">
                            <div className="absolute left-5 top-2 bottom-2 w-[2px] bg-gradient-to-b from-primary via-primary/50 to-transparent" />
                            {orderDetail.events?.map((event: any, i: number) => (
                              <div key={i} className="relative">
                                <div className={cn(
                                  "absolute -left-[33px] top-1 w-4 h-4 rounded-full border-4 border-zinc-950",
                                  i === 0 ? "bg-primary shadow-[0_0_15px_rgba(0,100,55,0.8)]" : "bg-zinc-700"
                                )} />
                                <div className="flex items-start justify-between">
                                  <div className="space-y-1">
                                    <p className={cn("text-lg font-black tracking-tight", i === 0 ? "text-zinc-100" : "text-zinc-500")}>
                                      {event.event_type.replace(/_/g, ' ').toUpperCase()}
                                    </p>
                                    <p className="text-xs text-zinc-600 font-bold italic leading-relaxed">{event.description || 'System automatic log entry'}</p>
                                  </div>
                                  <p className="text-sm font-black text-zinc-600 font-mono bg-white/5 px-3 py-1 rounded-lg">
                                    {format(new Date(event.created_at), 'HH:mm:ss')}
                                  </p>
                                </div>
                              </div>
                            ))}
                            {!orderDetail.events?.length && (
                              <p className="text-zinc-600 font-bold italic text-sm">No events recorded yet.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="lg:w-96 space-y-10">
                        <div className="space-y-4">
                           <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                             <MapPin size={14} className="text-primary-light" />
                             Dynamic Map View
                           </p>
                           <RouteTelemetryPanel orderDetail={orderDetail} />
                        </div>

                        <div className="space-y-4">
                          <button 
                            onClick={() => {
                              if (confirm('Initiate manual courier reassignment?')) {
                                reassignMutation.mutate(orderDetail.id)
                              }
                            }}
                            disabled={reassignMutation.isPending}
                            className="w-full py-6 rounded-[32px] bg-primary text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                          >
                            {reassignMutation.isPending ? <Loader2 size={20} className="animate-spin" /> : <Truck size={20} />}
                            Manual Reassign
                          </button>
                          <button 
                            onClick={() => {
                              const description = prompt('Reason for flagging this order?')
                              if (description) {
                                flagIssueMutation.mutate({ orderId: orderDetail.id, type: 'manual_flag', description })
                              }
                            }}
                            disabled={flagIssueMutation.isPending}
                            className="w-full py-6 rounded-[32px] bg-red-500/10 text-red-400 border border-red-500/20 font-black uppercase tracking-[0.2em] text-[10px] hover:bg-red-500/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                          >
                            {flagIssueMutation.isPending ? <Loader2 size={20} className="animate-spin" /> : <AlertCircle size={20} />}
                            Flag Issue
                          </button>
                        </div>

                        <TambalBanReportPanel report={orderDetail.tambal_ban_report} />
                        <TowingReportPanel report={orderDetail.towing_report} />

                        <OperationalMonitoringPanel orderDetail={orderDetail} />

                        <div className="p-8 rounded-[40px] bg-zinc-900 border border-white/5 space-y-6 shadow-inner">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Evidence Vault</p>
                            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-zinc-500">
                              {orderDetail.proofs?.length || 0} proof
                            </span>
                          </div>
                          {orderDetail.proofs?.length ? (
                            <div className="space-y-4">
                              {orderDetail.proofs.map((proof: any) => (
                                <div key={proof.id} className="rounded-[28px] bg-white/[0.03] border border-white/10 p-4 space-y-3">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <p className="text-sm font-black text-zinc-100">{proof.proof_label || proof.scan_type}</p>
                                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                                        {proof.proof_category || 'operational'} {proof.recorded_at ? `• ${format(new Date(proof.recorded_at), 'HH:mm')}` : ''}
                                      </p>
                                    </div>
                                    {proof.reason_code && (
                                      <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-500/20 text-[10px] font-black uppercase">
                                        {proof.reason_code.replace(/_/g, ' ')}
                                      </span>
                                    )}
                                  </div>
                                  {(proof.reason_note || proof.override_reason) && (
                                    <p className="text-xs text-zinc-400 leading-relaxed">
                                      {proof.reason_note || proof.override_reason}
                                    </p>
                                  )}
                                  {proof.photo_url ? (
                                    <button
                                      type="button"
                                      onClick={() => window.open(uploadUrl(proof.photo_url), '_blank', 'noopener,noreferrer')}
                                      className="w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-zinc-800"
                                    >
                                      <img src={uploadUrl(proof.photo_url)} className="w-full h-full object-cover" alt={proof.proof_label || proof.scan_type} />
                                    </button>
                                  ) : (
                                    <div className="rounded-2xl bg-zinc-800 border border-white/10 p-5 text-center">
                                      <Package size={24} className="mx-auto text-zinc-700 mb-2" />
                                      <span className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.2em] block">No Photo</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="aspect-square rounded-[32px] bg-zinc-800 border border-white/10 flex items-center justify-center group overflow-hidden relative">
                              <div className="text-center space-y-2">
                                <Package size={32} className="mx-auto text-zinc-700 group-hover:text-primary transition-colors" />
                                <span className="text-[10px] font-black text-zinc-700 group-hover:text-zinc-500 transition-colors uppercase tracking-[0.2em] block">No Photo</span>
                              </div>
                            </div>
                          )}
                          {orderDetail.safety_events?.length ? (
                            <div className="rounded-[28px] bg-red-500/5 border border-red-500/10 p-4 space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Operational Review</p>
                              <p className="text-xs text-zinc-400">
                                {orderDetail.safety_events[0].message || 'Ada event operasional terkait order ini.'}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-10 bg-white/[0.02] border-t border-white/5 flex justify-end">
                    <button 
                      onClick={() => setSelectedOrderId(null)}
                      className="px-12 py-5 rounded-2xl bg-zinc-800 text-zinc-400 font-black uppercase tracking-widest text-[10px] hover:bg-zinc-700 hover:text-white transition-all border border-white/5"
                    >
                      Close Context
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-20 text-center space-y-4">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                  <p className="text-zinc-500 font-black uppercase tracking-widest text-xs">Failed to load order metadata</p>
                  <button onClick={() => setSelectedOrderId(null)} className="text-primary-light font-bold text-xs uppercase tracking-widest">Return to Grid</button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
