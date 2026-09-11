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
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { format, differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import { AdminPageSkeleton } from '../components/ui/Skeleton'
import { FocusTrap } from '../components/a11y/FocusTrap'
import { StatusBadge } from '../components/StatusBadge'

const queryErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback

function VoucherDataState({ title, message, onRetry, tone = 'muted' }: { title: string; message: string; onRetry?: () => void; tone?: 'muted' | 'error' }) {
  const isError = tone === 'error'
  return (
    <div className={cn(
      "col-span-full py-20 text-center space-y-4 rounded-[40px] border",
      isError ? "bg-error-surface border-error" : "glass-card border-dashed border-border"
    )}>
      <AlertCircle className={cn("mx-auto", isError ? "text-error" : "text-foreground-muted")} size={48} aria-hidden="true" />
      <div>
      <p className="text-foreground-muted font-black italic uppercase tracking-wide">{title}</p>
        <p className="text-xs text-foreground-muted mt-2">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-2 px-5 py-3 rounded-2xl border text-xs font-black uppercase tracking-wide transition-all",
            isError ? "bg-error-surface border-error text-error hover:bg-error-surface" : "bg-surface-subtle border-border text-foreground-muted hover:text-foreground"
          )}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  )
}

export default function Vouchers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null)

  const { data: stats, isLoading: isLoadingStats, isError: isStatsError, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['voucher-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/vouchers/stats');
      return res.data;
    }
  });

  const { data: vouchers, isLoading: isLoadingVouchers, isError: isVouchersError, error: vouchersError, refetch: refetchVouchers } = useQuery({
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
    return <AdminPageSkeleton />;
  }

  const statCards = [
    { label: 'Active Vouchers', value: stats?.activeVouchers?.toLocaleString() ?? 'Tidak tersedia', icon: Ticket, color: 'text-success' },
    { label: 'Total Claims', value: stats?.totalClaims?.toLocaleString() ?? 'Tidak tersedia', icon: Users, color: 'text-primary-light' },
    { label: 'Revenue Impact', value: typeof stats?.revenueImpact === 'number' ? `Rp ${stats.revenueImpact.toLocaleString()}` : 'Tidak tersedia', icon: TrendingUp, color: 'text-warning' },
  ];

  const filteredVouchers = vouchers?.filter((v: any) =>
    String(v.code || '').toLowerCase().includes(search.toLowerCase()) ||
    String(v.name || '').toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-3xl font-black text-foreground-muted tracking-tight italic uppercase">Voucher Engine</h1>
          <p className="text-foreground-muted mt-1">Create and monitor promotional campaigns and discounts.</p>
        </div>
        <button 
          onClick={handleCreate}
          className="px-6 py-3 rounded-2xl bg-primary text-on-primary font-black text-sm uppercase tracking-wide hover:bg-primary-light shadow-lg shadow-primary/20 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={18} aria-hidden="true" />
          Generate Voucher
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isStatsError ? (
          <VoucherDataState
            title="Voucher stats gagal dimuat"
            message={queryErrorMessage(statsError, 'Statistik voucher belum bisa diambil dari API admin.')}
            onRetry={() => refetchStats()}
            tone="error"
          />
        ) : statCards.map((stat, i) => (
          <div key={i} className="glass-card p-8 rounded-[32px] border-border">
             <div className="flex items-center gap-4">
                <div className={cn("p-4 rounded-2xl bg-surface-subtle", stat.color)}>
                   <stat.icon size={24} aria-hidden="true" />
                </div>
                <div>
                   <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">{stat.label}</p>
                   <p className="text-2xl font-black text-foreground-muted mt-1 tracking-tighter">{stat.value}</p>
                </div>
             </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted group-focus-within:text-primary-light transition-colors" size={18} aria-hidden="true" />
          <input 
            type="text" 
            aria-label="Search vouchers by code or name"
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-subtle border border-border rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-foreground-muted"
          />
        </div>
        <div className="flex items-center gap-2">
           <button type="button" aria-label="Open voucher filters" title="Open voucher filters" className="p-3.5 rounded-2xl bg-surface-subtle text-foreground-muted hover:text-foreground border border-border transition-all">
              <Filter size={20} aria-hidden="true" />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isVouchersError ? (
          <VoucherDataState
            title="Voucher gagal dimuat"
            message={queryErrorMessage(vouchersError, 'Daftar voucher belum bisa diambil dari API admin.')}
            onRetry={() => refetchVouchers()}
            tone="error"
          />
        ) : filteredVouchers?.map((voucher: any, i: number) => {
          const daysLeft = differenceInDays(new Date(voucher.valid_until || voucher.expiry_date), new Date());
          const usagePercent = voucher.quota > 0 ? (voucher.used_count / voucher.quota) * 100 : 0;
          
          return (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={voucher.id}
              className="glass-card p-8 rounded-[40px] border-border group hover:border-border transition-all overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                 <Ticket size={120}  aria-hidden="true"/>
              </div>

              <div className="flex items-start justify-between relative z-10">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-light font-black text-lg tracking-wider">
                      {voucher.code}
                    </div>
                    <StatusBadge status={voucher.is_active ? 'active' : 'disabled'} label={voucher.is_active ? 'Aktif' : 'Nonaktif'} labelPrefix="Voucher status" />
                  </div>
                  <div>
                     <h4 className="font-bold text-foreground-muted text-lg">{voucher.name || 'Nama voucher belum tersedia'}</h4>
                     <p className="text-sm font-medium text-foreground-muted mt-1">Discount: <span className="text-success font-bold">{voucher.type === 'percentage' ? `${voucher.value}%` : `Rp ${voucher.value?.toLocaleString()}`}</span></p>
                     <p className="text-xs text-foreground-muted mt-2 italic font-medium">
                      Min. Order {typeof voucher.min_order_idr === 'number' ? `Rp ${voucher.min_order_idr.toLocaleString()}` : 'belum tersedia'} • Max. {typeof voucher.max_discount_idr === 'number' ? `Rp ${voucher.max_discount_idr.toLocaleString()}` : 'belum tersedia'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-border relative z-10">
                 <div className="space-y-1">
                    <p className="text-xs font-black text-foreground-muted uppercase tracking-wide flex items-center gap-2">
                       <TrendingUp size={12} aria-hidden="true" /> Redemptions
                    </p>
                    <div className="w-full h-1.5 bg-surface-subtle rounded-full overflow-hidden mt-3">
                       <div 
                          className="h-full bg-primary rounded-full transition-all duration-500" 
                          style={{ width: `${Math.min(usagePercent, 100)}%` }} 
                       />
                    </div>
                    <p className="text-xs font-bold text-foreground-muted mt-3 tracking-tight">
                      {voucher.used_count?.toLocaleString() || 0} <span className="text-foreground-muted font-medium">/ {voucher.quota?.toLocaleString() || '∞'} used</span>
                    </p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-xs font-black text-foreground-muted uppercase tracking-wide flex items-center gap-2">
                       <Calendar size={12} aria-hidden="true" /> Expiration
                    </p>
                    <p className="text-xs font-bold text-foreground-muted mt-3">{format(new Date(voucher.valid_until || voucher.expiry_date), 'dd MMM yyyy')}</p>
                    <StatusBadge status={daysLeft > 0 ? 'healthy' : 'expired'} label={daysLeft > 0 ? `${daysLeft} hari lagi` : 'Kedaluwarsa'} labelPrefix="Voucher expiration" className="mt-2 rounded-md px-2 py-1" />
                 </div>
              </div>

              <div className="flex items-center gap-3 mt-8 relative z-10">
                 <button 
                   onClick={() => handleEdit(voucher)}
                   className="flex-1 py-4 rounded-2xl bg-surface-subtle text-foreground-secondary font-black text-xs uppercase tracking-wide hover:bg-primary/20 hover:text-primary-light transition-all border border-border hover:border-primary/20"
                 >
                    Modify Parameters
                 </button>
                 <button 
                   type="button"
                   onClick={() => handleDelete(voucher.id)}
                   disabled={deleteMutation.isPending}
                   aria-label={`Delete voucher ${voucher.code || voucher.name || voucher.id}`}
                   title="Delete voucher"
                   className="p-4 rounded-2xl bg-error-surface border border-error text-error hover:bg-error hover:text-on-error transition-all disabled:opacity-60"
                 >
                    {deleteMutation.isPending ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <Trash2 size={18} aria-hidden="true" />}
                 </button>
              </div>
            </motion.div>
          )
        })}
        {!isVouchersError && (!filteredVouchers || filteredVouchers.length === 0) && (
          <div className="col-span-full py-20 text-center space-y-4 glass-card rounded-[40px] border-dashed border-border">
            <Ticket className="mx-auto text-foreground-muted" size={48}  aria-hidden="true"/>
            <p className="text-foreground-muted font-black italic uppercase tracking-wide italic">
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
    applicable_models: ['p2p'],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-subtle backdrop-blur-sm animate-in fade-in duration-200">
      <FocusTrap active={Boolean(voucher || isOpen)} className="w-full max-w-2xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voucher-form-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
        className="w-full max-w-2xl bg-surface border border-border rounded-[48px] overflow-hidden shadow-2xl shadow-primary/10"
      >
        <div className="p-10 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="voucher-form-title" className="text-2xl font-black text-foreground-muted italic uppercase tracking-tight">
                {voucher ? 'Update Parameter' : 'Forge Digital Token'}
              </h2>
              <p className="text-foreground-muted text-xs mt-1 font-medium">Configure discount logic and redemption constraints.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Tutup detail voucher" title="Tutup detail voucher" className="p-3 rounded-2xl bg-surface-subtle text-foreground-muted hover:text-foreground transition-all">
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground-muted tracking-wide">Token Code</label>
              <input 
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="PROMO2024"
                className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all uppercase"
                disabled={!!voucher}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground-muted tracking-wide">Campaign Name</label>
              <input 
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Summer Sale Blast"
                className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground-muted tracking-wide">Logic Type</label>
              <div className="flex p-1 bg-surface-subtle rounded-2xl border border-border">
                {['percentage', 'fixed'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setFormData({ ...formData, type: t })}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
                      formData.type === t ? "bg-primary text-on-primary shadow-lg shadow-primary/20" : "text-foreground-muted hover:text-foreground-muted"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground-muted tracking-wide">Discount Value</label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-foreground-muted font-black text-sm">{formData.type === 'percentage' ? '%' : 'Rp'}</span>
                <input 
                  type="number"
                  value={formData.value}
                  onChange={e => setFormData({ ...formData, value: Number(e.target.value) })}
                  className="w-full bg-surface-subtle border border-border rounded-2xl py-4 pl-12 pr-6 text-foreground-muted font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground-muted tracking-wide">Min. Transaction</label>
              <input 
                type="number"
                value={formData.min_order_idr}
                onChange={e => setFormData({ ...formData, min_order_idr: Number(e.target.value) })}
                className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground-muted tracking-wide">Max. Ceiling</label>
              <input 
                type="number"
                value={formData.max_discount_idr}
                onChange={e => setFormData({ ...formData, max_discount_idr: Number(e.target.value) })}
                className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground-muted tracking-wide">Valid Until</label>
              <input 
                type="date"
                value={formData.valid_until}
                onChange={e => setFormData({ ...formData, valid_until: e.target.value })}
                className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground-muted tracking-wide">Global Quota</label>
              <input 
                type="number"
                value={formData.quota}
                onChange={e => setFormData({ ...formData, quota: Number(e.target.value) })}
                className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-6 text-foreground-muted font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
          </div>

          <div className="pt-8 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                aria-pressed={formData.is_active}
                aria-label="Toggle voucher active status"
                title="Toggle voucher active status"
                className={cn(
                  "w-12 h-6 rounded-full relative transition-all duration-300",
                  formData.is_active ? "bg-primary" : "bg-surface-raised"
                )}
              >
                <div aria-hidden="true" className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-surface transition-all duration-300",
                  formData.is_active ? "right-1" : "left-1"
                )} />
              </button>
              <span className="text-xs font-bold text-foreground-muted tracking-wide">Active Status</span>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={onClose}
                className="px-8 py-4 rounded-2xl bg-surface-raised text-foreground-muted font-black text-xs uppercase tracking-wide hover:text-foreground transition-all"
              >
                Abort
              </button>
              <button
                type="button"
                onClick={() => onSave(formData)}
                disabled={isSaving}
                className="px-10 py-4 rounded-2xl bg-primary text-on-primary font-black text-xs uppercase tracking-wide shadow-lg shadow-primary/20 hover:bg-primary-light hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                {voucher ? 'Update Token' : 'Authorize Token'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      </FocusTrap>
    </div>
  );
}
