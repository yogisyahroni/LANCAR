import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Ticket, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Users, 
  TrendingUp,
  Clock,
  Loader2,
  X,
  CheckCircle2
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { format, differenceInDays } from 'date-fns'
import { toast } from 'sonner'

export default function Vouchers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null)

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['voucher-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/vouchers/stats');
      return res.data;
    }
  });

  const { data: vouchers, isLoading: isLoadingVouchers } = useQuery({
    queryKey: ['vouchers'],
    queryFn: async () => {
      const res = await api.get('/admin/vouchers');
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: (newVoucher: any) => api.post('/admin/vouchers', newVoucher),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
      queryClient.invalidateQueries({ queryKey: ['voucher-stats'] });
      toast.success('Voucher created successfully');
      setIsModalOpen(false);
    },
    onError: (err: any) => toast.error(`Failed to create: ${err.message}`)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => api.patch(`/admin/vouchers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
      toast.success('Voucher updated successfully');
      setIsModalOpen(false);
    },
    onError: (err: any) => toast.error(`Failed to update: ${err.message}`)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/vouchers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
      queryClient.invalidateQueries({ queryKey: ['voucher-stats'] });
      toast.success('Voucher deleted successfully');
    },
    onError: (err: any) => toast.error(`Failed to delete: ${err.message}`)
  });

  if (isLoadingStats || isLoadingVouchers) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: 'Active Vouchers', value: stats?.activeVouchers?.toLocaleString() || '0', icon: Ticket, color: 'text-emerald-400' },
    { label: 'Total Claims', value: stats?.totalClaims?.toLocaleString() || '0', icon: Users, color: 'text-primary-light' },
    { label: 'Revenue Impact', value: `Rp ${stats?.revenueImpact?.toLocaleString() || '0'}`, icon: TrendingUp, color: 'text-amber-400' },
  ];

  const filteredVouchers = vouchers?.filter((v: any) => 
    v.code.toLowerCase().includes(search.toLowerCase()) ||
    v.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (voucher: any) => {
    setSelectedVoucher(voucher);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedVoucher(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this voucher?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-8 animate-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">Voucher Engine</h1>
          <p className="text-zinc-500 mt-1">Create and monitor promotional campaigns and discounts.</p>
        </div>
        <button 
          onClick={handleCreate}
          className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={18} />
          Generate Voucher
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat, i) => (
          <div key={i} className="glass-card p-8 rounded-[32px] border-white/5">
             <div className="flex items-center gap-4">
                <div className={cn("p-4 rounded-2xl bg-white/5", stat.color)}>
                   <stat.icon size={24} />
                </div>
                <div>
                   <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                   <p className="text-2xl font-black text-zinc-100 mt-1 tracking-tighter">{stat.value}</p>
                </div>
             </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-primary-light transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-zinc-600"
          />
        </div>
        <div className="flex items-center gap-2">
           <button className="p-3.5 rounded-2xl bg-white/5 text-zinc-500 hover:text-white border border-white/10 transition-all">
              <Filter size={20} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredVouchers?.map((voucher: any, i: number) => {
          const daysLeft = differenceInDays(new Date(voucher.valid_until || voucher.expiry_date), new Date());
          const usagePercent = voucher.quota > 0 ? (voucher.used_count / voucher.quota) * 100 : 0;
          
          return (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={voucher.id}
              className="glass-card p-8 rounded-[40px] border-white/5 group hover:border-white/10 transition-all overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                 <Ticket size={120} />
              </div>

              <div className="flex items-start justify-between relative z-10">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-light font-black text-lg tracking-wider">
                      {voucher.code}
                    </div>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      voucher.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-600"
                    )}>
                      {voucher.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div>
                     <h4 className="font-bold text-zinc-100 text-lg">{voucher.name || 'Promotional Voucher'}</h4>
                     <p className="text-sm font-medium text-zinc-400 mt-1">Discount: <span className="text-emerald-400 font-bold">{voucher.type === 'percentage' ? `${voucher.value}%` : `Rp ${voucher.value?.toLocaleString()}`}</span></p>
                     <p className="text-[10px] text-zinc-500 mt-2 italic font-medium">Min. Order Rp {voucher.min_order_idr?.toLocaleString() || 0} • Max. Rp {voucher.max_discount_idr?.toLocaleString() || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-white/5 relative z-10">
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                       <TrendingUp size={12} /> Redemptions
                    </p>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-3">
                       <div 
                          className="h-full bg-primary rounded-full transition-all duration-500" 
                          style={{ width: `${Math.min(usagePercent, 100)}%` }} 
                       />
                    </div>
                    <p className="text-xs font-bold text-zinc-400 mt-3 tracking-tight">
                      {voucher.used_count?.toLocaleString() || 0} <span className="text-zinc-600 font-medium">/ {voucher.quota?.toLocaleString() || '∞'} used</span>
                    </p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                       <Calendar size={12} /> Expiration
                    </p>
                    <p className="text-xs font-bold text-zinc-200 mt-3">{format(new Date(voucher.valid_until || voucher.expiry_date), 'dd MMM yyyy')}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                       <Clock size={10} className="text-zinc-600" />
                       <p className={cn(
                         "text-[10px] font-black uppercase tracking-wider",
                         daysLeft > 0 ? "text-primary-light" : "text-red-400"
                       )}>
                        {daysLeft > 0 ? `${daysLeft} Days Left` : 'Expired'}
                       </p>
                    </div>
                 </div>
              </div>

              <div className="flex items-center gap-3 mt-8 relative z-10">
                 <button 
                   onClick={() => handleEdit(voucher)}
                   className="flex-1 py-4 rounded-2xl bg-white/5 text-zinc-500 font-black text-xs uppercase tracking-widest hover:bg-primary/20 hover:text-primary-light transition-all border border-white/5 hover:border-primary/20"
                 >
                    Modify Parameters
                 </button>
                 <button 
                   onClick={() => handleDelete(voucher.id)}
                   disabled={deleteMutation.isPending}
                   className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-500/40 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                 >
                    {deleteMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                 </button>
              </div>
            </motion.div>
          )
        })}
        {(!filteredVouchers || filteredVouchers.length === 0) && (
          <div className="col-span-full py-20 text-center space-y-4 glass-card rounded-[40px] border-dashed border-white/10">
            <Ticket className="mx-auto text-zinc-800" size={48} />
            <p className="text-zinc-500 font-black italic uppercase tracking-widest italic">
              No digital tokens found in archives
            </p>
          </div>
        )}
      </div>

      <VoucherModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        voucher={selectedVoucher}
        onSave={(data: any) => {
          if (selectedVoucher) {
            updateMutation.mutate({ id: selectedVoucher.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  )
}

function VoucherModal({ isOpen, onClose, voucher, onSave, isSaving }: any) {
  const [formData, setFormData] = useState<any>({
    code: '',
    name: '',
    type: 'percentage',
    value: 0,
    max_discount_idr: 0,
    min_order_idr: 0,
    quota: 100,
    valid_from: format(new Date(), 'yyyy-MM-dd'),
    valid_until: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    applicable_models: ['standard', 'relay', 'express'],
    is_active: true
  });

  useEffect(() => {
    if (voucher) {
      setFormData({
        ...voucher,
        valid_from: format(new Date(voucher.valid_from), 'yyyy-MM-dd'),
        valid_until: format(new Date(voucher.valid_until), 'yyyy-MM-dd'),
      });
    }
  }, [voucher]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-[48px] overflow-hidden shadow-2xl shadow-primary/10"
      >
        <div className="p-10 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-zinc-100 italic uppercase tracking-tight">
                {voucher ? 'Update Parameter' : 'Forge Digital Token'}
              </h2>
              <p className="text-zinc-500 text-xs mt-1 font-medium">Configure discount logic and redemption constraints.</p>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl bg-white/5 text-zinc-500 hover:text-white transition-all">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Token Code</label>
              <input 
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="PROMO2024"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all uppercase"
                disabled={!!voucher}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Campaign Name</label>
              <input 
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Summer Sale Blast"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Logic Type</label>
              <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
                {['percentage', 'fixed'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setFormData({ ...formData, type: t })}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      formData.type === t ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-zinc-600 hover:text-zinc-400"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Discount Value</label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500 font-black text-sm">{formData.type === 'percentage' ? '%' : 'Rp'}</span>
                <input 
                  type="number"
                  value={formData.value}
                  onChange={e => setFormData({ ...formData, value: Number(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Min. Transaction</label>
              <input 
                type="number"
                value={formData.min_order_idr}
                onChange={e => setFormData({ ...formData, min_order_idr: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Max. Ceiling</label>
              <input 
                type="number"
                value={formData.max_discount_idr}
                onChange={e => setFormData({ ...formData, max_discount_idr: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Valid Until</label>
              <input 
                type="date"
                value={formData.valid_until}
                onChange={e => setFormData({ ...formData, valid_until: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Global Quota</label>
              <input 
                type="number"
                value={formData.quota}
                onChange={e => setFormData({ ...formData, quota: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                className={cn(
                  "w-12 h-6 rounded-full relative transition-all duration-300",
                  formData.is_active ? "bg-primary" : "bg-zinc-800"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                  formData.is_active ? "right-1" : "left-1"
                )} />
              </button>
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Active Status</span>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={onClose}
                className="px-8 py-4 rounded-2xl bg-zinc-800 text-zinc-400 font-black text-xs uppercase tracking-widest hover:text-white transition-all"
              >
                Abort
              </button>
              <button 
                onClick={() => onSave(formData)}
                disabled={isSaving}
                className="px-10 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary-light hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                {voucher ? 'Update Token' : 'Authorize Token'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Trash2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  )
}
