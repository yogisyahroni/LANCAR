import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Users, 
  Search, 
  ShieldCheck, 
  Clock, 
  MapPin, 
  Star,
  ExternalLink,
  Ban,
  CheckCircle,
  FileText,
  Truck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Download,
  Package,
  History,
  Link2,
  Copy,
  AlertCircle,
  RefreshCw,
  Camera,
  Upload,
  Image as ImageIcon
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { adminApiRootUrl } from '../lib/runtimeConfig'
import { cn } from '../lib/utils'
import { toast } from 'sonner'
import { OrderStatusBadge } from '../components/OrderStatusBadge'
import { StatusBadge } from '../components/StatusBadge'
import { FocusTrap } from '../components/a11y/FocusTrap'

// Resolve relative /uploads/... paths to absolute API server URL
const resolvePhotoUrl = (photoUrl: string | null | undefined): string | null => {
  if (!photoUrl) return null
  if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) return photoUrl
  // path like /uploads/profiles/xxx.jpg → https://api.bawain.my.id/uploads/profiles/xxx.jpg
  const base = adminApiRootUrl.replace(/\/api\/v1\/?$/, '')
  return `${base}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`
}

// Hook: fetch authenticated image blob
function useAuthPhoto(photoUrl: string | null | undefined) {
  const fullUrl = resolvePhotoUrl(photoUrl)
  return useQuery({
    queryKey: ['auth-photo', fullUrl],
    queryFn: async () => {
      if (!fullUrl) return null
      const res = await api.get(fullUrl, { responseType: 'blob', baseURL: '' })
      return URL.createObjectURL(res.data)
    },
    enabled: !!fullUrl,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

// Component: render authenticated image or fallback
function AuthPhoto({
  photoUrl,
  fallback,
  className = 'w-full h-full object-cover',
  alt = 'Photo',
}: {
  photoUrl: string | null | undefined
  fallback?: React.ReactNode
  className?: string
  alt?: string
}) {
  const { data: blobUrl, isLoading } = useAuthPhoto(photoUrl)
  if (!photoUrl) return <>{fallback}</>
  if (isLoading) return <div className="w-full h-full bg-surface-raised animate-pulse" />
  if (!blobUrl) return <>{fallback}</>
  return <img src={blobUrl} alt={alt} className={className} />
}



const queryErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

function CourierErrorRow({ title, message, onRetry, colSpan = 5 }: { title: string; message: string; onRetry: () => void; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-8 py-20 text-center">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="w-10 h-10 text-error" aria-hidden="true" />
          <div>
            <p className="text-foreground-muted font-black uppercase tracking-wide text-xs">{title}</p>
            <p className="text-foreground-muted text-xs mt-2">{message}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-error-surface border border-error text-error text-xs font-black uppercase tracking-wide hover:bg-error-surface transition-all"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      </td>
    </tr>
  )
}

function CourierPanelError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[32px] border border-error bg-error-surface p-8 text-center space-y-4 md:col-span-4">
      <AlertCircle className="w-10 h-10 text-error mx-auto" aria-hidden="true" />
      <div>
        <p className="text-foreground-muted font-black uppercase tracking-wide text-xs">{title}</p>
        <p className="text-foreground-muted text-xs mt-2">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-error-surface border border-error text-error text-xs font-black uppercase tracking-wide hover:bg-error-surface transition-all"
      >
        <RefreshCw size={14} aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

export default function Couriers() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [detailTab, setDetailTab] = useState<'profile' | 'history' | 'photo'>('profile')
  const [applicationChannel, setApplicationChannel] = useState('all')
  const [linkChannel, setLinkChannel] = useState<'regular'>('regular')
  const [linkExpiryDays, setLinkExpiryDays] = useState('7')
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatedLinkExpiresAt, setGeneratedLinkExpiresAt] = useState('')
  const queryClient = useQueryClient()

  // Broadcast States
  const [selectedCourierIds, setSelectedCourierIds] = useState<string[]>([])
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false)
  const [broadcastDate, setBroadcastDate] = useState('')
  const [broadcastTime, setBroadcastTime] = useState('')
  const [broadcastAddress, setBroadcastAddress] = useState('')

  // Webcam States
  const [isWebcamActive, setIsWebcamActive] = useState(false)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const startWebcam = async (targetDeviceId?: string) => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const oldStream = videoRef.current.srcObject as MediaStream
        oldStream.getTracks().forEach(track => track.stop())
      }

      setIsWebcamActive(true)
      const deviceIdToUse = typeof targetDeviceId === 'string' ? targetDeviceId : selectedDeviceId
      const constraints: MediaStreamConstraints = {
        video: deviceIdToUse ? { deviceId: { exact: deviceIdToUse } } : { width: { ideal: 1280 }, height: { ideal: 720 } }
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const cameras = devices.filter(d => d.kind === 'videoinput')
        setVideoDevices(cameras)
        
        const activeTrack = stream.getVideoTracks()[0]
        const activeSettings = activeTrack?.getSettings()
        if (activeSettings?.deviceId && !selectedDeviceId) {
          setSelectedDeviceId(activeSettings.deviceId)
        } else if (!selectedDeviceId && cameras.length > 0) {
          setSelectedDeviceId(cameras[0].deviceId)
        }
      }
    } catch (err) {
      toast.error('Tidak dapat mengakses kamera atau webcam. Pastikan izin kamera telah diberikan.')
      setIsWebcamActive(false)
    }
  }

  const switchCamera = async (deviceId: string) => {
    setSelectedDeviceId(deviceId)
    await startWebcam(deviceId)
  }

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
    }
    setIsWebcamActive(false)
  }

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d')
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth
        canvasRef.current.height = videoRef.current.videoHeight
        context.drawImage(videoRef.current, 0, 0)
        setCapturedPhoto(canvasRef.current.toDataURL('image/jpeg'))
        stopWebcam()
      }
    }
  }

  const uploadPhoto = async (file: File | Blob) => {
    if (!selectedCourierId) return
    setIsUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('photo', file, 'profile.jpg')
      await api.patch(`/admin/couriers/${selectedCourierId}/profile-photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('Foto profil berhasil dikunci')
      setCapturedPhoto(null)
      queryClient.invalidateQueries({ queryKey: ['admin-courier-detail', selectedCourierId] })
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal upload foto')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setCapturedPhoto(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Fetch Stats
  const { data: stats, isError: isStatsError, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['admin-couriers-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/couriers/stats')
      return res.data
    }
  })

  // Fetch Couriers List
  const { data: couriersData, isLoading, isError: isCouriersError, error: couriersError, refetch: refetchCouriers } = useQuery({
    queryKey: ['admin-couriers', search, filter, applicationChannel, page],
    queryFn: async () => {
      const res = await api.get('/admin/couriers', {
        params: {
          search,
          status: filter === 'All' ? undefined : filter,
          application_channel: applicationChannel === 'all' ? undefined : applicationChannel,
          page,
          limit: 10
        }
      })
      return res.data
    }
  })

  const { data: registrationLinks = [] } = useQuery<any[]>({
    queryKey: ['courier-registration-links'],
    queryFn: async () => {
      const res = await api.get('/admin/courier-registration-links')
      return res.data.data || []
    }
  })

  // Fetch Single Courier Detail
  const { data: courierDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['admin-courier-detail', selectedCourierId],
    queryFn: async () => {
      if (!selectedCourierId) return null
      const res = await api.get(`/admin/couriers/${selectedCourierId}`)
      return res.data
    },
    enabled: !!selectedCourierId
  })

  // Fetch Courier Order History
  const { data: courierHistory = [], isLoading: isLoadingHistory } = useQuery<any[]>({
    queryKey: ['admin-courier-history', selectedCourierId],
    queryFn: async () => {
      const res = await api.get(`/admin/couriers/${selectedCourierId}/history`)
      return res.data
    },
    enabled: !!selectedCourierId && detailTab === 'history'
  })

  // Update Status Mutation
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const res = await api.patch(`/admin/couriers/${id}/status`, { status })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-couriers'] })
      queryClient.invalidateQueries({ queryKey: ['admin-couriers-stats'] })
      queryClient.invalidateQueries({ queryKey: ['admin-courier-detail'] })
      toast.success('Courier status updated successfully')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update status')
    }
  })

  // Broadcast Mutation
  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/couriers/broadcast-onboarding', {
        courier_ids: selectedCourierIds,
        date: broadcastDate,
        time: broadcastTime,
        address: broadcastAddress
      })
      return res.data
    },
    onSuccess: () => {
      toast.success('Undangan basecamp berhasil dikirim ke kurir terpilih')
      setIsBroadcastModalOpen(false)
      setSelectedCourierIds([])
      setBroadcastDate('')
      setBroadcastTime('')
      setBroadcastAddress('')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal mengirim undangan')
    }
  })

  const createRegistrationLink = useMutation({
    mutationFn: async () => {
      const expiresInDays = Number(linkExpiryDays)
      const res = await api.post('/admin/courier-registration-links', {
        application_channel: linkChannel,
        title: 'Daftar Kurir Regular',
        expires_in_days: expiresInDays,
      })
      return res.data.data
    },
    onSuccess: async (data) => {
      setGeneratedLink(data.registration_url)
      setGeneratedLinkExpiresAt(data.expires_at || '')
      queryClient.invalidateQueries({ queryKey: ['courier-registration-links'] })
      try {
        await navigator.clipboard.writeText(data.registration_url)
        toast.success('Link pendaftaran dibuat dan disalin')
      } catch {
        toast.success('Link pendaftaran dibuat')
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal membuat link pendaftaran')
    }
  })

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const response = await api.get('/admin/couriers/export', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `couriers_export_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Courier list exported successfully')
    } catch (error) {
      toast.error('Failed to export couriers')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground-muted tracking-tight">Courier Management</h1>
          <p className="text-foreground-muted mt-1">Manage, verify, and monitor courier performance across the fleet.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="px-6 py-3 rounded-2xl bg-primary text-on-primary font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-60"
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
            Export List
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {isStatsError ? (
          <CourierPanelError
            title="Courier stats gagal dimuat"
            message={queryErrorMessage(statsError, 'Statistik kurir belum bisa diambil dari API admin.')}
            onRetry={() => refetchStats()}
          />
        ) : [
          { label: 'Total Couriers', value: stats?.total?.toLocaleString() ?? 'Tidak tersedia', icon: Users, color: 'text-foreground-muted' },
          { label: 'Active Now', value: stats?.active?.toLocaleString() ?? 'Tidak tersedia', icon: Truck, color: 'text-success' },
          { label: 'Pending Verification', value: stats?.pending?.toLocaleString() ?? 'Tidak tersedia', icon: Clock, color: 'text-warning' },
          { label: 'Suspended', value: stats?.suspended?.toLocaleString() ?? 'Tidak tersedia', icon: Ban, color: 'text-error' },
        ].map((stat, i) => (
          <div key={i} className="glass-card p-6 rounded-3xl border-border shadow-xl shadow-scrim">
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl bg-surface-subtle", stat.color)}>
                <stat.icon size={24} aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground-muted uppercase tracking-wide">{stat.label}</p>
                <p className="text-2xl font-black text-foreground-muted mt-1">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-surface/[0.02] p-4 rounded-[32px] border border-border">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted group-focus-within:text-primary-light transition-colors" size={18} aria-hidden="true" />
          <input 
            type="text" 
            aria-label="Search couriers by name, ID, or plate"
            placeholder="Search name, ID, or plate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-subtle border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-foreground-muted"
          />
        </div>
        <div className="flex items-center gap-2">
          {['All', 'Active', 'Pending', 'Suspended'].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                filter === t ? "bg-primary/20 text-foreground border border-primary/20" : "text-foreground-muted hover:text-foreground-muted hover:bg-surface-subtle"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        
        {selectedCourierIds.length > 0 && (
          <div className="flex items-center gap-3 border-l border-border pl-4">
            <span className="text-xs font-bold text-foreground-muted">
              {selectedCourierIds.length} terpilih
            </span>
            <button
              onClick={() => setIsBroadcastModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-light transition-colors flex items-center gap-2"
            >
              <FileText size={14} aria-hidden="true" />
              Broadcast Undangan Basecamp
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-card rounded-[32px] border-border p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Courier Type</p>
              <h2 className="mt-2 text-xl font-black text-foreground-muted">Pisahkan daftar kurir by role</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ['all', 'All'],
                ['on_demand', 'On-Demand'],
                ['regular', 'Regular'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setApplicationChannel(key)
                    setPage(1)
                  }}
                  className={cn(
                    'rounded-xl px-4 py-2 text-sm font-bold transition',
                    applicationChannel === key ? 'bg-primary text-on-primary' : 'bg-surface-subtle text-foreground-muted hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card rounded-[32px] border-border p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary-light">
              <Link2 size={22} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-foreground-muted">Share Registration Link</p>
              <h2 className="mt-2 text-xl font-black text-foreground-muted">Link daftar regular</h2>
              <div className="mt-4 flex gap-2">
                {[
                  ['regular', 'Regular'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLinkChannel(key as 'regular')}
                    className={cn(
                      'rounded-xl px-3 py-2 text-xs font-black transition',
                      linkChannel === key ? 'bg-primary text-on-primary' : 'bg-surface-subtle text-foreground-muted hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-border bg-surface/[0.03] p-3">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-xs font-black uppercase tracking-wide text-foreground-muted">Masa aktif</span>
                    <span className="mt-1 block text-sm font-bold text-foreground-muted">Link otomatis off setelah melewati jumlah hari ini</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={linkExpiryDays}
                      onChange={(event) => setLinkExpiryDays(event.target.value)}
                      className="w-16 bg-transparent text-right text-sm font-black text-foreground outline-none"
                    />
                    <span className="text-xs font-bold text-foreground-muted">hari</span>
                  </div>
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  const expiresInDays = Number(linkExpiryDays)
                  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
                    toast.error('Masa aktif link harus 1 sampai 365 hari')
                    return
                  }
                  createRegistrationLink.mutate()
                }}
                disabled={createRegistrationLink.isPending}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-on-primary transition hover:bg-primary-light disabled:opacity-60"
              >
                {createRegistrationLink.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
                Generate Link
              </button>
              {generatedLink && (
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(generatedLink)
                    toast.success('Link disalin')
                  }}
                  className="mt-3 flex w-full items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-left text-xs text-foreground-muted"
                >
                  <Copy size={14} className="shrink-0 text-primary-light" aria-hidden="true" />
                  <span className="truncate" title={generatedLink}>{generatedLink}</span>
                </button>
              )}
              {generatedLinkExpiresAt && (
                <p className="mt-2 text-xs font-bold text-warning">
                  Aktif sampai {new Date(generatedLinkExpiresAt).toLocaleString('id-ID')}. Setelah itu link off.
                </p>
              )}
              {registrationLinks.length > 0 && (
                <p className="mt-3 text-xs font-bold text-foreground-muted">
                  {registrationLinks.length} link terakhir tersimpan.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Courier Table */}
      <div className="glass-card rounded-[40px] border-border overflow-hidden shadow-2xl shadow-scrim">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface/[0.01]">
                <th scope="col" className="px-6 py-6 w-12 text-center">
                  <input 
                    type="checkbox"
                    aria-label="Select all couriers on this page"
                    className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-primary/50"
                    checked={couriersData?.data?.length > 0 && selectedCourierIds.length === couriersData.data.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCourierIds(couriersData.data.map((c: any) => c.id))
                      } else {
                        setSelectedCourierIds([])
                      }
                    }}
                  />
                </th>
                <th scope="col" className="px-8 py-6 text-xs font-black text-foreground-muted uppercase tracking-wide">Courier</th>
                <th scope="col" className="px-8 py-6 text-xs font-black text-foreground-muted uppercase tracking-wide">Status</th>
                <th scope="col" className="px-8 py-6 text-xs font-black text-foreground-muted uppercase tracking-wide">Avg Rating</th>
                <th scope="col" className="px-8 py-6 text-xs font-black text-foreground-muted uppercase tracking-wide">Location</th>
                <th scope="col" className="px-8 py-6 text-xs font-black text-foreground-muted uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
                      <p className="text-foreground-muted font-bold uppercase tracking-wide text-xs">Loading fleet data...</p>
                    </div>
                  </td>
                </tr>
              ) : isCouriersError ? (
                <CourierErrorRow
                  title="Courier gagal dimuat"
                  message={queryErrorMessage(couriersError, 'Daftar kurir belum bisa diambil dari API admin.')}
                  onRetry={() => refetchCouriers()}
                  colSpan={6}
                />
              ) : couriersData?.data?.length ? couriersData.data.map((courier: any, i: number) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={courier.id} 
                  className="hover:bg-surface/[0.02] transition-colors group"
                >
                  <td className="px-6 py-6 text-center">
                    <input 
                      type="checkbox"
                      aria-label={`Select courier ${courier.name || courier.id}`}
                      className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-primary/50"
                      checked={selectedCourierIds.includes(courier.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCourierIds(prev => [...prev, courier.id])
                        } else {
                          setSelectedCourierIds(prev => prev.filter(id => id !== courier.id))
                        }
                      }}
                    />
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-surface-raised flex items-center justify-center text-foreground-muted font-bold text-lg border border-border group-hover:border-primary/20 transition-all uppercase">
                        {courier.full_name?.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground-muted">{courier.full_name}</p>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-surface-raised text-foreground-muted border border-border uppercase font-bold">
                            {courier.application_channel?.replace('_', ' ') || courier.vehicle_type || 'Belum tersedia'}
                          </span>
                        </div>
                        <p className="text-xs text-foreground-muted mt-0.5">{courier.id.split('-')[0]} • {courier.plate_number || 'Plat belum tersedia'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <StatusBadge status={courier.status} labelPrefix="Courier status" />
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center text-sm font-black text-foreground-muted">
                        {Number.isFinite(Number(courier.avg_rating)) ? Number(courier.avg_rating).toFixed(1) : '—'}
                      </div>
                      <div className="flex-1 max-w-[100px] h-1.5 bg-surface-subtle rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full", Number(courier.avg_rating) > 4.5 ? "bg-success" : Number(courier.avg_rating) > 3.5 ? "bg-warning" : "bg-error")}
                          style={{ width: `${Number.isFinite(Number(courier.avg_rating)) ? (Number(courier.avg_rating) / 5) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 text-foreground-muted">
                      <MapPin size={14} className="text-foreground-muted" aria-hidden="true" />
                      <span className="text-sm font-medium">{courier.current_location || 'Lokasi belum tersedia'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        type="button"
                        onClick={() => setSelectedCourierId(courier.id)}
                        aria-label={`View courier ${courier.full_name || courier.id}`}
                        title="View courier details"
                        className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-foreground hover:bg-surface-subtle transition-all"
                      >
                        <ExternalLink size={18} aria-hidden="true" />
                      </button>
                      {courier.status !== 'Suspended' ? (
                        <button 
                          type="button"
                          onClick={() => updateStatus.mutate({ id: courier.id, status: 'Suspended' })}
                          aria-label={`Suspend courier ${courier.full_name || courier.id}`}
                          title="Suspend courier"
                          className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-error hover:bg-error-surface transition-all"
                        >
                          <Ban size={18} aria-hidden="true" />
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => updateStatus.mutate({ id: courier.id, status: 'Active' })}
                          aria-label={`Reactivate courier ${courier.full_name || courier.id}`}
                          title="Reactivate courier"
                          className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-success hover:bg-success-surface transition-all"
                        >
                          <CheckCircle size={18} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <Package className="w-10 h-10 text-foreground-muted mx-auto mb-4" aria-hidden="true" />
                    <p className="text-foreground-muted font-bold uppercase tracking-wide text-xs">Tidak ada kurir dari database untuk filter ini.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-8 py-6 border-t border-border flex items-center justify-between bg-surface/[0.01]">
          <p className="text-xs text-foreground-muted font-bold uppercase tracking-wide">
            Showing {couriersData?.data?.length || 0} of {couriersData?.pagination?.total || 0} Couriers
          </p>
          <div className="flex items-center gap-2">
            <button 
              aria-label="Previous courier page" title="Previous courier page"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-foreground disabled:opacity-60 disabled:hover:bg-surface-subtle transition-all"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <div className="flex items-center gap-1">
              {[...Array(couriersData?.pagination?.pages || 0)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={cn(
                    "w-10 h-10 rounded-xl font-bold text-sm transition-all",
                    page === i + 1 ? "bg-primary text-on-primary shadow-lg shadow-primary/20" : "bg-surface-subtle text-foreground-muted hover:bg-surface-subtle"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button 
              aria-label="Next courier page" title="Next courier page"
              disabled={page === (couriersData?.pagination?.pages || 1)}
              onClick={() => setPage(p => p + 1)}
              className="p-2.5 rounded-xl bg-surface-subtle text-foreground-muted hover:text-foreground disabled:opacity-60 disabled:hover:bg-surface-subtle transition-all"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Broadcast Modal */}
      <AnimatePresence>
        {isBroadcastModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBroadcastModalOpen(false)}
              className="absolute inset-0 bg-scrim/80 backdrop-blur-sm"
            />
            <FocusTrap active={isBroadcastModalOpen} className="w-full max-w-lg">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="courier-broadcast-title"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setIsBroadcastModalOpen(false)
              }}
              className="glass-card w-full max-w-lg p-8 rounded-[32px] relative z-10 border-border shadow-3xl"
            >
              <h2 id="courier-broadcast-title" className="text-2xl font-black text-foreground-muted">Broadcast Undangan Basecamp</h2>
              <p className="text-sm text-foreground-muted mt-2">Kirim undangan ke {selectedCourierIds.length} kurir terpilih.</p>

              <div className="space-y-4 mt-6">
                <div>
                  <label htmlFor="courier-broadcast-date" className="text-xs font-bold text-foreground-muted tracking-wide">Tanggal</label>
                  <input
                    id="courier-broadcast-date"
                    name="broadcast-date"
                    type="date"
                    value={broadcastDate}
                    onChange={(e) => setBroadcastDate(e.target.value)}
                    className="w-full mt-2 bg-surface border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="courier-broadcast-time" className="text-xs font-bold text-foreground-muted tracking-wide">Jam</label>
                  <input
                    id="courier-broadcast-time"
                    name="broadcast-time"
                    type="time"
                    value={broadcastTime}
                    onChange={(e) => setBroadcastTime(e.target.value)}
                    className="w-full mt-2 bg-surface border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="courier-broadcast-address" className="text-xs font-bold text-foreground-muted tracking-wide">Alamat Basecamp</label>
                  <textarea
                    id="courier-broadcast-address"
                    name="broadcast-address"
                    value={broadcastAddress}
                    onChange={(e) => setBroadcastAddress(e.target.value)}
                    className="w-full mt-2 bg-surface border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary transition-colors"
                    rows={3}
                    placeholder="Masukkan alamat lengkap..."
                  />
                </div>

                <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl mt-4">
                  <p className="text-xs font-black text-primary-light uppercase tracking-wide mb-2">Preview Pesan</p>
                  <p className="text-sm text-foreground-muted italic">
                    "Halo <span className="text-primary font-bold">{"{nama_kurir}"}</span>! Pendaftaran kamu sudah disetujui. Silakan datang ke basecamp untuk pengambilan atribut pada tanggal <span className="text-primary font-bold">{broadcastDate || '[Tanggal]'}</span> jam <span className="text-primary font-bold">{broadcastTime || '[Jam]'}</span>. Lokasi: <span className="text-primary font-bold">{broadcastAddress || '[Alamat]'}</span>."
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsBroadcastModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-foreground-muted hover:text-foreground transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => broadcastMutation.mutate()}
                  disabled={!broadcastDate || !broadcastTime || !broadcastAddress || broadcastMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-light transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {broadcastMutation.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
                  Kirim Broadcast
                </button>
              </div>
            </motion.div>
            </FocusTrap>
          </div>
        )}
      </AnimatePresence>

      {/* Courier Detail Modal */}
      <AnimatePresence>
        {selectedCourierId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { stopWebcam(); setSelectedCourierId(null); setDetailTab('profile') }}
              className="absolute inset-0 bg-scrim/80 backdrop-blur-sm"
            />
            <FocusTrap active={Boolean(selectedCourierId)} className="w-full max-w-4xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="courier-detail-title"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  stopWebcam()
                  setSelectedCourierId(null)
                  setDetailTab('profile')
                }
              }}
              className="glass-card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-10 rounded-[48px] relative z-10 border-border shadow-3xl shadow-scrim"
            >
              {/* Tab Switcher */}
              {!isLoadingDetail && courierDetail && (
                <div className="flex gap-2 mb-8 border-b border-border pb-px">
                  {(['profile', 'history', 'photo'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => { if (detailTab === 'photo' && tab !== 'photo') stopWebcam(); setDetailTab(tab); }}
                      className={cn(
                        'px-6 py-3 text-sm font-bold capitalize transition-all relative flex items-center gap-2',
                        detailTab === tab ? 'text-primary-light' : 'text-foreground-muted hover:text-foreground-muted'
                      )}
                    >
                      {tab === 'profile' ? <ShieldCheck size={15} aria-hidden="true" /> : tab === 'history' ? <History size={15} aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}
                      {tab === 'profile' ? 'Profile' : tab === 'history' ? 'Order History' : 'Profile Photo'}
                      {detailTab === tab && (
                        <motion.div layoutId="courierTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-light" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {isLoadingDetail ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" aria-hidden="true" />
                  <p className="text-foreground-muted font-black uppercase tracking-wide">Retrieving dossier...</p>
                </div>
              ) : courierDetail && detailTab === 'profile' && (
                <div className="flex flex-col md:flex-row gap-10">
                  <div className="md:w-1/3 space-y-6">
                    <div className="aspect-square rounded-[32px] bg-surface border border-border overflow-hidden flex items-center justify-center text-6xl font-black text-foreground-muted uppercase shadow-inner">
                      <AuthPhoto
                        photoUrl={courierDetail.photo_url}
                        alt={courierDetail.full_name}
                        fallback={<span>{courierDetail.full_name?.charAt(0)}</span>}
                      />
                    </div>
                    <div className="space-y-4">
                      {courierDetail.status === 'Pending' && (
                        <button 
                          onClick={() => updateStatus.mutate({ id: courierDetail.id, status: 'Active' })}
                          disabled={updateStatus.isPending}
                          className="w-full py-4 rounded-2xl bg-success text-on-success font-black uppercase tracking-wide text-sm shadow-lg shadow-success hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                        >
                          <CheckCircle size={20} aria-hidden="true" />
                          {updateStatus.isPending ? 'Processing...' : 'Verify Courier'}
                        </button>
                      )}
                      {courierDetail.status !== 'Suspended' ? (
                        <button 
                          onClick={() => updateStatus.mutate({ id: courierDetail.id, status: 'Suspended' })}
                          disabled={updateStatus.isPending}
                          className="w-full py-4 rounded-2xl bg-error-surface text-error border border-error font-black uppercase tracking-wide text-sm hover:bg-error-surface transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                        >
                          <Ban size={20} aria-hidden="true" />
                          {updateStatus.isPending ? 'Processing...' : 'Suspend Access'}
                        </button>
                      ) : (
                        <button 
                          onClick={() => updateStatus.mutate({ id: courierDetail.id, status: 'Active' })}
                          disabled={updateStatus.isPending}
                          className="w-full py-4 rounded-2xl bg-success-surface text-success border border-success font-black uppercase tracking-wide text-sm hover:bg-success-surface transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                        >
                          <CheckCircle size={20} aria-hidden="true" />
                          {updateStatus.isPending ? 'Processing...' : 'Activate Access'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="md:w-2/3 space-y-10">
                    <div className="flex items-start justify-between border-b border-border pb-8">
                      <div>
                        <h2 id="courier-detail-title" className="text-4xl font-black text-foreground-muted tracking-tighter">{courierDetail.full_name}</h2>
                        <p className="text-foreground-muted font-medium mt-1">{courierDetail.id} • {courierDetail.plate_number || 'No Plate'}</p>
                        <p className="text-xs text-primary-light font-bold mt-2 flex items-center gap-2">
                          <MapPin size={12} aria-hidden="true" />
                          {courierDetail.current_location || 'Last location unknown'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-foreground-muted uppercase tracking-wide mb-1">Fleet Rating</p>
                        <div className="flex items-center gap-2">
                          <div className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary-light border border-primary/20 flex items-center gap-2">
                            <Star size={16} fill="currentColor" aria-hidden="true" />
                            <span className="font-black text-lg">{parseFloat(courierDetail.avg_rating || '0').toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="p-6 rounded-3xl bg-surface/[0.02] border border-border shadow-xl">
                        <p className="text-xs font-bold text-foreground-muted uppercase tracking-wide mb-4">Contact Info</p>
                        <div className="space-y-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-foreground-muted font-black uppercase">Phone Number</span>
                            <span className="text-sm font-bold text-foreground-muted">{courierDetail.phone_number || 'Not provided'}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-foreground-muted font-black uppercase">Email Address</span>
                            <span className="text-sm font-bold text-foreground-muted">{courierDetail.email || 'Not provided'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="p-6 rounded-3xl bg-surface/[0.02] border border-border shadow-xl">
                        <p className="text-xs font-bold text-foreground-muted uppercase tracking-wide mb-4">Verification Artifacts</p>
                        <div className="space-y-3">
                          {courierDetail.documents?.map((doc: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-surface-subtle border border-border">
                              <div className="flex items-center gap-3">
                                <FileText size={16} className="text-primary-light" aria-hidden="true" />
                                <span className="text-sm text-foreground-muted capitalize">{doc.type?.replace(/_/g, ' ')}</span>
                              </div>
                              <CheckCircle size={14} className="text-success" aria-hidden="true" />
                            </div>
                          )) || (
                            <p className="text-xs text-foreground-muted italic">No documents uploaded</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-foreground-muted mb-6 flex items-center gap-2">
                        <ShieldCheck className="text-primary-light" size={20} aria-hidden="true" />
                        Fleet Feedback (Last 5)
                      </h3>
                      <div className="space-y-4">
                        {courierDetail.recent_ratings?.length > 0 ? courierDetail.recent_ratings.map((rating: any, i: number) => (
                          <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-surface/[0.01] border border-border group hover:bg-surface/[0.03] transition-all">
                            <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-primary-light font-black border border-border">
                              {rating.rating}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-foreground-muted font-medium italic">"{rating.comment || 'No comment provided'}"</p>
                              <p className="text-xs text-foreground-muted mt-2 font-bold uppercase tracking-wide">
                                Order #{rating.order_id?.split('-')[0]} • {new Date(rating.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        )) : (
                          <div className="p-8 rounded-2xl bg-surface/[0.01] border border-dashed border-border text-center">
                            <p className="text-sm text-foreground-muted">No feedback found for this operative.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Order History Tab */}
              {!isLoadingDetail && courierDetail && detailTab === 'history' && (
                <div>
                  {isLoadingHistory ? (
                    <div className="flex flex-col items-center py-16 gap-4">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" aria-hidden="true" />
                      <p className="text-foreground-muted text-sm uppercase tracking-wide font-bold">Loading history...</p>
                    </div>
                  ) : courierHistory.length === 0 ? (
                    <div className="text-center py-16 text-foreground-muted">
                      <Package size={48} className="mx-auto mb-4 opacity-30" aria-hidden="true" />
                      <p className="font-bold">No order history found.</p>
                      <p className="text-sm mt-1">This courier hasn't completed any legs yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {courierHistory.map((order: any, i: number) => (
                        <motion.div
                          key={order.id || i}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="flex items-center justify-between p-5 rounded-2xl bg-surface/[0.02] border border-border hover:bg-surface/[0.04] transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center">
                              <Package size={18} aria-hidden="true" className="text-primary-light" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-foreground-muted">
                                #{(order.id || '').split('-')[0]?.toUpperCase()}
                              </p>
                              <p className="text-xs text-foreground-muted mt-0.5">
                                {order.pickup_address || 'N/A'} → {order.delivery_address || 'N/A'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <OrderStatusBadge
                              status={order.leg_status || order.status || 'unknown'}
                              className="px-3 py-1 text-xs"
                            />
                            <p className="text-xs text-foreground-muted mt-1">
                              {order.created_at ? new Date(order.created_at).toLocaleDateString('id-ID') : '-'}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Profile Photo Tab */}
              {!isLoadingDetail && courierDetail && detailTab === 'photo' && (
                <div className="flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-black text-foreground-muted">Set Courier Profile Photo</h3>
                      <p className="text-foreground-muted text-sm mt-1">Photo ini akan digunakan saat dispatching order agar customer melihat foto verified dari basecamp.</p>
                      {courierDetail.profile_photo_locked_at ? (
                        <p className="text-success text-xs mt-2 font-bold flex items-center gap-1">
                          <CheckCircle size={12} aria-hidden="true" />
                          Locked at {new Date(courierDetail.profile_photo_locked_at).toLocaleString('id-ID')}
                        </p>
                      ) : (
                        <p className="text-warning text-xs mt-2 font-bold flex items-center gap-1">
                          <AlertCircle size={12} aria-hidden="true" />
                          Not Locked. Kurir tidak akan menerima order.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Current Photo / Webcam View */}
                    <div className="glass-card p-6 rounded-[32px] border-border flex flex-col items-center justify-center gap-6 min-h-[300px]">
                      {isWebcamActive ? (
                        <div className="relative w-full aspect-[3/4] max-w-[280px] rounded-2xl overflow-hidden bg-scrim border-2 border-primary">
                          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                          <canvas ref={canvasRef} className="hidden" />
                          <button
                            onClick={capturePhoto}
                            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-primary text-on-primary rounded-full font-bold shadow-lg"
                          >
                            Capture
                          </button>
                        </div>
                      ) : capturedPhoto ? (
                        <div className="relative w-full aspect-[3/4] max-w-[280px] rounded-2xl overflow-hidden border border-border">
                          <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setCapturedPhoto(null)}
                            aria-label="Retake courier photo"
                            title="Retake courier photo"
                            className="absolute top-2 right-2 p-2 bg-scrim/50 hover:bg-scrim/80 rounded-full text-foreground transition"
                          >
                            <RefreshCw size={16} aria-hidden="true" />
                          </button>
                        </div>
                      ) : courierDetail.photo_url ? (
                        <div className="relative w-full aspect-[3/4] max-w-[280px] rounded-2xl overflow-hidden border border-border">
                          <AuthPhoto
                            photoUrl={courierDetail.photo_url}
                            alt="Current Profile"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-foreground-muted">
                          <ImageIcon size={48} className="opacity-50" aria-hidden="true" />
                          <p className="text-sm font-bold uppercase tracking-wide">No Photo Available</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-4 justify-center">
                      {!isWebcamActive && !capturedPhoto && (
                        <>
                          <button
                            onClick={() => startWebcam()}
                            className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-primary/10 text-primary-light border border-primary/20 hover:bg-primary/20 transition-all font-bold"
                          >
                            <Camera size={20} aria-hidden="true" />
                            Take Photo with Webcam
                          </button>
                          
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFileUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-surface-subtle border border-border hover:bg-surface-subtle transition-all font-bold text-foreground-muted">
                              <Upload size={20} aria-hidden="true" />
                              Upload File
                            </div>
                          </div>
                        </>
                      )}

                      {isWebcamActive && (
                        <div className="flex flex-col gap-4 justify-center w-full">
                          <div className="p-4 rounded-2xl bg-surface-subtle border border-border space-y-3">
                            <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted flex items-center gap-2">
                              <Camera size={14} className="text-primary" aria-hidden="true" />
                              Pilih Perangkat Kamera
                            </label>
                            {videoDevices.length === 0 ? (
                              <div className="text-xs text-foreground-muted py-1 font-medium">
                                Mendeteksi kamera eksternal & webcam...
                              </div>
                            ) : (
                              <select
                                value={selectedDeviceId}
                                onChange={(e) => switchCamera(e.target.value)}
                                className="w-full rounded-xl border border-border bg-scrim/60 px-3 py-2.5 text-sm font-semibold text-foreground-muted focus:border-primary focus:outline-none transition-all cursor-pointer"
                              >
                                {videoDevices.map((device, idx) => (
                                  <option key={device.deviceId || idx} value={device.deviceId}>
                                    {device.label || `Kamera / Webcam ${idx + 1}`}
                                  </option>
                                ))}
                              </select>
                            )}
                            <p className="text-xs text-foreground-muted leading-relaxed">
                              Mendukung kamera eksternal (USB Webcam / kamera eksternal) atau kamera bawaan laptop/PC.
                            </p>
                          </div>

                          <button
                            onClick={capturePhoto}
                            className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-primary text-on-primary shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all font-bold"
                          >
                            <Camera size={20} aria-hidden="true" />
                            Jepret Foto Sekarang
                          </button>

                          <button
                            onClick={stopWebcam}
                            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-surface-subtle border border-border hover:bg-surface-subtle text-foreground-muted hover:text-foreground transition-all font-semibold text-sm"
                          >
                            Tutup Kamera
                          </button>
                        </div>
                      )}

                      {capturedPhoto && (
                        <button
                          onClick={async () => {
                            const res = await fetch(capturedPhoto);
                            const blob = await res.blob();
                            uploadPhoto(blob);
                          }}
                          disabled={isUploadingPhoto}
                          className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-success text-on-success shadow-lg hover:bg-success transition-all font-bold disabled:opacity-60"
                        >
                          {isUploadingPhoto ? <Loader2 className="animate-spin" size={20} aria-hidden="true" /> : <CheckCircle size={20} aria-hidden="true" />}
                          Save & Lock Photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
            </FocusTrap>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
