import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Link as LinkIcon, 
  Plus, 
  Search, 
  Filter, 
  Copy,
  Clock,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  MapPin,
  Image as ImageIcon,
  Check,
  Package
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { format, differenceInHours } from 'date-fns'
import { toast } from 'sonner'
import { useAuthStore } from '../store/useAuthStore'

const queryErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

function PaymentLinkDataState({ title, message, onRetry, tone = 'muted' }: { title: string; message: string; onRetry?: () => void; tone?: 'muted' | 'error' }) {
  const isError = tone === 'error'
  return (
    <div className={cn(
      "col-span-full py-20 text-center space-y-4 rounded-[40px] border",
      isError ? "bg-red-500/5 border-red-500/20" : "glass-card border-dashed border-white/10"
    )}>
      <AlertCircle className={cn("mx-auto", isError ? "text-red-400" : "text-zinc-800")} size={48} />
      <div>
        <p className="text-zinc-200 font-black italic uppercase tracking-widest">{title}</p>
        <p className="text-xs text-zinc-600 mt-2">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-2 px-5 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
            isError ? "bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
          )}
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  )
}

export default function PaymentLinks() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: linksData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payment-links'],
    queryFn: async () => {
      const res = await api.get('/payment-links', {
        headers: {
          'X-User-ID': user?.id || ''
        }
      });
      return res.data;
    },
    enabled: !!user?.id
  });

  const links = linksData?.data || [];

  const createMutation = useMutation({
    mutationFn: (newLink: any) => api.post('/payment-links', newLink, {
      headers: {
        'X-User-ID': user?.id || ''
      }
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
      toast.success('Payment Link created successfully!');
      setIsModalOpen(false);
      // Automatically copy to clipboard if we know the domain. For now we just show toast.
      const linkId = data.data?.data?.id || data.data?.id;
      if (linkId) {
        navigator.clipboard.writeText(`https://pay.tembus.my.id/inv/${linkId}`);
        toast.info('Link copied to clipboard!');
      }
    },
    onError: (err: any) => toast.error(`Failed to create link: ${queryErrorMessage(err, 'Unknown error')}`)
  });

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(`https://pay.tembus.my.id/inv/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Link copied!');
  };

  if (isLoading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const filteredLinks = links?.filter((v: any) =>
    String(v.item_name || '').toLowerCase().includes(search.toLowerCase()) ||
    String(v.id || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">Payment Links</h1>
          <p className="text-zinc-500 mt-1">Generate digital invoice links to share with customers via WhatsApp.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={18} />
          Create Link
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary-light transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search by item name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isError ? (
          <PaymentLinkDataState
            title="Gagal Memuat Link"
            message={queryErrorMessage(error, 'Daftar payment link belum bisa diambil.')}
            onRetry={() => refetch()}
            tone="error"
          />
        ) : filteredLinks?.map((link: any, i: number) => {
          const hoursLeft = differenceInHours(new Date(link.expired_at), new Date());
          const isExpired = hoursLeft <= 0 || link.status === 'EXPIRED';
          const isPaid = link.status === 'PAID';
          
          return (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={link.id}
              className="glass-card p-8 rounded-[40px] border-white/5 group hover:border-white/10 transition-all overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                 <LinkIcon size={120} />
              </div>

              <div className="flex items-start justify-between relative z-10">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-light font-black text-sm tracking-wider font-mono">
                      {link.id.split('-')[0]}...
                    </div>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      isPaid ? "bg-emerald-500/10 text-emerald-400" : 
                      isExpired ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
                    )}>
                      {link.status}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    {link.item_image_url && (
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                            <img src={link.item_image_url} alt={link.item_name} className="w-full h-full object-cover" />
                        </div>
                    )}
                    <div>
                        <h4 className="font-bold text-zinc-100 text-lg">{link.item_name}</h4>
                        <p className="text-sm font-medium text-zinc-400 mt-1">Item: <span className="text-emerald-400 font-bold">Rp {link.item_price?.toLocaleString()}</span></p>
                        <p className="text-[10px] text-zinc-500 mt-2 italic font-medium">
                        Ongkir Estimate: Rp {link.delivery_fee_amount?.toLocaleString() || 0}
                        </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-white/5 relative z-10">
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                       <MapPin size={12} /> Destination
                    </p>
                    <p className="text-xs font-bold text-zinc-400 mt-3 tracking-tight line-clamp-2">
                      {link.dropoff_address}
                    </p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                       <Clock size={12} /> Expiration
                    </p>
                    <p className="text-xs font-bold text-zinc-200 mt-3">{format(new Date(link.expired_at), 'dd MMM yyyy HH:mm')}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                       <p className={cn(
                         "text-[10px] font-black uppercase tracking-wider",
                         !isExpired ? "text-primary-light" : "text-red-400"
                       )}>
                        {!isExpired ? 'Active' : 'Expired'}
                       </p>
                    </div>
                 </div>
              </div>

              <div className="flex items-center gap-3 mt-8 relative z-10">
                 <button 
                   onClick={() => handleCopy(link.id)}
                   disabled={isExpired || isPaid}
                   className={cn(
                       "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border flex items-center justify-center gap-2",
                       copiedId === link.id ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-zinc-300 hover:bg-primary/20 hover:text-primary-light border-white/5 hover:border-primary/20",
                       (isExpired || isPaid) ? "opacity-50 cursor-not-allowed" : ""
                   )}
                 >
                    {copiedId === link.id ? <Check size={16} /> : <Copy size={16} />}
                    {copiedId === link.id ? 'Copied!' : 'Copy Link'}
                 </button>
              </div>
            </motion.div>
          )
        })}
        {!isError && (!filteredLinks || filteredLinks.length === 0) && (
          <div className="col-span-full py-20 text-center space-y-4 glass-card rounded-[40px] border-dashed border-white/10">
            <LinkIcon className="mx-auto text-zinc-800" size={48} />
            <p className="text-zinc-500 font-black italic uppercase tracking-widest">
              No payment links generated yet
            </p>
          </div>
        )}
      </div>

      <CreateLinkModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(data: any) => createMutation.mutate(data)}
        isSaving={createMutation.isPending}
      />
    </div>
  )
}

function CreateLinkModal({ isOpen, onClose, onSave, isSaving }: any) {
  const [formData, setFormData] = useState<any>({
    item_name: '',
    item_price: '',
    item_image_url: '',
    pickup_address: '',
    dropoff_address: '',
    service_code: '',
  });
  
  const [geocodeError, setGeocodeError] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState(false);

  const { data: services, isLoading: isLoadingServices } = useQuery({
    queryKey: ['active-delivery-services'],
    queryFn: async () => {
      const res = await api.get('/admin/delivery-services')
      return (res.data.services as any[]).filter((s: any) => s.is_enabled)
    },
    enabled: isOpen
  });

  // When services load, if service_code is empty, change it to the first available service code
  useEffect(() => {
    if (services && services.length > 0 && formData.service_code === '') {
      setFormData((prev: any) => ({ ...prev, service_code: services[0].code }));
    }
  }, [services, formData.service_code]);

  if (!isOpen) return null;

  const handleGenerateLink = async () => {
    setGeocodeError('');
    setIsGeocoding(true);
    
    try {
      // 1. Geocode Pickup Address
      const pickupRes = await api.get(`/maps/geocode?query=${encodeURIComponent(formData.pickup_address.trim())}`);
      const pickupResults = pickupRes.data?.results || [];
      const pickupLoc = pickupResults.find((item: any) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
      
      if (!pickupLoc) {
        throw new Error('Alamat Pickup tidak spesifik. Tambahkan patokan, jalan, kota.');
      }

      // 2. Geocode Dropoff Address
      const dropoffRes = await api.get(`/maps/geocode?query=${encodeURIComponent(formData.dropoff_address.trim())}`);
      const dropoffResults = dropoffRes.data?.results || [];
      const dropoffLoc = dropoffResults.find((item: any) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
      
      if (!dropoffLoc) {
        throw new Error('Alamat Customer tidak spesifik. Tambahkan patokan, jalan, kota.');
      }

      onSave({
        ...formData,
        item_price: Number(formData.item_price),
        pickup_lat: Number(pickupLoc.latitude),
        pickup_lng: Number(pickupLoc.longitude),
        dropoff_lat: Number(dropoffLoc.latitude),
        dropoff_lng: Number(dropoffLoc.longitude),
      });

    } catch (err: any) {
      setGeocodeError(err.response?.data?.error || err.message || 'Gagal validasi alamat.');
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-[48px] overflow-hidden shadow-2xl shadow-primary/10 my-8"
      >
        <div className="p-10 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-zinc-100 italic uppercase tracking-tight">
                Generate Payment Link
              </h2>
              <p className="text-zinc-500 text-xs mt-1 font-medium">Create a new invoice for your customer.</p>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl bg-white/5 text-zinc-500 hover:text-white transition-all">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-2 col-span-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2"><Package size={14}/> Item Name</label>
              <input 
                value={formData.item_name}
                onChange={e => setFormData({ ...formData, item_name: e.target.value })}
                placeholder="e.g. Kue Kering Lebaran"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Item Price (Rp)</label>
              <input 
                type="number"
                value={formData.item_price}
                onChange={e => setFormData({ ...formData, item_price: Number(e.target.value) })}
                placeholder="50000"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2">Pilihan Layanan</label>
              <select 
                value={formData.service_code}
                onChange={e => setFormData({ ...formData, service_code: e.target.value })}
                className="w-full bg-zinc-900 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                disabled={isLoadingServices}
              >
                {isLoadingServices ? (
                  <option value="">Loading services...</option>
                ) : (
                  services?.map((svc: any) => (
                    <option key={svc.code} value={svc.code}>
                      {svc.name} - Rp {svc.base_fare_idr.toLocaleString()}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-2 col-span-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2"><ImageIcon size={14}/> Image URL</label>
              <input 
                value={formData.item_image_url}
                onChange={e => setFormData({ ...formData, item_image_url: e.target.value })}
                placeholder="https://..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            <div className="space-y-2 col-span-2 border-t border-white/5 pt-6">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-4">Origin & Destination</h3>
            </div>

            <div className="space-y-2 col-span-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2"><MapPin size={14}/> Pickup Address (Your Store)</label>
              <textarea 
                value={formData.pickup_address}
                onChange={e => { setFormData({ ...formData, pickup_address: e.target.value }); setGeocodeError(''); }}
                placeholder="Alamat lengkap tokomu beserta patokan..."
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2"><MapPin size={14}/> Dropoff Address (Customer)</label>
              <textarea 
                value={formData.dropoff_address}
                onChange={e => { setFormData({ ...formData, dropoff_address: e.target.value }); setGeocodeError(''); }}
                placeholder="Alamat lengkap pembeli beserta patokan..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
              />
            </div>
          </div>

          {geocodeError && (
            <div className="px-6 py-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400">
              <AlertCircle size={18} />
              <p className="text-xs font-bold">{geocodeError}</p>
            </div>
          )}

          <div className="pt-8 border-t border-white/5 flex items-center justify-end">
            <div className="flex gap-4">
              <button 
                onClick={onClose}
                className="px-8 py-4 rounded-2xl bg-zinc-800 text-zinc-400 font-black text-xs uppercase tracking-widest hover:text-white transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleGenerateLink}
                disabled={
                  isSaving || 
                  isGeocoding ||
                  !formData.item_name || 
                  !formData.item_price || 
                  !formData.dropoff_address || 
                  !formData.pickup_address || 
                  !formData.item_image_url || 
                  !formData.service_code
                }
                className="px-10 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary-light hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(isSaving || isGeocoding) ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                {isGeocoding ? 'Mencari Titik...' : 'Generate Link'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
