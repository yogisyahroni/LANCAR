import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  PieChart as PieIcon, 
  CreditCard, 
  History, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldAlert,
  Download,
  CloudRain,
  ChevronRight,
  Loader2,
  Landmark,
  CheckCircle2,
  XCircle,
  Ban,
  ShieldCheck
} from 'lucide-react'
import { 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from 'recharts'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { format } from 'date-fns'

const COLORS = ['#006437', '#10b981', '#34d399', '#6ee7b7'];

export default function Finance() {
  const queryClient = useQueryClient();

  const { data: financialData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['finance-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/stats');
      return res.data;
    }
  });

  const { data: payouts, isLoading: isLoadingPayouts } = useQuery({
    queryKey: ['finance-payouts'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/payouts');
      return res.data;
    }
  });

  const { data: payoutAccounts, isLoading: isLoadingPayoutAccounts } = useQuery({
    queryKey: ['finance-payout-accounts'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/payout-accounts');
      return res.data?.data || [];
    }
  });

  const { data: payoutRequests, isLoading: isLoadingPayoutRequests } = useQuery({
    queryKey: ['finance-payout-requests'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/payout-requests');
      return res.data?.data || [];
    }
  });

  const updatePayoutAccountMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason: string }) => {
      await api.patch(`/admin/finance/payout-accounts/${id}`, { status, reason });
    },
    onSuccess: () => {
      toast.success('Status rekening pencairan diperbarui');
      queryClient.invalidateQueries({ queryKey: ['finance-payout-accounts'] });
    },
    onError: () => {
      toast.error('Gagal memperbarui rekening pencairan');
    }
  });

  const updatePayoutRequestMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason: string }) => {
      await api.patch(`/admin/finance/payout-requests/${id}`, {
        status,
        reason,
        reference: `LCR-PAYOUT-${Date.now()}`
      });
    },
    onSuccess: () => {
      toast.success('Status pengajuan pencairan diperbarui');
      queryClient.invalidateQueries({ queryKey: ['finance-payout-requests'] });
      queryClient.invalidateQueries({ queryKey: ['finance-stats'] });
    },
    onError: () => {
      toast.error('Gagal memperbarui pengajuan pencairan');
    }
  });

  const releaseMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/admin/finance/payouts/${id}`, { 
        status: 'completed',
        reference: `RE-ADMIN-${Date.now()}`,
        reason: 'Manual release via dashboard'
      });
    },
    onSuccess: () => {
      toast.success('Payout released successfully');
      queryClient.invalidateQueries({ queryKey: ['finance-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['finance-stats'] });
    },
    onError: () => {
      toast.error('Failed to release payout');
    }
  });

  const batchReleaseMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/finance/payouts/batch-release');
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Successfully released ${data.count} payouts`);
      queryClient.invalidateQueries({ queryKey: ['finance-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['finance-stats'] });
    },
    onError: () => {
      toast.error('Failed to process batch release');
    }
  });

  const topUpMutation = useMutation({
    mutationFn: async (amount: number) => {
      await api.post('/admin/finance/emergency-fund/top-up', { 
        amount,
        reason: 'Manual top-up via treasury dashboard'
      });
    },
    onSuccess: () => {
      toast.success('Emergency fund topped up');
      queryClient.invalidateQueries({ queryKey: ['finance-stats'] });
    },
    onError: () => {
      toast.error('Failed to top up reserves');
    }
  });

  if (isLoadingStats || isLoadingPayouts || isLoadingPayoutAccounts || isLoadingPayoutRequests) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const stats = financialData?.stats || [];
  const revenueBreakdown = financialData?.model_breakdown || [];
  const emergencyFund = financialData?.emergency_fund || 0;
  const unitEconomics = financialData?.unit_economics || [];
  const formatCurrency = (value: number | string) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

  return (
    <div className="space-y-10 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">Financial Treasury</h1>
          <p className="text-zinc-500 mt-1">Real-time revenue oversight, cost analysis, and settlement control.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              try {
                const res = await api.get('/admin/finance/payouts/export', { responseType: 'blob' })
                const url = URL.createObjectURL(res.data)
                const a = document.createElement('a')
                a.href = url
                a.download = `payouts_export_${new Date().toISOString().split('T')[0]}.csv`
                a.click()
                URL.revokeObjectURL(url)
              } catch { console.error('Export failed') }
            }}
            className="px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-sm uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center gap-2"
          >
            <Download size={18} />
            Export Payouts CSV
          </button>
          <button 
            onClick={async () => {
              try {
                const res = await api.get('/admin/audit-logs/export', { responseType: 'blob' })
                const url = URL.createObjectURL(res.data)
                const a = document.createElement('a')
                a.href = url
                a.download = `system_audit_${new Date().toISOString().split('T')[0]}.csv`
                a.click()
                URL.revokeObjectURL(url)
              } catch { toast.error('Audit export failed') }
            }}
            className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-sm uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <Download size={18} />
            Export Audit (CSV)
          </button>
        </div>
      </div>

      {/* Primary Financial Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {stats.map((stat: any, i: number) => {
          const icons: Record<string, any> = {
            'Gross Revenue': DollarSign,
            'Net Profit': TrendingUp,
            'Operational Cost': TrendingDown
          };
          const colors: Record<string, string> = {
            'Gross Revenue': 'text-emerald-400',
            'Net Profit': 'text-primary-light',
            'Operational Cost': 'text-red-400'
          };
          const Icon = icons[stat.label] || DollarSign;
          
          return (
            <div key={i} className="glass-card p-10 rounded-[48px] border-white/5 group hover:border-white/10 transition-all">
              <div className="flex items-start justify-between">
                  <div className={cn("p-4 rounded-2xl bg-white/5", colors[stat.label])}>
                    <Icon size={28} />
                  </div>
                  <div className={cn(
                    "flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full",
                    stat.up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  )}>
                    {stat.up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    {stat.change}
                  </div>
              </div>
              <div className="mt-8">
                  <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                  <p className="text-4xl font-black text-zinc-100 mt-2 tracking-tighter">
                    Rp {stat.value.toLocaleString()}
                  </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue Breakdown Donut */}
        <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3">
                 <PieIcon className="text-primary-light" size={24} />
                 Model Breakdown
              </h3>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Revenue Share %</p>
           </div>
           <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="h-[280px] w-[280px] relative">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                       <Pie
                          data={revenueBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={110}
                          paddingAngle={8}
                          dataKey="value"
                       >
                          {revenueBreakdown.map((_: any, index: number) => (
                             <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                          ))}
                       </Pie>
                       <Tooltip />
                    </PieChart>
                 </ResponsiveContainer>
                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-4xl font-black text-zinc-100 tracking-tighter">100%</p>
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Gross</p>
                 </div>
              </div>
              <div className="flex-1 space-y-6 w-full">
                 {revenueBreakdown.map((item: any, i: number) => (
                   <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-3">
                         <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                         <span className="text-sm font-bold text-zinc-300">{item.name}</span>
                      </div>
                      <span className="text-sm font-black text-zinc-100">{item.percentage}%</span>
                   </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Cost Breakdown Bar Chart - Using Payout Data */}
        <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3">
                 <History className="text-red-400" size={24} />
                 Burn Analysis
              </h3>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Payout History</p>
           </div>
           <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={financialData?.burn_time_series}>
                    <XAxis 
                       dataKey="date" 
                       stroke="#52525b" 
                       fontSize={10} 
                       tickLine={false} 
                       axisLine={false}
                       tickFormatter={(date) => format(new Date(date), 'dd/MM')} 
                    />
                    <YAxis 
                       stroke="#52525b" 
                       fontSize={10} 
                       tickLine={false} 
                       axisLine={false}
                       tickFormatter={(value) => `Rp${(value/1000).toFixed(0)}k`} 
                    />
                    <Tooltip 
                       cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                       contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '16px' }}
                       labelFormatter={(label) => format(new Date(label), 'dd MMM yyyy')}
                       formatter={(value: any) => [`Rp ${value.toLocaleString()}`, 'Payout Amount']}
                    />
                    <Bar dataKey="amount" fill="#ef4444" radius={[8, 8, 0, 0]} barSize={24} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* Emergency Weather Fund */}
      <div className="glass-card p-10 rounded-[48px] border-amber-500/10 bg-amber-500/[0.02] overflow-hidden relative">
         <div className="absolute top-0 right-0 p-10 opacity-5">
            <CloudRain size={160} />
         </div>
         <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="space-y-4 max-w-md">
               <div className="flex items-center gap-3 text-amber-400">
                  <ShieldAlert size={28} />
                  <h3 className="text-2xl font-black italic uppercase tracking-tight">Emergency Fund</h3>
               </div>
               <p className="text-sm text-zinc-400 leading-relaxed font-medium">
                  Reserved for weather spikes and high-demand surge coverage. This fund ensures courier satisfaction during extreme conditions.
               </p>
            </div>
            <div className="flex flex-col items-center md:items-end gap-6">
               <div className="text-center md:text-right">
                  <p className="text-[10px] font-black text-amber-500/60 uppercase tracking-[0.2em] mb-2">Available Balance</p>
                  <p className="text-5xl font-black text-zinc-100 tracking-tighter">Rp {emergencyFund.toLocaleString()}</p>
               </div>
               <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      const amount = prompt('Enter top-up amount (IDR):');
                      if (amount && !isNaN(parseInt(amount))) {
                        topUpMutation.mutate(parseInt(amount));
                      }
                    }}
                    disabled={topUpMutation.isPending}
                    className="px-6 py-3 rounded-2xl bg-amber-500 text-black font-black text-xs uppercase tracking-widest hover:bg-amber-400 transition-all disabled:opacity-50"
                  >
                     {topUpMutation.isPending ? 'Topping up...' : 'Top Up Reserves'}
                  </button>
                  <button 
                    onClick={() => {
                      // Navigate to audit logs and filter by finance
                      window.location.hash = '/audit-logs'
                    }}
                    className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                     View Usage History
                  </button>
               </div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
                <Landmark className="text-primary-light" size={26} />
                Rekening Pencairan
              </h3>
              <p className="text-sm text-zinc-500 mt-1">Review rekening kurir sebelum saldo dapat dicairkan.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              {payoutAccounts?.filter((item: any) => item.status === 'pending_review').length || 0} pending
            </span>
          </div>

          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-2">
            {payoutAccounts?.map((account: any) => (
              <div key={account.id} className="p-5 rounded-[28px] bg-white/[0.02] border border-white/5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-black text-zinc-100 truncate">{account.courier_name}</p>
                    <p className="text-xs text-zinc-500 mt-1">{account.courier_phone || '-'} • {account.application_channel || 'courier'}</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0",
                    account.status === 'verified' ? "bg-emerald-500/10 text-emerald-400" :
                    account.status === 'pending_review' ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  )}>
                    {account.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Bank</p>
                    <p className="text-sm font-black text-zinc-200 mt-1">{account.bank_code}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Nomor</p>
                    <p className="text-sm font-black text-zinc-200 mt-1">{account.account_number}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5 min-w-0">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Nama</p>
                    <p className="text-sm font-black text-zinc-200 mt-1 truncate">{account.account_name}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => updatePayoutAccountMutation.mutate({
                      id: account.id,
                      status: 'verified',
                      reason: 'Rekening sesuai dokumen onboarding dan siap untuk pencairan.'
                    })}
                    disabled={account.status === 'verified' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    <CheckCircle2 size={14} />
                    Verifikasi
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Alasan penolakan rekening:') || 'Data rekening tidak sesuai dokumen.';
                      updatePayoutAccountMutation.mutate({ id: account.id, status: 'rejected', reason });
                    }}
                    disabled={account.status === 'rejected' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase tracking-widest hover:bg-red-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    <XCircle size={14} />
                    Tolak
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Alasan suspend rekening:') || 'Rekening ditahan untuk review keamanan.';
                      updatePayoutAccountMutation.mutate({ id: account.id, status: 'suspended', reason });
                    }}
                    disabled={account.status === 'suspended' || updatePayoutAccountMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-[10px] uppercase tracking-widest hover:bg-amber-500/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    <Ban size={14} />
                    Suspend
                  </button>
                </div>
              </div>
            ))}
            {(!payoutAccounts || payoutAccounts.length === 0) && (
              <div className="py-16 text-center text-zinc-500 font-bold">Belum ada rekening pencairan untuk direview.</div>
            )}
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
                <ShieldCheck className="text-primary-light" size={26} />
                Pengajuan Pencairan
              </h3>
              <p className="text-sm text-zinc-500 mt-1">Kontrol status settlement kurir dengan audit trail.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              {payoutRequests?.filter((item: any) => ['requested', 'under_review', 'approved', 'processing'].includes(item.status)).length || 0} aktif
            </span>
          </div>

          <div className="space-y-4 max-h-[560px] overflow-y-auto pr-2">
            {payoutRequests?.map((request: any) => (
              <div key={request.id} className="p-5 rounded-[28px] bg-white/[0.02] border border-white/5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-black text-zinc-100 truncate">{request.courier_name}</p>
                    <p className="text-xs text-zinc-500 mt-1">{request.request_number} • {format(new Date(request.requested_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0",
                    request.status === 'paid' ? "bg-emerald-500/10 text-emerald-400" :
                    ['failed', 'rejected', 'cancelled'].includes(request.status) ? "bg-red-500/10 text-red-400" :
                    "bg-amber-500/10 text-amber-400"
                  )}>
                    {request.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Nominal</p>
                    <p className="text-lg font-black text-zinc-100 mt-1">{formatCurrency(request.amount_idr)}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/20 border border-white/5">
                    <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Tujuan</p>
                    <p className="text-sm font-black text-zinc-200 mt-1">
                      {request.destination_snapshot?.bank_code} • **** {request.destination_snapshot?.account_number_last4}
                    </p>
                  </div>
                </div>

                {!['paid', 'failed', 'rejected', 'cancelled'].includes(request.status) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'under_review',
                        reason: 'Masuk proses review treasury.'
                      })}
                      disabled={request.status !== 'requested' || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 disabled:opacity-40"
                    >
                      Review
                    </button>
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'approved',
                        reason: 'Disetujui untuk proses settlement.'
                      })}
                      disabled={!['requested', 'under_review'].includes(request.status) || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'paid',
                        reason: 'Dana sudah dikirim ke rekening terverifikasi.'
                      })}
                      disabled={!['approved', 'processing'].includes(request.status) || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest hover:bg-primary-light disabled:opacity-40"
                    >
                      Mark Paid
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt('Alasan gagal/tolak pencairan:') || 'Pencairan tidak lolos review treasury.';
                        updatePayoutRequestMutation.mutate({ id: request.id, status: 'rejected', reason });
                      }}
                      disabled={updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase tracking-widest hover:bg-red-500/20 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
            {(!payoutRequests || payoutRequests.length === 0) && (
              <div className="py-16 text-center text-zinc-500 font-bold">Belum ada pengajuan pencairan.</div>
            )}
          </div>
        </div>
      </div>

      {/* Pending Settlements Table */}
      <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
         <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-4">
               <CreditCard className="text-primary-light" size={28} />
               Payout Gateway
            </h3>
            <button 
              onClick={() => {
                if (confirm('Are you sure you want to release ALL pending payouts?')) {
                  batchReleaseMutation.mutate();
                }
              }}
              disabled={batchReleaseMutation.isPending}
              className="flex items-center gap-2 text-xs font-black text-primary-light uppercase tracking-widest hover:text-primary transition-all disabled:opacity-50"
            >
               {batchReleaseMutation.isPending ? 'Processing Batch...' : 'Batch Trigger All'}
               <ChevronRight size={14} />
            </button>
         </div>
         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="border-b border-white/5">
                     {['Payout ID', 'Courier Partner', 'Created', 'Amount', 'Status', 'Actions'].map(h => (
                       <th key={h} className="pb-6 text-[10px] font-black text-zinc-600 uppercase tracking-widest">{h}</th>
                     ))}
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                  {payouts?.map((set: any) => (
                    <tr key={set.id} className="group hover:bg-white/[0.01] transition-all">
                       <td className="py-8 font-mono text-[10px] text-zinc-500 uppercase">{set.id.split('-')[0]}...</td>
                       <td className="py-8">
                          <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center font-bold text-xs text-zinc-400">
                                {set.courier_name.charAt(0)}
                             </div>
                             <div className="flex flex-col">
                                <span className="font-bold text-zinc-200">{set.courier_name}</span>
                                <span className="text-[10px] text-zinc-500">{set.courier_phone}</span>
                             </div>
                          </div>
                       </td>
                       <td className="py-8 text-[10px] font-bold text-zinc-500">
                          {format(new Date(set.created_at), 'dd MMM yyyy HH:mm')}
                       </td>
                       <td className="py-8 text-sm font-black text-zinc-100">
                          Rp {parseInt(set.net_idr).toLocaleString()}
                       </td>
                       <td className="py-8">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            set.disbursement_status === 'pending' ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
                          )}>
                             {set.disbursement_status}
                          </span>
                       </td>
                       <td className="py-8">
                          {set.disbursement_status === 'pending' && (
                            <button 
                              onClick={() => releaseMutation.mutate(set.id)}
                              disabled={releaseMutation.isPending}
                              className="px-4 py-2 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest hover:bg-primary-light transition-all shadow-lg shadow-primary/10 disabled:opacity-50"
                            >
                               {releaseMutation.isPending ? 'Processing...' : 'Release'}
                            </button>
                          )}
                       </td>
                    </tr>
                  ))}
                  {(!payouts || payouts.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-zinc-500 font-bold italic uppercase tracking-widest">
                        No pending payouts found
                      </td>
                    </tr>
                  )}
               </tbody>
            </table>
         </div>
      </div>

      {/* Unit Economics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase">Unit Economics</h3>
            <div className="space-y-6">
               {unitEconomics.map((item: any, i: number) => (
                 <div key={i} className="flex items-center justify-between p-6 rounded-3xl bg-white/[0.01] border border-white/5 group hover:border-white/10 transition-all">
                    <div>
                       <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{item.label}</p>
                       <p className="text-xl font-black text-zinc-100 mt-1">Rp {item.value.toLocaleString()}</p>
                    </div>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                      item.status === 'Healthy' ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                    )}>
                       {item.status}
                    </span>
                 </div>
               ))}
            </div>
         </div>

         <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase">Tax Compliance (PPN)</h3>
            <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
               <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Total PPN to be Remitted (Current Masa)</p>
               <p className="text-5xl font-black text-zinc-100 tracking-tighter">
                  Rp {(financialData?.ppn_total || 0).toLocaleString()}
               </p>
               <div className="flex gap-3 pt-4">
                  <button 
                    onClick={async () => {
                      try {
                        const res = await api.get('/admin/finance/masa-report/export', { responseType: 'blob' })
                        const url = URL.createObjectURL(res.data)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `ppn_masa_report_${new Date().toISOString().split('T')[0]}.csv`
                        a.click()
                        URL.revokeObjectURL(url)
                      } catch { toast.error('Masa report export failed') }
                    }}
                    className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                     Export Masa Report
                  </button>
                  <button className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light transition-all">
                     Finalize & Pay
                  </button>
               </div>
            </div>
         </div>
      </div>
    </div>
  )
}
