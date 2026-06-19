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
import { cn } from '../lib/utils'
import { toast } from 'sonner'



const queryErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

function CourierErrorRow({ title, message, onRetry, colSpan = 5 }: { title: string; message: string; onRetry: () => void; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-8 py-20 text-center">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <div>
            <p className="text-zinc-100 font-black uppercase tracking-widest text-xs">{title}</p>
            <p className="text-zinc-600 text-xs mt-2">{message}</p>
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
      </td>
    </tr>
  )
}

function CourierPanelError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[32px] border border-red-500/20 bg-red-500/5 p-8 text-center space-y-4 md:col-span-4">
      <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
      <div>
        <p className="text-zinc-100 font-black uppercase tracking-widest text-xs">{title}</p>
        <p className="text-zinc-600 text-xs mt-2">{message}</p>
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

  // Webcam States
  const [isWebcamActive, setIsWebcamActive] = useState(false)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const startWebcam = async () => {
    try {
      setIsWebcamActive(true)
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      toast.error('Tidak dapat mengakses webcam')
      setIsWebcamActive(false)
    }
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
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Courier Management</h1>
          <p className="text-zinc-500 mt-1">Manage, verify, and monitor courier performance across the fleet.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="px-6 py-3 rounded-2xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
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
          { label: 'Total Couriers', value: stats?.total?.toLocaleString() ?? 'Tidak tersedia', icon: Users, color: 'text-zinc-400' },
          { label: 'Active Now', value: stats?.active?.toLocaleString() ?? 'Tidak tersedia', icon: Truck, color: 'text-emerald-400' },
          { label: 'Pending Verification', value: stats?.pending?.toLocaleString() ?? 'Tidak tersedia', icon: Clock, color: 'text-amber-400' },
          { label: 'Suspended', value: stats?.suspended?.toLocaleString() ?? 'Tidak tersedia', icon: Ban, color: 'text-red-400' },
        ].map((stat, i) => (
          <div key={i} className="glass-card p-6 rounded-3xl border-white/5 shadow-xl shadow-black/20">
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl bg-white/5", stat.color)}>
                <stat.icon size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                <p className="text-2xl font-black text-zinc-100 mt-1">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/[0.02] p-4 rounded-[32px] border border-white/5">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary-light transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search name, ID, or plate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
          />
        </div>
        <div className="flex items-center gap-2">
          {['All', 'Active', 'Pending', 'Suspended'].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                filter === t ? "bg-primary/20 text-primary-light border border-primary/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-card rounded-[32px] border-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-600">Courier Type</p>
              <h2 className="mt-2 text-xl font-black text-zinc-100">Pisahkan daftar kurir by role</h2>
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
                    applicationChannel === key ? 'bg-primary text-white' : 'bg-white/5 text-zinc-500 hover:text-white'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card rounded-[32px] border-white/5 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary-light">
              <Link2 size={22} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-600">Share Registration Link</p>
              <h2 className="mt-2 text-xl font-black text-zinc-100">Link daftar regular</h2>
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
                      linkChannel === key ? 'bg-primary text-white' : 'bg-white/5 text-zinc-500 hover:text-white'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-xs font-black uppercase tracking-[0.18em] text-zinc-600">Masa aktif</span>
                    <span className="mt-1 block text-sm font-bold text-zinc-300">Link otomatis off setelah melewati jumlah hari ini</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={linkExpiryDays}
                      onChange={(event) => setLinkExpiryDays(event.target.value)}
                      className="w-16 bg-transparent text-right text-sm font-black text-white outline-none"
                    />
                    <span className="text-xs font-bold text-zinc-500">hari</span>
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
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white transition hover:bg-primary-light disabled:opacity-50"
              >
                {createRegistrationLink.isPending ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                Generate Link
              </button>
              {generatedLink && (
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(generatedLink)
                    toast.success('Link disalin')
                  }}
                  className="mt-3 flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-left text-xs text-zinc-400"
                >
                  <Copy size={14} className="shrink-0 text-primary-light" />
                  <span className="truncate">{generatedLink}</span>
                </button>
              )}
              {generatedLinkExpiresAt && (
                <p className="mt-2 text-[11px] font-bold text-amber-300">
                  Aktif sampai {new Date(generatedLinkExpiresAt).toLocaleString('id-ID')}. Setelah itu link off.
                </p>
              )}
              {registrationLinks.length > 0 && (
                <p className="mt-3 text-[11px] font-bold text-zinc-600">
                  {registrationLinks.length} link terakhir tersimpan.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Courier Table */}
      <div className="glass-card rounded-[40px] border-white/5 overflow-hidden shadow-2xl shadow-black/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01]">
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Courier</th>
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Status</th>
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Avg Rating</th>
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Location</th>
                <th className="px-8 py-6 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Loading fleet data...</p>
                    </div>
                  </td>
                </tr>
              ) : isCouriersError ? (
                <CourierErrorRow
                  title="Courier gagal dimuat"
                  message={queryErrorMessage(couriersError, 'Daftar kurir belum bisa diambil dari API admin.')}
                  onRetry={() => refetchCouriers()}
                />
              ) : couriersData?.data?.length ? couriersData.data.map((courier: any, i: number) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={courier.id} 
                  className="hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-lg border border-white/5 group-hover:border-primary/20 transition-all uppercase">
                        {courier.full_name?.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-zinc-100">{courier.full_name}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500 border border-white/5 uppercase font-bold">
                            {courier.application_channel?.replace('_', ' ') || courier.vehicle_type || 'Belum tersedia'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">{courier.id.split('-')[0]} • {courier.plate_number || 'Plat belum tersedia'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className={cn(
                      "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      courier.status === 'Active' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                      courier.status === 'Pending' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                      "bg-red-500/10 text-red-400 border border-red-500/20"
                    )}>
                      <div className={cn("w-1.5 h-1.5 rounded-full", 
                        courier.status === 'Active' ? "bg-emerald-400 animate-pulse" :
                        courier.status === 'Pending' ? "bg-amber-400" : "bg-red-400"
                      )} />
                      {courier.status}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center text-sm font-black text-zinc-100">
                        {Number.isFinite(Number(courier.avg_rating)) ? Number(courier.avg_rating).toFixed(1) : '—'}
                      </div>
                      <div className="flex-1 max-w-[100px] h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full", Number(courier.avg_rating) > 4.5 ? "bg-emerald-500" : Number(courier.avg_rating) > 3.5 ? "bg-amber-500" : "bg-red-500")}
                          style={{ width: `${Number.isFinite(Number(courier.avg_rating)) ? (Number(courier.avg_rating) / 5) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <MapPin size={14} className="text-zinc-600" />
                      <span className="text-sm font-medium">{courier.current_location || 'Lokasi belum tersedia'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setSelectedCourierId(courier.id)}
                        className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
                      >
                        <ExternalLink size={18} />
                      </button>
                      {courier.status !== 'Suspended' ? (
                        <button 
                          onClick={() => updateStatus.mutate({ id: courier.id, status: 'Suspended' })}
                          className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <Ban size={18} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => updateStatus.mutate({ id: courier.id, status: 'Active' })}
                          className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                        >
                          <CheckCircle size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <Package className="w-10 h-10 text-zinc-800 mx-auto mb-4" />
                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Tidak ada kurir dari database untuk filter ini.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-8 py-6 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
          <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest">
            Showing {couriersData?.data?.length || 0} of {couriersData?.pagination?.total || 0} Couriers
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1">
              {[...Array(couriersData?.pagination?.pages || 0)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={cn(
                    "w-10 h-10 rounded-xl font-bold text-sm transition-all",
                    page === i + 1 ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-white/5 text-zinc-500 hover:bg-white/10"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button 
              disabled={page === (couriersData?.pagination?.pages || 1)}
              onClick={() => setPage(p => p + 1)}
              className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Courier Detail Modal */}
      <AnimatePresence>
        {selectedCourierId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSelectedCourierId(null); setDetailTab('profile') }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-10 rounded-[48px] relative z-10 border-white/10 shadow-3xl shadow-black/60"
            >
              {/* Tab Switcher */}
              {!isLoadingDetail && courierDetail && (
                <div className="flex gap-2 mb-8 border-b border-white/5 pb-px">
                  {(['profile', 'history', 'photo'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      className={cn(
                        'px-6 py-3 text-sm font-bold capitalize transition-all relative flex items-center gap-2',
                        detailTab === tab ? 'text-primary-light' : 'text-zinc-500 hover:text-zinc-300'
                      )}
                    >
                      {tab === 'profile' ? <ShieldCheck size={15} /> : tab === 'history' ? <History size={15} /> : <Camera size={15} />}
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
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <p className="text-zinc-500 font-black uppercase tracking-widest">Retrieving dossier...</p>
                </div>
              ) : courierDetail && detailTab === 'profile' && (
                <div className="flex flex-col md:flex-row gap-10">
                  <div className="md:w-1/3 space-y-6">
                    <div className="aspect-square rounded-[32px] bg-zinc-900 border border-white/10 flex items-center justify-center text-6xl font-black text-zinc-700 uppercase shadow-inner">
                      {courierDetail.full_name?.charAt(0)}
                    </div>
                    <div className="space-y-4">
                      {courierDetail.status === 'Pending' && (
                        <button 
                          onClick={() => updateStatus.mutate({ id: courierDetail.id, status: 'Active' })}
                          disabled={updateStatus.isPending}
                          className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          <CheckCircle size={20} />
                          {updateStatus.isPending ? 'Processing...' : 'Verify Courier'}
                        </button>
                      )}
                      {courierDetail.status !== 'Suspended' ? (
                        <button 
                          onClick={() => updateStatus.mutate({ id: courierDetail.id, status: 'Suspended' })}
                          disabled={updateStatus.isPending}
                          className="w-full py-4 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 font-black uppercase tracking-widest text-sm hover:bg-red-500/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          <Ban size={20} />
                          {updateStatus.isPending ? 'Processing...' : 'Suspend Access'}
                        </button>
                      ) : (
                        <button 
                          onClick={() => updateStatus.mutate({ id: courierDetail.id, status: 'Active' })}
                          disabled={updateStatus.isPending}
                          className="w-full py-4 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black uppercase tracking-widest text-sm hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          <CheckCircle size={20} />
                          {updateStatus.isPending ? 'Processing...' : 'Activate Access'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="md:w-2/3 space-y-10">
                    <div className="flex items-start justify-between border-b border-white/5 pb-8">
                      <div>
                        <h2 className="text-4xl font-black text-zinc-100 tracking-tighter">{courierDetail.full_name}</h2>
                        <p className="text-zinc-500 font-medium mt-1">{courierDetail.id} • {courierDetail.plate_number || 'No Plate'}</p>
                        <p className="text-xs text-primary-light font-bold mt-2 flex items-center gap-2">
                          <MapPin size={12} />
                          {courierDetail.current_location || 'Last location unknown'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-zinc-600 uppercase tracking-widest mb-1">Fleet Rating</p>
                        <div className="flex items-center gap-2">
                          <div className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary-light border border-primary/20 flex items-center gap-2">
                            <Star size={16} fill="currentColor" />
                            <span className="font-black text-lg">{parseFloat(courierDetail.avg_rating || '0').toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 shadow-xl">
                        <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-4">Contact Info</p>
                        <div className="space-y-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 font-black uppercase">Phone Number</span>
                            <span className="text-sm font-bold text-zinc-100">{courierDetail.phone_number || 'Not provided'}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 font-black uppercase">Email Address</span>
                            <span className="text-sm font-bold text-zinc-100">{courierDetail.email || 'Not provided'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 shadow-xl">
                        <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-4">Verification Artifacts</p>
                        <div className="space-y-3">
                          {courierDetail.documents?.map((doc: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                              <div className="flex items-center gap-3">
                                <FileText size={16} className="text-primary-light" />
                                <span className="text-sm text-zinc-300 capitalize">{doc.type?.replace(/_/g, ' ')}</span>
                              </div>
                              <CheckCircle size={14} className="text-emerald-500" />
                            </div>
                          )) || (
                            <p className="text-xs text-zinc-600 italic">No documents uploaded</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-zinc-100 mb-6 flex items-center gap-2">
                        <ShieldCheck className="text-primary-light" size={20} />
                        Fleet Feedback (Last 5)
                      </h3>
                      <div className="space-y-4">
                        {courierDetail.recent_ratings?.length > 0 ? courierDetail.recent_ratings.map((rating: any, i: number) => (
                          <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.01] border border-white/5 group hover:bg-white/[0.03] transition-all">
                            <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-primary-light font-black border border-white/5">
                              {rating.rating}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-zinc-300 font-medium italic">"{rating.comment || 'No comment provided'}"</p>
                              <p className="text-[10px] text-zinc-600 mt-2 font-bold uppercase tracking-widest">
                                Order #{rating.order_id?.split('-')[0]} • {new Date(rating.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        )) : (
                          <div className="p-8 rounded-2xl bg-white/[0.01] border border-dashed border-white/10 text-center">
                            <p className="text-sm text-zinc-600">No feedback found for this operative.</p>
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
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <p className="text-zinc-500 text-sm uppercase tracking-widest font-bold">Loading history...</p>
                    </div>
                  ) : courierHistory.length === 0 ? (
                    <div className="text-center py-16 text-zinc-600">
                      <Package size={48} className="mx-auto mb-4 opacity-30" />
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
                          className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center">
                              <Package size={18} className="text-primary-light" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-zinc-100">
                                #{(order.id || '').split('-')[0]?.toUpperCase()}
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {order.pickup_address || 'N/A'} → {order.delivery_address || 'N/A'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn(
                              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest',
                              order.leg_status === 'delivered' || order.status === 'delivered'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : order.status === 'cancelled'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            )}>
                              {order.leg_status || order.status || 'unknown'}
                            </div>
                            <p className="text-xs text-zinc-600 mt-1">
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
                      <h3 className="text-xl font-black text-zinc-100">Set Courier Profile Photo</h3>
                      <p className="text-zinc-500 text-sm mt-1">Photo ini akan digunakan saat dispatching order agar customer melihat foto verified dari basecamp.</p>
                      {courierDetail.profile_photo_locked_at ? (
                        <p className="text-emerald-400 text-xs mt-2 font-bold flex items-center gap-1">
                          <CheckCircle size={12} />
                          Locked at {new Date(courierDetail.profile_photo_locked_at).toLocaleString('id-ID')}
                        </p>
                      ) : (
                        <p className="text-amber-400 text-xs mt-2 font-bold flex items-center gap-1">
                          <AlertCircle size={12} />
                          Not Locked. Kurir tidak akan menerima order.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Current Photo / Webcam View */}
                    <div className="glass-card p-6 rounded-[32px] border-white/5 flex flex-col items-center justify-center gap-6 min-h-[300px]">
                      {isWebcamActive ? (
                        <div className="relative w-full aspect-[3/4] max-w-[280px] rounded-2xl overflow-hidden bg-black border-2 border-primary">
                          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                          <canvas ref={canvasRef} className="hidden" />
                          <button
                            onClick={capturePhoto}
                            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-primary text-white rounded-full font-bold shadow-lg"
                          >
                            Capture
                          </button>
                        </div>
                      ) : capturedPhoto ? (
                        <div className="relative w-full aspect-[3/4] max-w-[280px] rounded-2xl overflow-hidden border border-white/10">
                          <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
                          <button
                            onClick={() => setCapturedPhoto(null)}
                            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition"
                          >
                            <RefreshCw size={16} />
                          </button>
                        </div>
                      ) : courierDetail.photo_url ? (
                        <div className="relative w-full aspect-[3/4] max-w-[280px] rounded-2xl overflow-hidden border border-white/10">
                          <img src={courierDetail.photo_url} alt="Current Profile" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-zinc-600">
                          <ImageIcon size={48} className="opacity-50" />
                          <p className="text-sm font-bold uppercase tracking-widest">No Photo Available</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-4 justify-center">
                      {!isWebcamActive && !capturedPhoto && (
                        <>
                          <button
                            onClick={startWebcam}
                            className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-primary/10 text-primary-light border border-primary/20 hover:bg-primary/20 transition-all font-bold"
                          >
                            <Camera size={20} />
                            Take Photo with Webcam
                          </button>
                          
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFileUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all font-bold text-zinc-300">
                              <Upload size={20} />
                              Upload File
                            </div>
                          </div>
                        </>
                      )}

                      {capturedPhoto && (
                        <button
                          onClick={async () => {
                            const res = await fetch(capturedPhoto);
                            const blob = await res.blob();
                            uploadPhoto(blob);
                          }}
                          disabled={isUploadingPhoto}
                          className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 transition-all font-bold disabled:opacity-50"
                        >
                          {isUploadingPhoto ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                          Save & Lock Photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
