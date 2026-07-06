"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Link as LinkIcon, 
  Plus, 
  Search, 
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
  Package,
  UploadCloud,
  Navigation,
  Store,
  Weight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { ShippingSelector } from '@/components/ShippingSelector';
import { TariffRequest, TariffResponse } from '@/hooks/useLogisticsTariff';

const queryErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;

function PaymentLinkDataState({ title, message, onRetry, tone = 'muted' }: { title: string; message: string; onRetry?: () => void; tone?: 'muted' | 'error' }) {
  const isError = tone === 'error';
  return (
    <div className={cn(
      "col-span-full py-20 text-center space-y-4 rounded-[40px] border",
      isError ? "bg-red-500/5 border-red-500/20" : "glass-card border-dashed border-black/10 dark:border-white/10"
    )}>
      <AlertCircle className={cn("mx-auto", isError ? "text-red-400" : "text-zinc-400")} size={48} />
      <div>
        <p className="text-zinc-600 dark:text-zinc-200 font-black italic uppercase tracking-widest">{title}</p>
        <p className="text-xs text-zinc-500 mt-2">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-2 px-5 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all",
            isError ? "bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-300 hover:bg-red-500/20" : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-zinc-500 hover:text-foreground"
          )}
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}

export default function PaymentLinksPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();
  
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: linksData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payment-links'],
    queryFn: async () => {
      const res = await api.get('/payment-links');
      return res.data;
    },
    enabled: !!user?.id
  });

  const links = linksData?.data || [];

  const createMutation = useMutation({
    mutationFn: (newLink: any) => api.post('/payment-links', newLink),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
      addNotification({ title: 'Success', message: 'Payment Link created successfully!', type: 'success' });
      setIsModalOpen(false);
      
      const paymentUrl = data.data?.data?.payment_url || data.data?.payment_url;
      if (paymentUrl) {
        navigator.clipboard.writeText(paymentUrl);
        addNotification({ title: 'Copied', message: 'Link copied to clipboard!', type: 'info' });
      }
    },
    onError: (err: any) => addNotification({ title: 'Error', message: `Failed to create link: ${queryErrorMessage(err, 'Unknown error')}`, type: 'error' })
  });

  const handleCopy = (id: string, paymentUrl: string) => {
    navigator.clipboard.writeText(paymentUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    addNotification({ title: 'Copied', message: 'Link copied to clipboard!', type: 'info' });
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
          <h1 className="text-3xl font-black text-foreground tracking-tight italic uppercase">Payment Links</h1>
          <p className="text-muted-foreground mt-1">Generate digital invoice links to share with customers via WhatsApp.</p>
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
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary-light transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search by item name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground"
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
          const hoursLeft = (new Date(link.expired_at).getTime() - new Date().getTime()) / (1000 * 60 * 60);
          const isExpired = hoursLeft <= 0 || link.status === 'EXPIRED';
          const isPaid = link.status === 'PAID';
          
          return (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={link.id}
              className="glass-card p-8 rounded-[40px] border-black/5 dark:border-white/5 group hover:border-black/10 dark:hover:border-white/10 transition-all overflow-hidden relative"
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
                      isPaid ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : 
                      isExpired ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    )}>
                      {link.status}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    {link.item_image_url && (
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 shrink-0">
                            <img src={link.item_image_url} alt={link.item_name} className="w-full h-full object-cover" />
                        </div>
                    )}
                    <div>
                        <h4 className="font-bold text-foreground text-lg">{link.item_name}</h4>
                        <p className="text-[10px] text-muted-foreground mt-2 italic font-medium">
                        Ongkir Estimate: Rp {link.delivery_fee_amount?.toLocaleString() || 0}
                        </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-black/5 dark:border-white/5 relative z-10">
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                       <MapPin size={12} /> Destination
                    </p>
                    <p className="text-xs font-bold text-foreground mt-3 tracking-tight line-clamp-2">
                      {link.dropoff_address}
                    </p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                       <Clock size={12} /> Expiration
                    </p>
                    <p className="text-xs font-bold text-foreground mt-3">{new Date(link.expired_at).toLocaleDateString()} {new Date(link.expired_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                       <p className={cn(
                         "text-[10px] font-black uppercase tracking-wider",
                         !isExpired ? "text-primary-light" : "text-red-500"
                       )}>
                        {!isExpired ? 'Active' : 'Expired'}
                       </p>
                    </div>
                 </div>
              </div>

              <div className="flex items-center gap-3 mt-8 relative z-10">
                 <button 
                   onClick={() => handleCopy(link.id, link.payment_url)}
                   disabled={isExpired || isPaid}
                   className={cn(
                       "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border flex items-center justify-center gap-2",
                       copiedId === link.id ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-primary/20 hover:text-primary-light border-black/5 dark:border-white/5 hover:border-primary/20",
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
          <div className="col-span-full py-20 text-center space-y-4 glass-card rounded-[40px] border-dashed border-black/10 dark:border-white/10">
            <LinkIcon className="mx-auto text-zinc-400" size={48} />
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
  );
}

function CreateLinkModal({ isOpen, onClose, onSave, isSaving }: any) {
  const { addNotification } = useNotificationStore();
  const { user } = useAuthStore();
  const [formData, setFormData] = useState<any>({
    store_name: '',
    item_name: '',
    item_image_url: '',
    pickup_address: '',
    dropoff_address: '',
    weight: 1,
  });
  
  const [step, setStep] = useState<1 | 2>(1);
  const [tariffRequest, setTariffRequest] = useState<TariffRequest | null>(null);
  const [selectedTariff, setSelectedTariff] = useState<TariffResponse | null>(null);

  const [geocodeError, setGeocodeError] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        store_name: user?.name || '',
        item_name: '',
        item_image_url: '',
        pickup_address: '',
        dropoff_address: '',
        weight: 1,
      });
      setStep(1);
      setTariffRequest(null);
      setSelectedTariff(null);
      setSelectedFile(null);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      addNotification({ title: 'Gagal', message: 'Browser tidak mendukung geolokasi', type: 'error' });
      return;
    }
    
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          if (data && data.display_name) {
            setFormData((prev: any) => ({ ...prev, pickup_address: data.display_name }));
          } else {
            setFormData((prev: any) => ({ ...prev, pickup_address: `${latitude}, ${longitude}` }));
          }
        } catch (error) {
          setFormData((prev: any) => ({ ...prev, pickup_address: `${position.coords.latitude}, ${position.coords.longitude}` }));
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        addNotification({ title: 'Gagal', message: 'Akses lokasi ditolak atau gagal', type: 'error' });
      }
    );
  };

  const handleNextStep = async () => {
    setGeocodeError('');
    setIsGeocoding(true);
    
    try {
      if (!formData.pickup_address) throw new Error('Alamat Pickup tidak boleh kosong.');
      
      const pickupRes = await api.get(`/maps/geocode?query=${encodeURIComponent(formData.pickup_address.trim())}`);
      const pickupResults = pickupRes.data?.results || [];
      const pickupLoc = pickupResults.find((item: any) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
      
      if (!pickupLoc) {
        throw new Error('Alamat Pickup tidak spesifik. Tambahkan patokan, jalan, kota.');
      }

      if (!formData.dropoff_address) throw new Error('Alamat Customer tidak boleh kosong.');

      const dropoffRes = await api.get(`/maps/geocode?query=${encodeURIComponent(formData.dropoff_address.trim())}`);
      const dropoffResults = dropoffRes.data?.results || [];
      const dropoffLoc = dropoffResults.find((item: any) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
      
      if (!dropoffLoc) {
        throw new Error('Alamat Customer tidak spesifik. Tambahkan patokan, jalan, kota.');
      }

      setTariffRequest({
        origin_lat: Number(pickupLoc.latitude),
        origin_lng: Number(pickupLoc.longitude),
        dest_lat: Number(dropoffLoc.latitude),
        dest_lng: Number(dropoffLoc.longitude),
        weight: Number(formData.weight) || 1,
      });

      setStep(2);
    } catch (err: any) {
      setGeocodeError(err.response?.data?.error || err.message || 'Gagal mengecek alamat.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleGenerateLink = async () => {
    setGeocodeError('');
    setIsGeocoding(true);
    
    try {
      let finalImageUrl = formData.item_image_url;

      if (selectedFile) {
        const presignRes = await api.get(`/auth/presign?filename=${encodeURIComponent(selectedFile.name)}&contentType=${encodeURIComponent(selectedFile.type)}`);
        const { url } = presignRes.data;

        await fetch(url, {
          method: 'PUT',
          body: selectedFile,
          headers: { 'Content-Type': selectedFile.type },
        });
        
        finalImageUrl = url.split('?')[0]; 
      }

      if (!tariffRequest || !selectedTariff) {
        throw new Error('Silakan pilih layanan kurir terlebih dahulu.');
      }

      onSave({
        ...formData,
        item_price: 0,
        item_image_url: finalImageUrl,
        pickup_lat: tariffRequest.origin_lat,
        pickup_lng: tariffRequest.origin_lng,
        dropoff_lat: tariffRequest.dest_lat,
        dropoff_lng: tariffRequest.dest_lng,
        service_code: selectedTariff.service_code,
        provider_code: selectedTariff.provider_code,
        delivery_fee_amount: selectedTariff.price,
      });

    } catch (err: any) {
      setGeocodeError(err.response?.data?.error || err.message || 'Gagal membuat link.');
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-2xl bg-background border border-black/10 dark:border-white/10 rounded-[48px] overflow-hidden shadow-2xl shadow-primary/10 my-8"
      >
        <div className="p-10 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-foreground italic uppercase tracking-tight">
                Generate Payment Link
              </h2>
              <p className="text-muted-foreground text-xs mt-1 font-medium">Create a new invoice for your customer.</p>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 text-zinc-500 hover:text-foreground transition-all">
              <X size={20} />
            </button>
          </div>

          <div className="mb-8 flex items-center gap-3 bg-primary/10 border border-primary/20 p-4 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <Store size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-primary/80 uppercase tracking-[0.2em]">Toko Pengirim</p>
              <h3 className="text-lg font-bold text-white tracking-tight">{user?.store_name || 'Toko Anda'}</h3>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2"><Package size={14}/> Item Name</label>
                  <input 
                    value={formData.item_name}
                    onChange={e => setFormData({ ...formData, item_name: e.target.value })}
                    placeholder="e.g. Kue Kering Lebaran"
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl py-4 px-6 text-foreground font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2"><Weight size={14}/> Berat (kg)</label>
                  <input 
                    type="number"
                    min="1"
                    value={formData.weight}
                    onChange={e => setFormData({ ...formData, weight: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl py-4 px-6 text-foreground font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2"><UploadCloud size={14}/> Item Image</label>
                  <label className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 border-dashed rounded-2xl py-4 px-6 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-all text-sm font-semibold text-muted-foreground hover:text-foreground">
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
                      }} 
                    />
                    {selectedFile ? selectedFile.name : (formData.item_image_url ? 'Image Selected (Click to change)' : 'Choose File')}
                  </label>
                </div>

                <div className="space-y-2 col-span-2 border-t border-black/10 dark:border-white/10 pt-6">
                  <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-4">Origin & Destination</h3>
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center justify-between">
                    <span className="flex items-center gap-2"><MapPin size={14}/> Pickup Address (Your Store)</span>
                    <button 
                      type="button" 
                      onClick={handleGetCurrentLocation}
                      disabled={isLocating}
                      className="text-primary hover:text-primary-light flex items-center gap-1 font-bold bg-primary/10 px-3 py-1.5 rounded-lg transition-all"
                    >
                      {isLocating ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
                      Gunakan Lokasi Saat Ini
                    </button>
                  </label>
                  <textarea 
                    value={formData.pickup_address}
                    onChange={e => { setFormData({ ...formData, pickup_address: e.target.value }); setGeocodeError(''); }}
                    placeholder="Alamat lengkap tokomu beserta patokan..."
                    rows={2}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl py-4 px-6 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2"><MapPin size={14}/> Dropoff Address (Customer)</label>
                  <textarea 
                    value={formData.dropoff_address}
                    onChange={e => { setFormData({ ...formData, dropoff_address: e.target.value }); setGeocodeError(''); }}
                    placeholder="Alamat lengkap pembeli beserta patokan..."
                    rows={3}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl py-4 px-6 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                  />
                </div>
              </div>

              {geocodeError && (
                <div className="px-6 py-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 mt-6">
                  <AlertCircle size={18} />
                  <p className="text-xs font-bold">{geocodeError}</p>
                </div>
              )}

              <div className="pt-8 border-t border-black/10 dark:border-white/10 flex items-center justify-end mt-8">
                <div className="flex gap-4">
                  <button 
                    onClick={() => { setStep(1); onClose(); }}
                    className="px-8 py-4 rounded-2xl bg-black/5 dark:bg-white/5 text-zinc-500 font-black text-xs uppercase tracking-widest hover:text-foreground transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleNextStep}
                    disabled={isGeocoding || !formData.item_name || !formData.dropoff_address || !formData.pickup_address || (!selectedFile && !formData.item_image_url)}
                    className="px-10 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary-light hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeocoding ? <Loader2 className="animate-spin" size={16} /> : null}
                    {isGeocoding ? 'Loading...' : 'Lanjut Pilih Kurir'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6">
                <ShippingSelector
                  request={tariffRequest}
                  onSelect={setSelectedTariff}
                  selectedCode={selectedTariff?.service_code}
                />
              </div>

              {geocodeError && (
                <div className="px-6 py-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 mb-6">
                  <AlertCircle size={18} />
                  <p className="text-xs font-bold">{geocodeError}</p>
                </div>
              )}

              <div className="pt-8 border-t border-black/10 dark:border-white/10 flex items-center justify-between">
                <button 
                  onClick={() => setStep(1)}
                  className="px-8 py-4 rounded-2xl bg-black/5 dark:bg-white/5 text-zinc-500 font-black text-xs uppercase tracking-widest hover:text-foreground transition-all"
                >
                  Kembali
                </button>
                <div className="flex gap-4">
                  <button 
                    onClick={handleGenerateLink}
                    disabled={isSaving || isGeocoding || !selectedTariff}
                    className="px-10 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary-light hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {(isSaving || isGeocoding) ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    {(isSaving || isGeocoding) ? 'Loading...' : 'Generate Link'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
