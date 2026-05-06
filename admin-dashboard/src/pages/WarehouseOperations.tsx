import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Package, 
  Layers, 
  Plus, 
  Check, 
  Search, 
  RotateCcw, 
  Truck, 
  Plane, 
  QrCode, 
  FileText, 
  Play, 
  AlertTriangle,
  MapPin,
  Box,
  CornerRightDown,
  Loader2,
  Lock,
  Unlock
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'

export default function WarehouseOperations() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'bags' | 'scanning'>('scanning')
  
  // Scanning State
  const [orderId, setOrderId] = useState('')
  const [selectedBagNumber, setSelectedBagNumber] = useState('')
  const [customScanType, setCustomScanType] = useState<string>('')
  const [autoDetectData, setAutoDetectData] = useState<any>(null)
  const [isDetecting, setIsDetecting] = useState(false)

  // New Bag State
  const [newBagNumber, setNewBagNumber] = useState('')
  const [newVehiclePlate, setNewVehiclePlate] = useState('')
  const [newFlightNumber, setNewFlightNumber] = useState('')
  const [isCreatingBag, setIsCreatingBag] = useState(false)

  // Fetch Bags
  const { data: bags, isLoading: isBagsLoading } = useQuery({
    queryKey: ['warehouse-bags'],
    queryFn: async () => {
      const res = await api.get('/admin/warehouse/bags')
      return res.data
    }
  })

  // Create Bag Mutation
  const createBagMutation = useMutation({
    mutationFn: async (bagData: any) => {
      const res = await api.post('/admin/warehouse/bags', bagData)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-bags'] })
      toast.success('Kantong konsolidasi (bag) baru berhasil disegel & didaftarkan')
      setNewBagNumber('')
      setNewVehiclePlate('')
      setNewFlightNumber('')
      setIsCreatingBag(false)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal membuat kantong konsolidasi')
    }
  })

  // Open Bag Mutation
  const openBagMutation = useMutation({
    mutationFn: async (bagNumber: string) => {
      const res = await api.post('/admin/warehouse/bags/open', { bag_number: bagNumber })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-bags'] })
      toast.success('Kantong konsolidasi berhasil dibuka (Bag Out)')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal membuka kantong konsolidasi')
    }
  })

  // Scan Package Mutation
  const scanPackageMutation = useMutation({
    mutationFn: async (scanData: any) => {
      const res = await api.post('/admin/warehouse/scan', scanData)
      return res.data
    },
    onSuccess: (data: any) => {
      toast.success(`Paket berhasil dipindai sebagai: ${data.status || 'Success'}`)
      setOrderId('')
      setAutoDetectData(null)
      queryClient.invalidateQueries({ queryKey: ['warehouse-bags'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal memindai paket')
    }
  })

  const handleAutoDetect = async () => {
    if (!orderId || orderId.trim() === '') {
      toast.warning('Silakan masukkan ID Order terlebih dahulu')
      return
    }
    setIsDetecting(true)
    try {
      const res = await api.post('/admin/warehouse/scan/auto-detect', { order_id: orderId })
      setAutoDetectData(res.data)
      setCustomScanType(res.data.next_scan_type)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal mendeteksi status order otomatis')
      setAutoDetectData(null)
    } finally {
      setIsDetecting(false)
    }
  }

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderId) {
      toast.warning('Silakan isi ID Order atau resi')
      return
    }
    const finalScanType = customScanType || (autoDetectData ? autoDetectData.next_scan_type : 'inbound_origin')
    scanPackageMutation.mutate({
      order_id: orderId,
      scan_type: finalScanType,
      bag_number: selectedBagNumber || null,
      latitude: -6.2000,
      longitude: 106.8166
    })
  }

  return (
    <div className="space-y-8 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase flex items-center gap-3">
            <Layers className="text-primary-light" size={32} />
            Warehouse Ops Center
          </h1>
          <p className="text-zinc-500 mt-1">
            Pusat manajemen logistik pergudangan, scanning bag in/out, konsolidasi barang, dan deteksi otomatis.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['warehouse-bags'] })}
            className="p-3 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-all border border-white/5"
            title="Refresh Data"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 w-fit">
        <button 
          onClick={() => setActiveTab('scanning')}
          className={cn(
            "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
            activeTab === 'scanning' ? "bg-primary text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <QrCode size={16} />
          Scanning & Auto-Detect
        </button>
        <button 
          onClick={() => setActiveTab('bags')}
          className={cn(
            "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
            activeTab === 'bags' ? "bg-primary text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Box size={16} />
          Consolidation Bags
        </button>
      </div>

      {/* Sub-Contents based on Active Tab */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {activeTab === 'scanning' && (
          <>
            {/* Left Column: QR Code & Scanner Simulation */}
            <div className="lg:col-span-8 space-y-6">
              <div className="glass-card p-8 rounded-[40px] border-white/5 hover:border-white/10 transition-all space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 rounded-xl bg-primary/20 text-primary-light">
                    <QrCode size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-zinc-100 uppercase tracking-tight">Operator Scan Terminal</h3>
                    <p className="text-xs text-zinc-500">Pindai paket untuk inbound, outbound, bagging, atau epod secara cerdas.</p>
                  </div>
                </div>

                <form onSubmit={handleScanSubmit} className="space-y-6">
                  {/* Order ID Input with Detect Button */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">ID Order / Nomor Resi</label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
                        <input 
                          type="text" 
                          value={orderId}
                          onChange={(e) => setOrderId(e.target.value)}
                          placeholder="Masukkan ID Order (contoh: ord-...) atau scan nomor resi..."
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-zinc-600 transition-all"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoDetect}
                        disabled={isDetecting || !orderId}
                        className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        {isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play size={16} />}
                        Detect Step
                      </button>
                    </div>
                  </div>

                  {/* Auto Detection Result Alert */}
                  <AnimatePresence mode="popLayout">
                    {autoDetectData && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-5 rounded-2xl border border-primary/20 bg-primary/[0.03] space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-primary-light uppercase tracking-widest">Saran Tindakan Terdeteksi</span>
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-primary/20 text-white font-black uppercase tracking-wider">
                            Status Terkini: {autoDetectData.current_status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Check className="text-emerald-500 shrink-0" size={20} />
                          <p className="text-sm font-bold text-zinc-200">
                            Sistem mendeteksi langkah logistik berikutnya: <span className="text-primary-light uppercase font-black tracking-tight">{autoDetectData.suggested_label}</span>
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Optional Bag Number Select */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Kaitkan ke Bag Konsolidasi (Hanya untuk Outbound Origin)</label>
                    <select
                      value={selectedBagNumber}
                      onChange={(e) => setSelectedBagNumber(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    >
                      <option value="">-- Pilih Kantong Konsolidasi (Opsional) --</option>
                      {bags?.filter((b: any) => b.status === 'sealed').map((b: any) => (
                        <option key={b.bag_number} value={b.bag_number}>
                          {b.bag_number} (Kendaraan: {b.vehicle_plate || 'N/A'}, Penerbangan: {b.flight_number || 'N/A'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Action Override Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Override Scan Type (Manual Override)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { val: 'pickup', label: 'Inbound Pickup' },
                        { val: 'inbound_origin', label: 'Inbound Origin' },
                        { val: 'outbound_origin', label: 'Outbound Origin' },
                        { val: 'inbound_destination', label: 'Inbound Destination' },
                        { val: 'outbound_destination', label: 'Outbound Destination' },
                        { val: 'delivered', label: 'Delivered (ePOD)' }
                      ].map((type) => (
                        <button
                          key={type.val}
                          type="button"
                          onClick={() => setCustomScanType(type.val)}
                          className={cn(
                            "py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all text-center",
                            (customScanType || (autoDetectData?.next_scan_type)) === type.val 
                              ? "bg-primary border-primary text-white shadow-md" 
                              : "bg-white/5 border-white/5 text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={scanPackageMutation.isPending || !orderId}
                    className="w-full py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {scanPackageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                    Submit Scan Logistik
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Inbound/Outbound Operator Guide */}
            <div className="lg:col-span-4 space-y-6">
              <div className="glass-card p-8 rounded-[40px] border-white/5 bg-zinc-900/40 space-y-6">
                <h4 className="font-black text-sm uppercase tracking-widest text-zinc-200">SOP Alur Pergudangan</h4>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <span className="h-6 w-6 rounded-full bg-primary/20 text-primary-light flex items-center justify-center text-xs font-black font-mono shrink-0">1</span>
                    <div>
                      <p className="text-xs font-bold text-zinc-300">Scan Inbound Origin</p>
                      <p className="text-[10px] text-zinc-500">Gunakan saat paket pertama kali masuk gudang asal setelah pickup kurir.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="h-6 w-6 rounded-full bg-primary/20 text-primary-light flex items-center justify-center text-xs font-black font-mono shrink-0">2</span>
                    <div>
                      <p className="text-xs font-bold text-zinc-300">Scan Outbound Origin & Bagging</p>
                      <p className="text-[10px] text-zinc-500">Pilih / buat kantong konsolidasi, segel kantong dengan memasukkan nomor pelat kendaraan atau penerbangan.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="h-6 w-6 rounded-full bg-primary/20 text-primary-light flex items-center justify-center text-xs font-black font-mono shrink-0">3</span>
                    <div>
                      <p className="text-xs font-bold text-zinc-300">Bag Out & Inbound Destination</p>
                      <p className="text-[10px] text-zinc-500">Buka segel kantong konsolidasi (Bag Out) di gudang tujuan sebelum dapat memindai paket individual ke inbound tujuan.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'bags' && (
          <>
            {/* Left Column: Creation Form & Status Overview */}
            <div className="lg:col-span-4 space-y-6">
              <div className="glass-card p-8 rounded-[40px] border-white/5 hover:border-white/10 transition-all space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 text-primary-light rounded-xl">
                    <Plus size={20} />
                  </div>
                  <h3 className="text-lg font-black text-zinc-100 uppercase tracking-tight">Buat Bag Konsolidasi</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Nomor Bag Baru (Segel)</label>
                    <input 
                      type="text"
                      value={newBagNumber}
                      onChange={(e) => setNewBagNumber(e.target.value)}
                      placeholder="Contoh: BAG-JKT-XYZ"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary font-bold placeholder:text-zinc-600 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Nomor Plat Mobil</label>
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                      <Truck className="text-zinc-600" size={16} />
                      <input 
                        type="text"
                        value={newVehiclePlate}
                        onChange={(e) => setNewVehiclePlate(e.target.value)}
                        placeholder="Contoh: B 1234 CDG"
                        className="bg-transparent text-sm font-bold text-zinc-100 focus:outline-none flex-1 placeholder:text-zinc-600" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Nomor Resi Penerbangan</label>
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                      <Plane className="text-zinc-600" size={16} />
                      <input 
                        type="text"
                        value={newFlightNumber}
                        onChange={(e) => setNewFlightNumber(e.target.value)}
                        placeholder="Contoh: AW-9821-XP"
                        className="bg-transparent text-sm font-bold text-zinc-100 focus:outline-none flex-1 placeholder:text-zinc-600" 
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => createBagMutation.mutate({
                      bag_number: newBagNumber,
                      vehicle_plate: newVehiclePlate,
                      flight_number: newFlightNumber
                    })}
                    disabled={createBagMutation.isPending || !newBagNumber}
                    className="w-full py-4 mt-2 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {createBagMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                    Segel & Daftar Bag
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: List of Consolidation Bags */}
            <div className="lg:col-span-8 space-y-6">
              <div className="glass-card p-8 rounded-[40px] border-white/5 hover:border-white/10 transition-all space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-zinc-100 uppercase tracking-tight">Kantong Transit Terdaftar</h3>
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">{bags?.length || 0} Total Bags</span>
                </div>

                <div className="space-y-4">
                  {bags?.map((bag: any, idx: number) => (
                    <motion.div
                      key={bag.bag_number}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="p-5 bg-white/5 border border-white/5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-black text-zinc-100 uppercase tracking-tight">{bag.bag_number}</span>
                          <span className={cn(
                            "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider",
                            bag.status === 'sealed' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          )}>
                            {bag.status === 'sealed' ? 'Sealed' : 'Opened / Unbagged'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-medium">
                          {bag.vehicle_plate && (
                            <span className="flex items-center gap-1.5"><Truck size={12} /> Plat: {bag.vehicle_plate}</span>
                          )}
                          {bag.flight_number && (
                            <span className="flex items-center gap-1.5"><Plane size={12} /> Penerbangan: {bag.flight_number}</span>
                          )}
                          <span className="flex items-center gap-1.5"><Box size={12} /> {bag.packages_count || 0} Paket Scanned</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {bag.status === 'sealed' ? (
                          <button
                            onClick={() => openBagMutation.mutate(bag.bag_number)}
                            disabled={openBagMutation.isPending}
                            className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                          >
                            <Unlock size={12} />
                            Bag Out (Buka Segel)
                          </button>
                        ) : (
                          <span className="px-4 py-2.5 rounded-xl bg-emerald-500/5 text-emerald-500/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Lock size={12} />
                            Unbagged
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {(!bags || bags.length === 0) && (
                    <div className="py-20 text-center text-zinc-500 font-bold italic uppercase tracking-widest italic">
                      Belum ada kantong transit terdaftar
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
