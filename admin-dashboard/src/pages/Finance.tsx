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
  ShieldCheck,
  FileSearch,
  Smartphone,
  AlertTriangle,
  Wallet,
  Users,
  Clock,
  BarChart2,
  FileText,
  Receipt,
  Calendar,
  AlertCircle,
  ArrowRight,
  TrendingDown as TrendDown,
  Lock
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
  Bar,
  AreaChart,
  Area,
  CartesianGrid
} from 'recharts'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { clientLog } from '../lib/clientLogger'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { useState } from 'react'
import { ConfirmPayoutModal, type PayoutReviewAction } from '../components/ConfirmPayoutModal'

const COLORS = ['#006437', '#10b981', '#34d399', '#6ee7b7'];

const activePayoutStatuses = ['requested', 'risk_screening', 'approved_auto', 'risk_hold', 'manual_review', 'under_review', 'approved', 'processing'];

const payoutStatusLabel = (request: any) => request.status_label || ({
  requested: 'Pemeriksaan otomatis',
  risk_screening: 'Pemeriksaan otomatis',
  approved_auto: 'Auto approved',
  risk_hold: 'Needs review',
  manual_review: 'Needs review',
  under_review: 'Needs review',
  approved: 'Diproses',
  processing: 'Diproses',
  paid: 'Berhasil',
  blocked: 'Blocked by risk',
  rejected: 'Ditolak',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
} as Record<string, string>)[request.status] || String(request.status || '').replaceAll('_', ' ');

const riskActionLabel = (request: any) => ({
  auto_approved: 'Auto approved',
  needs_review: 'Needs review',
  blocked_by_risk: 'Blocked by risk',
  processing: 'Processing',
  screening: 'Screening',
  terminal: 'Closed',
} as Record<string, string>)[request.risk_action] || payoutStatusLabel(request);

type FinanceTab = 'treasury' | 'pnl' | 'tax' | 'trial-balance' | 'ledger' | 'reconciliation' | 'closing' | 'unit-economics';

export default function Finance() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FinanceTab>('treasury');
  const [pnlPeriod, setPnlPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const [pphPeriod, setPphPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const [closingPeriod, setClosingPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const [totpInput, setTotpInput] = useState<string>('');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [ledgerStartDate, setLedgerStartDate] = useState<string>(new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 10));
  const [ledgerEndDate, setLedgerEndDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState<string>('');
  const [ledgerJournalTypeFilter, setLedgerJournalTypeFilter] = useState<string>('');

  // Simulator States
  const [simInfraCost, setSimInfraCost] = useState<number>(1500);
  const [simSalaryCost, setSimSalaryCost] = useState<number>(1000);
  const [simReserveCost, setSimReserveCost] = useState<number>(1500);

  // S3-AD-01: Modal state replaces window.prompt()
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: PayoutReviewAction;
    reviewId: string;
  } | null>(null);

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

  const { data: payoutOps, isLoading: isLoadingPayoutOps } = useQuery({
    queryKey: ['finance-payout-ops-dashboard'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/payout-ops-dashboard');
      return res.data?.data;
    }
  });

  const { data: serviceSettlementSummary, isLoading: isLoadingServiceSettlement } = useQuery({
    queryKey: ['finance-service-settlement-summary'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/service-settlement-summary', { params: { days: 30 } });
      return res.data?.data;
    },
    enabled: activeTab === 'treasury',
    staleTime: 60_000,
  });

  const { data: payoutReviewQueue, isLoading: isLoadingReviewQueue } = useQuery({
    queryKey: ['finance-payout-review-queue'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/payout-review-queue');
      return res.data?.data || [];
    }
  });

  const activeReviewId = selectedReviewId || payoutReviewQueue?.[0]?.id || null;

  const { data: payoutReviewDetail } = useQuery({
    queryKey: ['finance-payout-review-detail', activeReviewId],
    enabled: Boolean(activeReviewId),
    queryFn: async () => {
      const res = await api.get(`/admin/finance/payout-requests/${activeReviewId}/detail`);
      return res.data?.data;
    }
  });

  // ── New P0 queries ─────────────────────────────────────────────────────────
  const { data: cashPosition, isLoading: isLoadingCashPosition } = useQuery({
    queryKey: ['finance-cash-position'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/cash-position');
      return res.data;
    },
    staleTime: 60_000,
  });

  const { data: pnlReport, isLoading: isLoadingPnl } = useQuery({
    queryKey: ['finance-pnl-report', pnlPeriod],
    queryFn: async () => {
      const res = await api.get('/admin/finance/pnl-report', { params: { period: pnlPeriod } });
      return res.data;
    },
    staleTime: 60_000,
  });

  const { data: taxDashboard, isLoading: isLoadingTax } = useQuery({
    queryKey: ['finance-tax-dashboard'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/tax-dashboard');
      return res.data;
    },
    staleTime: 60_000,
  });

  const { data: pphReport, isLoading: isLoadingPph } = useQuery({
    queryKey: ['finance-pph-report', pphPeriod],
    queryFn: async () => {
      const res = await api.get('/admin/finance/pph-report', { params: { period: pphPeriod } });
      return res.data;
    },
    staleTime: 60_000,
  });

  const { data: unitEconomicsData, isLoading: isLoadingUnitEconomics } = useQuery({
    queryKey: ['finance-unit-economics-v2'],
    queryFn: async () => {
      const res = await api.get('/admin/finance/unit-economics');
      return res.data?.data || null;
    },
    enabled: activeTab === 'unit-economics',
    staleTime: 60_000,
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

  const payoutReviewActionMutation = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: string; reason: string }) => {
      const res = await api.post(`/admin/finance/payout-requests/${id}/review-action`, { action, reason });
      return res.data?.data;
    },
    onSuccess: () => {
      toast.success('Review payout diproses dan masuk audit trail');
      queryClient.invalidateQueries({ queryKey: ['finance-payout-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['finance-payout-review-detail'] });
      queryClient.invalidateQueries({ queryKey: ['finance-payout-requests'] });
      queryClient.invalidateQueries({ queryKey: ['finance-payout-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['finance-payout-ops-dashboard'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Gagal memproses review payout');
    }
  });

  const dispatchApprovedPayoutsMutation = useMutation({
    mutationFn: async (totpCode: string) => {
      const res = await api.post('/admin/finance/payouts/dispatch-approved', {}, {
        headers: { 'x-totp-code': totpCode }
      });
      return res.data?.data;
    },
    onSuccess: (data) => {
      const skipped = data?.skipped?.length || 0;
      toast.success(`${data?.processed || 0} pencairan dikirim ke provider${skipped ? `, ${skipped} ditahan limit` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['finance-payout-requests'] });
      queryClient.invalidateQueries({ queryKey: ['finance-payouts'] });
    },
    onError: () => {
      toast.error('Gagal dispatch pencairan otomatis');
    }
  });

  const reconcilePayoutsMutation = useMutation({
    mutationFn: async (totpCode: string) => {
      const res = await api.post('/admin/finance/payouts/reconcile', {}, {
        headers: { 'x-totp-code': totpCode }
      });
      return res.data?.data;
    },
    onSuccess: (data) => {
      toast.success(`Rekonsiliasi selesai: ${data?.items?.length || 0} temuan`);
      queryClient.invalidateQueries({ queryKey: ['finance-payout-ops-dashboard'] });
    },
    onError: () => {
      toast.error('Gagal menjalankan rekonsiliasi payout');
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

  const { data: reconciliationSummary, isLoading: isLoadingRecon } = useQuery({
    queryKey: ['reconciliation-summary'],
    enabled: activeTab === 'reconciliation',
    queryFn: async () => {
      const res = await api.get('/admin/finance/reconciliation/summary');
      return res.data?.data || [];
    }
  });

  const runReconciliationMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/admin/finance/wallet-reconciliation/run', {});
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-summary'] });
      toast.success('Wallet & ledger reconciliation run completed successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to run reconciliation');
    }
  });

  const { data: closingPeriods = [], isLoading: isLoadingPeriods } = useQuery({
    queryKey: ['closing-periods'],
    enabled: activeTab === 'closing',
    queryFn: async () => {
      const res = await api.get('/admin/finance/closing/periods');
      return res.data?.data || [];
    }
  });

  const { data: closingPnl, isLoading: isLoadingClosingPnl } = useQuery({
    queryKey: ['closing-pnl', closingPeriod],
    enabled: activeTab === 'closing',
    queryFn: async () => {
      const res = await api.get(`/admin/finance/closing/p-and-l?period=${closingPeriod}`);
      return res.data?.data || null;
    }
  });

  const { data: closingTB = [], isLoading: isLoadingClosingTB } = useQuery({
    queryKey: ['closing-tb', closingPeriod],
    enabled: activeTab === 'closing',
    queryFn: async () => {
      const res = await api.get(`/admin/finance/closing/trial-balance?period_code=${closingPeriod}`);
      return res.data?.data || [];
    }
  });

  const { data: closingCashLiability = [], isLoading: isLoadingCashLiability } = useQuery({
    queryKey: ['closing-cash-liability', closingPeriod],
    enabled: activeTab === 'closing',
    queryFn: async () => {
      const res = await api.get(`/admin/finance/closing/cash-liability?period_code=${closingPeriod}`);
      return res.data?.data || [];
    }
  });

  const { data: closingTaxSummary = [], isLoading: isLoadingTaxSummary } = useQuery({
    queryKey: ['closing-tax-summary', closingPeriod],
    enabled: activeTab === 'closing',
    queryFn: async () => {
      const res = await api.get(`/admin/finance/closing/tax-summary?period_code=${closingPeriod}`);
      return res.data?.data || [];
    }
  });

  const { data: closingSettlementOutstanding = [], isLoading: isLoadingSettlementOutstanding } = useQuery({
    queryKey: ['closing-settlement-outstanding'],
    enabled: activeTab === 'closing',
    queryFn: async () => {
      const res = await api.get(`/admin/finance/closing/settlement-outstanding`);
      return res.data?.data || [];
    }
  });

  const lockPeriodMutation = useMutation({
    mutationFn: async ({ period, totpCode }: { period: string; totpCode?: string }) => {
      const res = await api.post('/admin/finance/closing/lock', { period, totpCode }, {
        headers: totpCode ? { 'x-totp-code': totpCode } : {}
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closing-periods'] });
      toast.success('Accounting period locked successfully');
      setTotpInput('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal mengunci periode akuntansi');
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

  const { data: trialBalanceData, isLoading: isLoadingTrialBalance } = useQuery({
    queryKey: ['finance-trial-balance', ledgerStartDate, ledgerEndDate],
    queryFn: async () => {
      const res = await api.get(`/admin/finance/trial-balance?startDate=${ledgerStartDate}&endDate=${ledgerEndDate}`);
      return res.data?.data || [];
    },
    enabled: activeTab === 'trial-balance',
  });

  const { data: ledgerEntriesData, isLoading: isLoadingLedgerEntries } = useQuery({
    queryKey: ['finance-ledger-entries', ledgerStartDate, ledgerEndDate, ledgerAccountFilter, ledgerJournalTypeFilter],
    queryFn: async () => {
      const res = await api.get(`/admin/finance/ledger?startDate=${ledgerStartDate}&endDate=${ledgerEndDate}&accountName=${ledgerAccountFilter}&journalType=${ledgerJournalTypeFilter}`);
      return res.data?.data || [];
    },
    enabled: activeTab === 'ledger',
  });

  if (isLoadingStats || isLoadingPayouts || isLoadingPayoutAccounts || isLoadingPayoutRequests || isLoadingPayoutOps || isLoadingReviewQueue) {
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
  const opsCounts = payoutOps?.status_counts || {};
  const latestReconItems = payoutOps?.reconciliation?.items || [];
  const formatCurrency = (value: number | string) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
  const serviceSettlementRows = serviceSettlementSummary?.services || [];
  const serviceSettlementTotals = serviceSettlementSummary?.summary || {};
  const serviceLabel = (value: string) => ({
    on_demand: 'Paket',
    food_delivery: 'Food',
    tambal_ban: 'Tambal Ban',
    towing: 'Towing',
    regular: 'Regular',
    p2p: 'Paket',
  } as Record<string, string>)[value] || String(value || '-').replaceAll('_', ' ');
  const reviewRequest = payoutReviewDetail?.request;
  const reviewRisk = payoutReviewDetail?.risk;
  const reviewAccount = payoutReviewDetail?.payout_account;


  const handleExportEfaktur = async () => {
    try {
      const res = await api.get(`/admin/finance/tax-efaktur/export?month=${pphPeriod}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `efaktur_${pphPeriod}.csv`);
      document.body.appendChild(link);
      link.click();
      toast.success('e-Faktur CSV downloaded');
    } catch (e) {
      toast.error('Failed to export e-Faktur');
    }
  };

  const handleExportPPh23 = async () => {
    try {
      const res = await api.get(`/admin/finance/tax-pph23/export?month=${pphPeriod}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pph23_${pphPeriod}.csv`);
      document.body.appendChild(link);
      link.click();
      toast.success('PPh 23 CSV downloaded');
    } catch (e) {
      toast.error('Failed to export PPh 23');
    }
  };

  // S3-AD-01 Fix: Opens the confirmation modal instead of calling window.prompt().
  // The modal shows courier name, amount, action type, and requires a min-length reason.
  const runReviewAction = (action: string) => {
    if (!activeReviewId) return;
    setConfirmModal({
      isOpen: true,
      action: action as PayoutReviewAction,
      reviewId: activeReviewId,
    });
  };

  const handleModalConfirm = (reason: string) => {
    if (!confirmModal) return;
    payoutReviewActionMutation.mutate(
      { id: confirmModal.reviewId, action: confirmModal.action, reason },
      {
        onSettled: () => {
          setConfirmModal(null);
        },
      }
    );
  };


  return (
    <div className="space-y-8 animate-in">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight italic uppercase">Finance Dashboard</h1>
          <p className="text-zinc-500 mt-1">Treasury, P&L, Pajak, dan Settlement — satu tempat untuk staff finance.</p>
        </div>
        {activeTab === 'treasury' && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                const code = window.prompt("Masukkan 6-digit kode TOTP untuk DISPATCH:");
                if (code) dispatchApprovedPayoutsMutation.mutate(code);
              }}
              disabled={dispatchApprovedPayoutsMutation.isPending}
              className="px-5 py-2.5 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {dispatchApprovedPayoutsMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Dispatch
            </button>
            <button
              onClick={() => {
                const code = window.prompt("Masukkan 6-digit kode TOTP untuk RECONCILE:");
                if (code) reconcilePayoutsMutation.mutate(code);
              }}
              disabled={reconcilePayoutsMutation.isPending}
              className="px-5 py-2.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 font-black text-xs uppercase tracking-widest hover:bg-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {reconcilePayoutsMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Reconcile
            </button>
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
                } catch (error) { clientLog.error('Payout export failed', { error }) }
              }}
              className="px-5 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-xs uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center gap-2"
            >
              <Download size={16} />
              Export CSV
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
              className="px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <Download size={16} />
              Audit CSV
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await api.get('/admin/finance/payout-risk-audit/export', { responseType: 'blob' })
                  const url = URL.createObjectURL(res.data)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `payout_risk_audit_${new Date().toISOString().split('T')[0]}.csv`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch { toast.error('Risk audit export failed') }
              }}
              className="px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <Download size={16} />
              Risk CSV
            </button>
          </div>
        )}
      </div>

      {/* ── Cash Position Strip ─────────────────────────────────────────── */}
      {!isLoadingCashPosition && cashPosition && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: 'Kas Masuk 30H', value: cashPosition.inflow_30d, color: 'text-emerald-400', icon: ArrowUpRight },
            { label: 'Kas Keluar 30H', value: cashPosition.outflow_30d, color: 'text-red-400', icon: ArrowDownRight },
            { label: 'Escrow Customer', value: cashPosition.customer_escrow, color: 'text-amber-400', icon: Wallet },
            { label: 'Escrow Kurir', value: cashPosition.courier_escrow, color: 'text-blue-400', icon: Users },
            { label: 'Payout Pending', value: cashPosition.pending_payouts, color: 'text-orange-400', icon: Clock },
            { label: 'Total Liabilitas', value: cashPosition.total_liabilities, color: 'text-red-300', icon: TrendingDown },
            { label: 'Emergency Fund', value: cashPosition.emergency_fund, color: 'text-amber-300', icon: ShieldAlert },
            { label: 'Cash Ratio', value: null, rawLabel: `${cashPosition.cash_ratio}%`, color: cashPosition.cash_ratio > 30 ? 'text-emerald-400' : 'text-red-400', icon: BarChart2 },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="glass-card p-4 rounded-[20px] border-white/5 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon size={12} className={item.color} />
                  <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest leading-tight">{item.label}</p>
                </div>
                <p className={`text-base font-black ${item.color} leading-none`}>
                  {item.rawLabel ?? `Rp ${Number(item.value || 0).toLocaleString('id-ID')}`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tab Navigation ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/5 w-fit">
        {([
          { id: 'treasury' as FinanceTab, label: 'Treasury & Settlement', icon: Landmark },
          { id: 'pnl' as FinanceTab, label: 'Laporan P&L', icon: BarChart2 },
          { id: 'tax' as FinanceTab, label: 'Pajak (PPN + PPh)', icon: Receipt },
          { id: 'trial-balance' as FinanceTab, label: 'Neraca Saldo', icon: PieIcon },
          { id: 'ledger' as FinanceTab, label: 'Buku Besar', icon: Wallet },
          { id: 'reconciliation' as FinanceTab, label: 'Reconciliation Center', icon: ShieldCheck },
          { id: 'closing' as FinanceTab, label: 'Monthly Closing', icon: Lock },
          { id: 'unit-economics' as FinanceTab, label: 'Unit Economics', icon: TrendingUp },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all',
              activeTab === id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: TREASURY (existing content below)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'treasury' && (
      <div className="space-y-8">

      <div className="glass-card rounded-[44px] border-white/5 overflow-hidden">
        <div className="p-8 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
              <Receipt className="text-emerald-400" size={26} />
              Service Settlement Snapshot
            </h3>
            <p className="text-sm text-zinc-500 mt-1">Gross, fee platform, earning kurir, settlement merchant, adjustment, refund, dan cancel fee 30 hari terakhir.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-0 xl:min-w-[720px]">
            {[
              { label: 'Gross', value: serviceSettlementTotals.gross_idr, color: 'text-emerald-400' },
              { label: 'Platform Fee', value: serviceSettlementTotals.platform_fee_idr, color: 'text-primary-light' },
              { label: 'Courier Earning', value: serviceSettlementTotals.courier_earning_idr, color: 'text-blue-300' },
              { label: 'Merchant Settle', value: serviceSettlementTotals.merchant_settlement_idr, color: 'text-amber-300' },
              { label: 'Adjustment', value: serviceSettlementTotals.adjustment_idr, color: 'text-violet-300' },
              { label: 'Refund', value: serviceSettlementTotals.refund_idr, color: 'text-red-300' },
              { label: 'Cancel Fee', value: serviceSettlementTotals.cancel_fee_idr, color: 'text-orange-300' },
              { label: 'Net', value: serviceSettlementTotals.net_after_settlement_idr, color: 'text-zinc-100' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{item.label}</p>
                <p className={cn("mt-2 text-sm font-black leading-tight", item.color)}>{formatCurrency(item.value || 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {isLoadingServiceSettlement ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs font-black text-zinc-500 uppercase tracking-widest">Menghitung settlement snapshot...</p>
          </div>
        ) : serviceSettlementRows.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt className="mx-auto text-zinc-700" size={42} />
            <p className="mt-4 text-sm font-black text-zinc-500 uppercase tracking-widest">Belum ada order delivered/completed 30 hari terakhir.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">
                  <th className="px-8 py-4">Service</th>
                  <th className="px-6 py-4 text-right">Gross</th>
                  <th className="px-6 py-4 text-right">Platform Fee</th>
                  <th className="px-6 py-4 text-right">Courier</th>
                  <th className="px-6 py-4 text-right">Merchant</th>
                  <th className="px-6 py-4 text-right">Refund</th>
                  <th className="px-6 py-4 text-right">Cancel Fee</th>
                  <th className="px-8 py-4 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {serviceSettlementRows.map((row: any) => (
                  <tr key={row.service_bucket} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-5">
                      <p className="text-sm font-black text-zinc-100">{serviceLabel(row.service_bucket)}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                        {row.delivered_orders || 0} delivered
                        {row.open_settlement_count ? ` • ${row.open_settlement_count} open settlement` : ''}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-emerald-300">{formatCurrency(row.gross_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-primary-light">{formatCurrency(row.platform_fee_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-blue-300">{formatCurrency(row.courier_earning_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-amber-300">{formatCurrency(row.merchant_settlement_idr)}</td>
                    <td className="px-6 py-5 text-right text-sm font-black text-red-300">
                      {formatCurrency(row.refund_idr)}
                      {row.refund_count ? <span className="block text-[10px] text-zinc-600">{row.refund_count} refund</span> : null}
                    </td>
                    <td className="px-6 py-5 text-right text-sm font-black text-orange-300">
                      {formatCurrency(row.cancel_fee_idr)}
                      {row.cancel_fee_count ? <span className="block text-[10px] text-zinc-600">{row.cancel_fee_count} fee</span> : null}
                    </td>
                    <td className="px-8 py-5 text-right text-sm font-black text-zinc-100">{formatCurrency(row.net_after_settlement_idr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-6">
          <h3 className="text-xl font-black text-zinc-100 italic uppercase">Auto Payout Control</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Auto', opsCounts.auto_approved_count || 0, 'text-emerald-400'],
              ['Manual', opsCounts.manual_review_count || 0, 'text-amber-400'],
              ['Blocked', opsCounts.blocked_count || 0, 'text-red-400'],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{label}</p>
                <p className={cn("text-3xl font-black mt-2", color as string)}>{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Failed Monitor</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <span className="text-xs text-zinc-400">1h <b className="text-red-400">{payoutOps?.failed_monitor?.failed_last_hour || 0}</b></span>
              <span className="text-xs text-zinc-400">24h <b className="text-red-400">{payoutOps?.failed_monitor?.failed_last_day || 0}</b></span>
              <span className="text-xs text-zinc-400">Stale <b className="text-amber-400">{payoutOps?.failed_monitor?.stale_processing || 0}</b></span>
            </div>
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-5">
          <h3 className="text-xl font-black text-zinc-100 italic uppercase">Risk Reason Breakdown</h3>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {payoutOps?.risk_reason_breakdown?.map((item: any) => (
              <div key={item.reason} className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                <p className="text-xs font-bold text-zinc-300 line-clamp-2">{item.reason}</p>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary-light">{item.count}</span>
              </div>
            ))}
            {(!payoutOps?.risk_reason_breakdown || payoutOps.risk_reason_breakdown.length === 0) && (
              <p className="py-8 text-center text-sm font-bold text-zinc-500">Belum ada alasan risk aktif.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-8 rounded-[40px] border-white/5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase">Reconciliation</h3>
            <span className={cn(
              "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
              (payoutOps?.reconciliation?.mismatch_count || 0) > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
            )}>
              {payoutOps?.reconciliation?.mismatch_count || 0} mismatch
            </span>
          </div>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {latestReconItems.slice(0, 6).map((item: any) => (
              <div key={item.id} className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black text-zinc-200 uppercase">{String(item.check_type || '').replaceAll('_', ' ')}</p>
                  <span className={cn("text-[10px] font-black uppercase", item.severity === 'critical' ? "text-red-400" : "text-amber-400")}>{item.severity}</span>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">{item.expected_value || '-'} {'->'} {item.actual_value || '-'}</p>
              </div>
            ))}
            {latestReconItems.length === 0 && (
              <p className="py-8 text-center text-sm font-bold text-zinc-500">Belum ada mismatch pada run terakhir.</p>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card rounded-[44px] border-white/5 overflow-hidden">
        <div className="p-8 border-b border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase flex items-center gap-3">
              <FileSearch className="text-amber-400" size={26} />
              Manual Review Queue
            </h3>
            <p className="text-sm text-zinc-500 mt-1">Prioritas berdasarkan risk score, status hold/block, nominal, dan aging request.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 min-w-[320px]">
            <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Queue</p>
              <p className="text-2xl font-black text-zinc-100">{payoutReviewQueue?.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-red-500/10 border border-red-500/10 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-red-400/70">Critical</p>
              <p className="text-2xl font-black text-red-400">
                {payoutReviewQueue?.filter((item: any) => item.status === 'blocked' || item.risk_level === 'critical').length || 0}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/10 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/70">High</p>
              <p className="text-2xl font-black text-amber-400">
                {payoutReviewQueue?.filter((item: any) => item.risk_level === 'high').length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr]">
          <div className="border-r border-white/5 p-6 space-y-3 max-h-[720px] overflow-y-auto">
            {payoutReviewQueue?.map((item: any) => (
              <button
                key={item.id}
                onClick={() => setSelectedReviewId(item.id)}
                className={cn(
                  "w-full text-left rounded-[28px] border p-5 transition-all",
                  activeReviewId === item.id
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-zinc-100">{item.courier_name}</p>
                    <p className="mt-1 text-[11px] font-mono text-zinc-500">{item.request_number}</p>
                  </div>
                  <span className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                    item.status === 'blocked' ? "bg-red-500/10 text-red-400" :
                    item.risk_level === 'high' || item.risk_level === 'critical' ? "bg-amber-500/10 text-amber-400" :
                    "bg-white/5 text-zinc-400"
                  )}>
                    {item.risk_score || 0}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-zinc-100">{formatCurrency(item.amount_idr)}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{payoutStatusLabel(item)}</p>
                </div>
                {item.risk_reasons?.length > 0 && (
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-400">{item.risk_reasons.slice(0, 2).join(' • ')}</p>
                )}
              </button>
            ))}
            {(!payoutReviewQueue || payoutReviewQueue.length === 0) && (
              <div className="py-16 text-center text-sm font-bold text-zinc-500">Tidak ada payout yang perlu manual review.</div>
            )}
          </div>

          <div className="p-8 space-y-6">
            {reviewRequest ? (
              <>
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-600">Review Case</p>
                    <h4 className="mt-2 text-3xl font-black text-zinc-100">{reviewRequest.courier_name}</h4>
                    <p className="mt-1 text-sm text-zinc-500">{reviewRequest.request_number} • {format(new Date(reviewRequest.requested_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 min-w-[320px]">
                    <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Risk Score</p>
                      <p className={cn("mt-2 text-3xl font-black", (reviewRisk?.score || 0) >= 80 ? "text-red-400" : "text-amber-400")}>{reviewRisk?.score || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Nominal</p>
                      <p className="mt-3 text-lg font-black text-zinc-100">{formatCurrency(reviewRequest.amount_idr)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-[28px] border border-red-500/10 bg-red-500/[0.03] p-5 lg:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
                      <AlertTriangle size={14} />
                      Alasan Hold / Block
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(reviewRisk?.reasons || []).map((reason: string) => (
                        <span key={reason} className="rounded-full bg-black/20 border border-white/5 px-3 py-2 text-xs font-bold text-zinc-300">{reason}</span>
                      ))}
                      {(!reviewRisk?.reasons || reviewRisk.reasons.length === 0) && (
                        <span className="text-sm font-bold text-zinc-500">Tidak ada alasan risk aktif.</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Rekening Tujuan</p>
                    <p className="mt-4 text-lg font-black text-zinc-100">{reviewAccount?.bank_code || '-'}</p>
                    <p className="mt-1 text-sm text-zinc-400">{reviewAccount?.account_number || '-'}</p>
                    <p className="mt-1 text-xs text-zinc-500">{reviewAccount?.account_name || '-'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-2">
                      <Smartphone size={14} />
                      Device / IP Metadata
                    </p>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between gap-4"><span className="text-zinc-500">Device</span><b className="text-zinc-200 truncate">{reviewRisk?.device_id || '-'}</b></div>
                      <div className="flex justify-between gap-4"><span className="text-zinc-500">IP Address</span><b className="text-zinc-200">{reviewRisk?.ip_address || '-'}</b></div>
                      <div className="flex justify-between gap-4"><span className="text-zinc-500">User Agent</span><b className="text-zinc-200 truncate">{reviewRisk?.user_agent || '-'}</b></div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Ledger Source</p>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.ledger_sources?.slice(0, 6).map((ledger: any) => (
                        <div key={ledger.id} className="flex items-center justify-between gap-4 rounded-2xl bg-black/20 border border-white/5 px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-zinc-200">{ledger.transaction_type}</p>
                            <p className="text-[11px] text-zinc-500">{ledger.description || ledger.source}</p>
                          </div>
                          <span className={cn("text-sm font-black", ledger.direction === 'credit' ? "text-emerald-400" : "text-red-400")}>{formatCurrency(ledger.amount_idr)}</span>
                        </div>
                      ))}
                      {(!payoutReviewDetail?.ledger_sources || payoutReviewDetail.ledger_sources.length === 0) && (
                        <p className="py-8 text-center text-sm font-bold text-zinc-500">Belum ada ledger source.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">History Payout Kurir</p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.payout_history?.map((history: any) => (
                        <div key={history.id} className="flex items-center justify-between gap-4 rounded-2xl bg-black/20 border border-white/5 px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-zinc-200">{history.request_number}</p>
                            <p className="text-[11px] text-zinc-500">{format(new Date(history.requested_at), 'dd MMM HH:mm')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-zinc-100">{formatCurrency(history.amount_idr)}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{history.status}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/5 bg-white/[0.02] p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Audit Trail Terakhir</p>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {payoutReviewDetail?.security_events?.slice(0, 8).map((event: any) => (
                        <div key={event.id} className="rounded-2xl bg-black/20 border border-white/5 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black text-zinc-200">{String(event.event_type || '').replaceAll('_', ' ')}</p>
                            <p className="text-[10px] font-bold text-zinc-500">{format(new Date(event.created_at), 'dd MMM HH:mm')}</p>
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500">{event.old_status || '-'} {'->'} {event.new_status || '-'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-amber-500/10 bg-amber-500/[0.03] p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Admin Actions</p>
                  <p className="mt-2 text-sm text-zinc-500">Semua aksi di bawah wajib TOTP melalui middleware admin dan dicatat ke audit trail payout.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={() => runReviewAction('approve')}
                      disabled={payoutReviewActionMutation.isPending || reviewRequest.status === 'blocked'}
                      className="px-5 py-3 rounded-2xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => runReviewAction('reject')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => runReviewAction('request_more_verification')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Request Verification
                    </button>
                    <button
                      onClick={() => runReviewAction('suspend_payout_account')}
                      disabled={payoutReviewActionMutation.isPending}
                      className="px-5 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-xs uppercase tracking-widest disabled:opacity-40"
                    >
                      Suspend Account
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-28 text-center">
                <FileSearch className="mx-auto text-zinc-700" size={54} />
                <p className="mt-4 text-lg font-black text-zinc-400">Pilih request untuk investigasi.</p>
              </div>
            )}
          </div>
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
              <div className="h-[280px] w-[280px] relative min-w-0 min-h-0">
                 <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
           <div className="h-[300px] w-full min-w-0 min-h-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
                      // Inline confirm for account-level suspend (no payout amount context here)
                      if (window.confirm(`Suspend rekening payout milik ${account.account_name || 'kurir ini'}? Aksi ini akan diaudit.`)) {
                        updatePayoutAccountMutation.mutate({ id: account.id, status: 'suspended', reason: 'Rekening ditahan untuk review keamanan oleh admin.' });
                      }
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
              {payoutRequests?.filter((item: any) => activePayoutStatuses.includes(item.status)).length || 0} aktif
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
                    ['failed', 'rejected', 'blocked', 'cancelled'].includes(request.status) ? "bg-red-500/10 text-red-400" :
                    ['approved_auto', 'approved', 'processing'].includes(request.status) ? "bg-primary/10 text-primary-light" :
                    "bg-amber-500/10 text-amber-400"
                  )}>
                    {payoutStatusLabel(request)}
                  </span>
                </div>

                {request.risk_decision && (
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Risk Engine</p>
                      <span className={cn(
                        "rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                        request.risk_decision === 'auto_approved' ? "bg-emerald-500/10 text-emerald-400" :
                        request.risk_decision === 'blocked' ? "bg-red-500/10 text-red-400" :
                        "bg-amber-500/10 text-amber-400"
                      )}>
                        {riskActionLabel(request)} • {request.risk_score ?? 0}
                      </span>
                    </div>
                    {request.risk_reasons?.length > 0 && (
                      <p className="mt-2 line-clamp-2 text-xs text-zinc-400">{request.risk_reasons.slice(0, 2).join(' • ')}</p>
                    )}
                  </div>
                )}

                {(request.provider_reference || request.provider_status || request.provider_payload_hash) && (
                  <div className="rounded-2xl border border-primary/10 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Provider Dispatch</p>
                      <span className={cn(
                        "rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                        request.provider_status === 'paid' || request.status === 'paid' ? "bg-emerald-500/10 text-emerald-400" :
                        request.provider_status === 'failed' || request.status === 'failed' ? "bg-red-500/10 text-red-400" :
                        "bg-blue-500/10 text-blue-400"
                      )}>
                        {request.provider_status || request.status}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-zinc-400">
                      <span>Provider: <b className="text-zinc-200">{request.provider_name || '-'}</b></span>
                      <span>Reference: <b className="text-zinc-200">{request.provider_reference || '-'}</b></span>
                      <span>Payload: <b className="text-zinc-200">{String(request.provider_payload_hash || request.dispatch_payload_hash || '-').slice(0, 12)}</b></span>
                      <span>Response: <b className="text-zinc-200">{String(request.provider_response_hash || request.dispatch_response_hash || '-').slice(0, 12)}</b></span>
                    </div>
                  </div>
                )}

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

                {!['paid', 'failed', 'rejected', 'blocked', 'cancelled'].includes(request.status) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updatePayoutRequestMutation.mutate({
                        id: request.id,
                        status: 'manual_review',
                        reason: 'Masuk proses review treasury.'
                      })}
                      disabled={!['requested', 'risk_screening', 'risk_hold'].includes(request.status) || updatePayoutRequestMutation.isPending}
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
                      disabled={!['requested', 'risk_screening', 'risk_hold', 'manual_review', 'under_review', 'approved_auto'].includes(request.status) || updatePayoutRequestMutation.isPending}
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
                      disabled={!['approved_auto', 'approved', 'processing'].includes(request.status) || updatePayoutRequestMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest hover:bg-primary-light disabled:opacity-40"
                    >
                      Mark Paid
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Reject payout ini? Kurir dapat mengajukan ulang. Aksi ini dicatat ke audit trail.')) {
                          updatePayoutRequestMutation.mutate({ id: request.id, status: 'rejected', reason: 'Pencairan tidak lolos review treasury.' });
                        }
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

      {/* Tax Compliance Section */}
      <div className="grid grid-cols-1 gap-8">
         <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
            <h3 className="text-xl font-black text-zinc-100 italic uppercase">Tax Compliance (PPN) — Quick View</h3>
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
                  <button
                    onClick={() => setActiveTab('tax')}
                    className="px-6 py-3 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light transition-all flex items-center gap-2"
                  >
                    <Receipt size={14} />
                    Detail Tax Dashboard
                  </button>
               </div>
            </div>
         </div>
      </div>

      {/* close treasury tab */}
      </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: P&L REPORT
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pnl' && (
        <div className="space-y-8">
          {/* Period Picker */}
          <div className="flex items-center gap-4">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Periode:</label>
            <input
              type="month"
              value={pnlPeriod}
              onChange={(e) => setPnlPeriod(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
            />
            {isLoadingPnl && <Loader2 size={16} className="animate-spin text-zinc-500" />}
          </div>

          {pnlReport && (
            <div className="space-y-6">
              {/* Architecture Simulator Configuration */}
              <div className="glass-card p-6 rounded-[28px] border-white/5 space-y-4">
                <div className="flex items-center gap-3">
                  <BarChart2 className="text-primary-light" size={20} />
                  <h3 className="text-lg font-black text-zinc-100 uppercase italic">Simulator Struktur Biaya / Transaksi</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Modal Infra (Rp/Trx)</label>
                    <input 
                      type="number" 
                      value={simInfraCost} 
                      onChange={(e) => setSimInfraCost(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/5 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Gaji/Operasional (Rp/Trx)</label>
                    <input 
                      type="number" 
                      value={simSalaryCost} 
                      onChange={(e) => setSimSalaryCost(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/5 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kas Perusahaan (Rp/Trx)</label>
                    <input 
                      type="number" 
                      value={simReserveCost} 
                      onChange={(e) => setSimReserveCost(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/5 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* WATERFALL DASHBOARD */}
              <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
                
                <h3 className="text-xl font-black text-zinc-100 italic uppercase">Aliran Dana (Waterfall) — {pnlPeriod}</h3>
                
                {(() => {
                  const gtv = pnlReport.summary.gross_revenue;
                  const courierEscrow = pnlReport.summary.courier_payout;
                  const totalTrx = pnlReport.summary.total_transactions;
                  const realOmzet = Math.max(0, gtv - courierEscrow);
                  
                  const totalInfra = simInfraCost * totalTrx;
                  const totalSalary = simSalaryCost * totalTrx;
                  const totalReserve = simReserveCost * totalTrx;
                  
                  const totalCompanyDeductions = totalInfra + totalSalary + totalReserve;
                  const netProfit = realOmzet - totalCompanyDeductions;
                  
                  // PPh Badan is exactly 22% of Net Profit
                  const pphBadan22 = netProfit > 0 ? Math.round(netProfit * 0.22) : 0;
                  const finalCompanyCash = netProfit - pphBadan22;

                  return (
                    <div className="space-y-6 relative z-10">
                      
                      {/* LEVEL 1: GTV */}
                      <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Level 1: GTV (Total Uang Masuk)</p>
                          <p className="text-3xl font-black text-emerald-400 mt-1">Rp {gtv.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest">Total Transaksi</p>
                          <p className="text-lg font-black text-emerald-400/90">{totalTrx.toLocaleString('id-ID')}</p>
                        </div>
                      </div>

                      {/* DOWN ARROWS */}
                      <div className="flex justify-center -my-2 opacity-50">
                        <ArrowDownRight className="text-zinc-500" />
                        <ArrowDownRight className="text-zinc-500" />
                      </div>

                      {/* LEVEL 2: SPLIT GTV */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Hutang Dagang (Milik Kurir)</p>
                          <p className="text-xl font-black text-blue-400 mt-1">Rp {courierEscrow.toLocaleString('id-ID')}</p>
                          <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">Dana ini adalah titipan murni milik mitra kurir, tidak boleh dihitung sebagai pendapatan.</p>
                        </div>
                        
                        <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20 ring-1 ring-primary/30 shadow-[0_0_30px_-5px_rgba(var(--primary-rgb),0.2)]">
                          <p className="text-[10px] font-black text-primary-light uppercase tracking-widest">Omzet Asli Perusahaan</p>
                          <p className="text-3xl font-black text-white mt-1">Rp {realOmzet.toLocaleString('id-ID')}</p>
                          <p className="text-[10px] text-zinc-400 mt-2">GTV dikurangi Hutang Dagang. Ini adalah angka dasar perusahaan (Komisi + Platform Fee).</p>
                        </div>
                      </div>

                      {/* DOWN ARROW */}
                      <div className="flex justify-end pr-[25%] -my-2 opacity-50">
                        <ArrowDownRight className="text-zinc-500" />
                      </div>

                      {/* LEVEL 3: DEDUCTIONS FROM OMZET */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-6" /> {/* Spacer */}
                        
                        <div className="md:col-span-6 p-6 rounded-2xl bg-zinc-900/50 border border-white/5 space-y-4">
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-2">Potongan Operasional (Dari Omzet)</p>
                          
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-zinc-400 font-bold">Modal Infra (API/OTP)</span>
                            <span className="text-red-400 font-black">- Rp {totalInfra.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-zinc-400 font-bold">Gaji & Operasional</span>
                            <span className="text-red-400 font-black">- Rp {totalSalary.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-zinc-400 font-bold">Kas Perusahaan (Reserve)</span>
                            <span className="text-red-400 font-black">- Rp {totalReserve.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                            <span className="text-[10px] font-black text-zinc-500 uppercase">Total Potongan</span>
                            <span className="text-red-400 font-black">- Rp {totalCompanyDeductions.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      </div>

                      {/* DOWN ARROW */}
                      <div className="flex justify-end pr-[25%] -my-2 opacity-50">
                        <ArrowDownRight className="text-zinc-500" />
                      </div>

                      {/* LEVEL 4: NET PROFIT & TAX */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-4" /> {/* Spacer */}
                        
                        <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={cn(
                            "p-6 rounded-2xl border",
                            netProfit >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"
                          )}>
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Profit Bersih Kena Pajak</p>
                            <p className={cn(
                              "text-3xl font-black mt-1",
                              netProfit >= 0 ? "text-emerald-400" : "text-red-400"
                            )}>
                              Rp {netProfit.toLocaleString('id-ID')}
                            </p>
                            <p className="text-[10px] text-zinc-500 mt-2">Omzet dikurangi seluruh potongan.</p>
                          </div>

                          <div className="p-6 rounded-2xl bg-red-950/30 border border-red-500/30 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-2 opacity-10"><Ban size={64} /></div>
                            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest relative z-10">Pajak PPh Badan (22%) Ghoib</p>
                            <p className="text-3xl font-black text-red-500 mt-1 relative z-10">
                              Rp {pphBadan22.toLocaleString('id-ID')}
                            </p>
                            <p className="text-[10px] text-red-400/60 mt-2 relative z-10">
                              Alokasi pajak (Ghoib) wajib disisihkan jika berbentuk PT Badan.
                            </p>
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })()}
              </div>

              {/* Extra Original P&L Details as Accordion/Secondary */}
              <details className="glass-card rounded-[28px] border-white/5 overflow-hidden group">
                <summary className="p-6 font-black text-zinc-300 italic uppercase cursor-pointer hover:bg-white/[0.02] transition-colors flex items-center justify-between">
                  <span>Data Pendukung (PPN, Layanan, Diskon)</span>
                  <ChevronRight size={18} className="text-zinc-500 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="p-6 pt-0 border-t border-white/5 mt-2 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Total PPN Dipungut</p>
                          <p className="text-xl font-black text-amber-400 mt-1">Rp {Number(pnlReport.summary.ppn_collected).toLocaleString('id-ID')}</p>
                        </div>
                     </div>
                     <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Subsidi Promo/Voucher</p>
                          <p className="text-xl font-black text-red-400 mt-1">Rp {Number(pnlReport.summary.promo_subsidy).toLocaleString('id-ID')}</p>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Revenue per Layanan</p>
                    {pnlReport.model_breakdown.map((m: any) => (
                      <div key={m.model} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-zinc-300 capitalize">{m.model}</span>
                          <span className="font-black text-zinc-100">Rp {Number(m.revenue).toLocaleString('id-ID')}</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${m.share_pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-zinc-600">
                          <span>{m.order_count} order</span>
                          <span>{m.share_pct}%</span>
                        </div>
                      </div>
                    ))}
                    {pnlReport.model_breakdown.length === 0 && (
                      <p className="text-zinc-600 text-sm italic text-center py-4">Tidak ada data untuk periode ini</p>
                    )}
                  </div>
                </div>
              </details>
            </div>
          )}

          {!pnlReport && !isLoadingPnl && (
            <div className="glass-card p-16 rounded-[36px] border-white/5 text-center">
              <p className="text-zinc-500 font-bold italic uppercase text-sm">Pilih periode untuk melihat laporan P&L</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: TAX DASHBOARD
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tax' && (
        <div className="space-y-8">

          {/* PPN Dashboard */}
          {isLoadingTax ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-zinc-600" /></div>
          ) : taxDashboard && (
            <>
              {/* Deadline Alert */}
              <div className={cn(
                'flex items-center gap-4 p-5 rounded-2xl border',
                taxDashboard.days_until_deadline <= 5
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : taxDashboard.days_until_deadline <= 10
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              )}>
                <AlertCircle size={20} />
                <div className="flex-1">
                  <p className="font-black text-sm uppercase tracking-widest">
                    Deadline Lapor SPT Masa PPN: {taxDashboard.deadline_date}
                  </p>
                  <p className="text-[11px] opacity-70 mt-0.5">
                    {taxDashboard.days_until_deadline > 0
                      ? `${taxDashboard.days_until_deadline} hari lagi — pastikan PPN masa ${taxDashboard.current_masa} sudah dilaporkan ke DJP`
                      : 'Deadline telah lewat!'}
                  </p>
                </div>
              </div>

              {/* PPN Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: `PPN Masa ${taxDashboard.current_masa}`, value: taxDashboard.ppn_current_masa, color: 'text-amber-400', desc: 'Harus disetor ke DJP' },
                  { label: 'Gross Revenue Masa Ini', value: taxDashboard.gross_revenue_current_masa, color: 'text-emerald-400', desc: 'Dasar pengenaan pajak' },
                  { label: 'Jumlah Transaksi', value: null, rawLabel: taxDashboard.transaction_count_current_masa?.toLocaleString('id-ID'), color: 'text-blue-400', desc: 'Transaksi kena PPN' },
                ].map((item) => (
                  <div key={item.label} className="glass-card p-6 rounded-[28px] border-white/5 space-y-2">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{item.label}</p>
                    <p className={`text-3xl font-black ${item.color} tracking-tight`}>
                      {item.rawLabel ?? `Rp ${Number(item.value || 0).toLocaleString('id-ID')}`}
                    </p>
                    <p className="text-[10px] text-zinc-600">{item.desc}</p>
                  </div>
                ))}
              </div>

              {/* PPN Masa History Table */}
              <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-zinc-100 italic uppercase">Riwayat Masa PPN (12 Bulan)</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportEfaktur}
                      className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-light text-white font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
                    >
                      <Download size={12} />Export e-Faktur
                    </button>
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
                        } catch { toast.error('Export gagal') }
                      }}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                    >
                      <Download size={12} />Export Laporan PPN
                    </button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['Masa', 'Transaksi', 'Gross Revenue', 'PPN Dipungut', 'Status'].map(h => (
                        <th key={h} className="pb-4 text-left text-[10px] font-black text-zinc-600 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {taxDashboard.masa_history.map((row: any) => (
                      <tr key={row.masa} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 font-black text-zinc-100">{row.masa}</td>
                        <td className="py-4 text-zinc-400">{row.transaction_count.toLocaleString()}</td>
                        <td className="py-4 font-bold text-zinc-300">Rp {Number(row.gross_revenue).toLocaleString('id-ID')}</td>
                        <td className="py-4 font-black text-amber-400">Rp {Number(row.ppn_collected).toLocaleString('id-ID')}</td>
                        <td className="py-4">
                          <span className={cn(
                            'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest',
                            row.status === 'submitted' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          )}>
                            {row.status === 'submitted' ? '✓ Dilaporkan' : 'Draft'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* PPh Report Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-zinc-100 italic uppercase">PPh Kurir (Pasal 21/23)</h3>
                <p className="text-zinc-500 text-xs mt-1">Estimasi pajak penghasilan mitra kurir yang melebihi PTKP TK/0 (Rp 50jt/tahun)</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportPPh23}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-light text-white font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
                >
                  <Download size={12} />Export PPh 23
                </button>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Periode:</label>
                <input
                  type="month"
                  value={pphPeriod}
                  onChange={(e) => setPphPeriod(e.target.value)}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-100 text-sm font-bold focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {isLoadingPph ? (
              <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-zinc-600" /></div>
            ) : pphReport && (
              <>
                {/* PPh Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Kurir Dibayar', value: null, rawLabel: pphReport.summary.total_couriers_paid?.toLocaleString(), color: 'text-blue-400' },
                    { label: 'Total Payout', value: pphReport.summary.total_payout_amount, color: 'text-emerald-400' },
                    { label: 'Kurir Kena PPh', value: null, rawLabel: pphReport.summary.couriers_subject_to_pph?.toString(), color: 'text-orange-400' },
                    { label: 'Est. PPh 21 Total', value: pphReport.summary.estimated_pph21_total, color: 'text-red-400' },
                  ].map((item) => (
                    <div key={item.label} className="glass-card p-5 rounded-[24px] border-white/5 space-y-2">
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{item.label}</p>
                      <p className={`text-xl font-black ${item.color}`}>
                        {item.rawLabel ?? `Rp ${Number(item.value || 0).toLocaleString('id-ID')}`}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="glass-card p-8 rounded-[36px] border-white/5 space-y-4">
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-black text-zinc-100 uppercase italic">Detail Kurir</h4>
                    <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-widest">
                      {pphReport.couriers.filter((c: any) => c.subject_to_pph).length} kena PPh
                    </span>
                  </div>
                  <div className="overflow-auto max-h-80">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b border-white/5">
                          {['Kurir', 'Total Payout', 'Jml Payout', 'Est. PPh 21', 'Status'].map(h => (
                            <th key={h} className="pb-3 text-left text-[10px] font-black text-zinc-600 uppercase tracking-widest">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pphReport.couriers.map((c: any) => (
                          <tr key={c.courier_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                            <td className="py-3">
                              <div>
                                <p className="font-bold text-zinc-200 text-sm">{c.courier_name}</p>
                                <p className="text-[10px] text-zinc-600">{c.phone}</p>
                              </div>
                            </td>
                            <td className="py-3 font-bold text-zinc-300">Rp {Number(c.total_earned).toLocaleString('id-ID')}</td>
                            <td className="py-3 text-zinc-400">{c.payout_count}</td>
                            <td className="py-3">
                              {c.subject_to_pph ? (
                                <span className="font-black text-red-400">Rp {Number(c.estimated_pph21).toLocaleString('id-ID')}</span>
                              ) : (
                                <span className="text-zinc-600 italic">Di bawah PTKP</span>
                              )}
                            </td>
                            <td className="py-3">
                              <span className={cn(
                                'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest',
                                c.subject_to_pph ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                              )}>
                                {c.subject_to_pph ? 'Kena PPh' : 'Bebas Pajak'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {pphReport.couriers.length === 0 && (
                          <tr><td colSpan={5} className="py-10 text-center text-zinc-600 italic">Tidak ada data untuk periode ini</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {/* ── TAB: TRIAL BALANCE (NERACA SALDO) ───────────────────────────────────── */}
      {activeTab === 'trial-balance' && (
        <div className="space-y-8 animate-in">
          <div className="flex items-center justify-between p-6 rounded-2xl bg-zinc-900 border border-white/5">
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest">Neraca Saldo (Trial Balance)</h3>
              <p className="text-sm text-zinc-500 mt-1">Laporan saldo awal, mutasi debit/kredit, dan saldo akhir per akun GL.</p>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="date"
                value={ledgerStartDate}
                onChange={(e) => setLedgerStartDate(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
              <span className="text-zinc-600 font-black tracking-widest uppercase">To</span>
              <input
                type="date"
                value={ledgerEndDate}
                onChange={(e) => setLedgerEndDate(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div className="glass-card rounded-[24px] border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Detail Neraca Saldo</h3>
            </div>
            
            {isLoadingTrialBalance ? (
              <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-zinc-600" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      {['Kode GL', 'Nama Akun', 'Saldo Awal', 'Total Debit', 'Total Kredit', 'Saldo Akhir'].map(h => (
                        <th key={h} className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(trialBalanceData || []).map((row: any) => (
                      <tr key={row.gl_code} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-md bg-white/5 text-[10px] font-mono text-zinc-400 group-hover:text-primary-light transition-colors">{row.gl_code}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-zinc-300 text-sm">{row.gl_name}</td>
                        <td className="px-6 py-4 font-medium text-zinc-400 text-sm">Rp {Number(row.opening_balance).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 font-medium text-emerald-400 text-sm">Rp {Number(row.total_debit).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 font-medium text-red-400 text-sm">Rp {Number(row.total_credit).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 font-bold text-white text-sm bg-white/[0.01]">Rp {Number(row.closing_balance).toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                    {(trialBalanceData || []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-zinc-600 text-sm font-medium">
                          Tidak ada data neraca saldo pada periode ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: LEDGER (BUKU BESAR) ────────────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div className="space-y-8 animate-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between p-6 rounded-2xl bg-zinc-900 border border-white/5 gap-4">
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest">Buku Besar (Ledger)</h3>
              <p className="text-sm text-zinc-500 mt-1">Daftar entri jurnal berdasarkan waktu riil.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="text"
                placeholder="Filter Akun GL"
                value={ledgerAccountFilter}
                onChange={(e) => setLedgerAccountFilter(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none w-40"
              />
              <select
                value={ledgerJournalTypeFilter}
                onChange={(e) => setLedgerJournalTypeFilter(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                <option value="">Semua Journal Type</option>
                <option value="payment">Payment</option>
                <option value="refund">Refund</option>
                <option value="wallet_topup">Wallet Topup</option>
                <option value="wallet_withdraw">Wallet Withdraw</option>
                <option value="courier_payout">Courier Payout</option>
                <option value="merchant_settlement">Merchant Settlement</option>
                <option value="provider_invoice">Provider Invoice</option>
              </select>
              <input
                type="date"
                value={ledgerStartDate}
                onChange={(e) => setLedgerStartDate(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
              <span className="text-zinc-600 font-black tracking-widest uppercase">To</span>
              <input
                type="date"
                value={ledgerEndDate}
                onChange={(e) => setLedgerEndDate(e.target.value)}
                className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div className="glass-card rounded-[24px] border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Detail Journal Entries</h3>
            </div>
            
            {isLoadingLedgerEntries ? (
              <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-zinc-600" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      {['Tanggal', 'Journal ID', 'Tipe Journal', 'Akun', 'Debit', 'Kredit', 'Keterangan'].map(h => (
                        <th key={h} className="px-6 py-4 text-left text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(ledgerEntriesData || []).map((row: any) => (
                      <tr key={row.entry_id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4 font-medium text-zinc-400 text-[11px] whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-mono text-zinc-400 w-max">{row.journal_id?.substring(0,8)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded bg-zinc-800 text-xs text-zinc-300 font-bold uppercase">{row.journal_type}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-zinc-300 text-sm">{row.account_name}</td>
                        <td className="px-6 py-4 font-medium text-emerald-400 text-sm">{row.debit_idr ? `Rp ${Number(row.debit_idr).toLocaleString('id-ID')}` : '-'}</td>
                        <td className="px-6 py-4 font-medium text-red-400 text-sm">{row.credit_idr ? `Rp ${Number(row.credit_idr).toLocaleString('id-ID')}` : '-'}</td>
                        <td className="px-6 py-4 text-zinc-400 text-xs">{row.reason}</td>
                      </tr>
                    ))}
                    {(ledgerEntriesData || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-zinc-600 text-sm font-medium">
                          Tidak ada data journal entry pada periode dan filter ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: RECONCILIATION CENTER (ADM-004)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-8 animate-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-zinc-100">Wallet & Ledger Reconciliation Center</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Audit otomatis secara real-time saldo wallet, ledger akuntansi, dan transaksi penyelesaian.
              </p>
            </div>
            <button
              onClick={() => runReconciliationMutation.mutate()}
              disabled={runReconciliationMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
            >
              {runReconciliationMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ShieldCheck size={16} />
              )}
              Jalankan Rekonsiliasi Sekarang
            </button>
          </div>

          <div className="glass-card p-6 rounded-3xl border-white/5">
            {isLoadingRecon ? (
              <div className="py-12 flex justify-center">
                <Loader2 size={32} className="text-primary animate-spin" />
              </div>
            ) : reconciliationSummary && reconciliationSummary.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reconciliationSummary.map((item: any, idx: number) => (
                  <div key={idx} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-zinc-400">
                        {item.domain || item.name || `Domain #${idx + 1}`}
                      </span>
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-bold uppercase",
                        item.status === 'balanced' || item.mismatches === 0
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      )}>
                        {item.status || (item.mismatches === 0 ? 'Balanced' : 'Mismatch Found')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-3 rounded-xl bg-black/20">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold">Matched</p>
                        <p className="text-lg font-black text-zinc-200 mt-1">{item.matched_count || item.matched || 0}</p>
                      </div>
                      <div className="p-3 rounded-xl bg-black/20">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold">Mismatches</p>
                        <p className="text-lg font-black text-red-400 mt-1">{item.mismatch_count || item.mismatches || 0}</p>
                      </div>
                    </div>
                    {item.discrepancy_idr !== undefined && (
                      <div className="pt-2 border-t border-white/5 flex justify-between text-xs">
                        <span className="text-zinc-500">Discrepancy:</span>
                        <span className="font-bold text-zinc-300">
                          Rp {Number(item.discrepancy_idr || 0).toLocaleString('id-ID')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500 text-sm">
                Belum ada riwayat rekonsiliasi. Klik tombol &quot;Jalankan Rekonsiliasi Sekarang&quot; untuk memulai audit.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: UNIT ECONOMICS
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'unit-economics' && (
        <div className="space-y-8 animate-in">
          <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase">Unit Economics</h3>
            <p className="text-zinc-400">Analisis metrik per transaksi (Margin, subsidi, promo) secara real-time.</p>
            {isLoadingUnitEconomics ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {unitEconomicsData?.metrics?.map((item: any, i: number) => (
                   <div key={i} className="flex flex-col p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{item.label}</p>
                      <p className="text-2xl font-black text-zinc-100 mt-2">{formatCurrency(item.value)}</p>
                      <span className={cn(
                        "mt-4 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest w-fit",
                        item.status === 'Healthy' ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                      )}>
                         {item.status}
                      </span>
                   </div>
                 ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: NERACA SALDO (TRIAL BALANCE)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'trial-balance' && (
        <div className="space-y-8 animate-in">
          <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
            <h3 className="text-2xl font-black text-zinc-100 italic uppercase">Neraca Saldo (Trial Balance)</h3>
            <div className="flex gap-4 mb-4">
              <input type="date" value={ledgerStartDate} onChange={e => setLedgerStartDate(e.target.value)} className="px-4 py-2 bg-black/30 text-white rounded-xl" />
              <input type="date" value={ledgerEndDate} onChange={e => setLedgerEndDate(e.target.value)} className="px-4 py-2 bg-black/30 text-white rounded-xl" />
            </div>
            {isLoadingTrialBalance ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-zinc-500 text-xs font-bold uppercase tracking-wider">
                      <th className="pb-3">No. Akun / Nama</th>
                      <th className="pb-3 text-right">Debit (Rp)</th>
                      <th className="pb-3 text-right">Kredit (Rp)</th>
                      <th className="pb-3 text-right">Saldo (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {trialBalanceData.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="py-4 text-sm font-bold text-zinc-200">{row.account_name}</td>
                        <td className="py-4 text-sm font-mono text-zinc-400 text-right">{formatCurrency(row.debit_idr)}</td>
                        <td className="py-4 text-sm font-mono text-zinc-400 text-right">{formatCurrency(row.credit_idr)}</td>
                        <td className="py-4 text-sm font-mono font-bold text-zinc-100 text-right">{formatCurrency(row.balance_idr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: MONTHLY CLOSING WORKFLOW (RPT-001 / ADM-005)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'closing' && (
        <div className="space-y-8 animate-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-zinc-100">Monthly Closing Workflow (Periode Akuntansi)</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Kunci periode akuntansi dengan verifikasi keamanan TOTP dan unduh laporan penutupan bulanan.
              </p>
            </div>
            <button
              onClick={() => window.open('/api/v1/admin/finance/closing/export', '_blank')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-200 font-bold text-sm transition-all"
            >
              <Download size={16} />
              Export Laporan Closing (CSV/PDF)
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="glass-card p-6 rounded-3xl border-white/5 space-y-6 lg:col-span-1">
              <div className="flex items-center gap-2 text-primary">
                <Lock size={20} />
                <h3 className="text-lg font-bold text-zinc-100">Lock Periode Akuntansi</h3>
              </div>
              <p className="text-xs text-zinc-400">
                Mengunci periode mencegah modifikasi jurnal dan transaksi mundur untuk kepatuhan audit.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-2">Pilih Bulan Periode</label>
                  <input
                    type="month"
                    value={closingPeriod}
                    onChange={(e) => setClosingPeriod(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/30 border border-white/10 text-zinc-200 text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-2">TOTP 2FA Verification Code (Wajib)</label>
                  <input
                    type="text"
                    placeholder="Masukkan 6 digit kode TOTP"
                    value={totpInput}
                    onChange={(e) => setTotpInput(e.target.value)}
                    maxLength={6}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/30 border border-white/10 text-zinc-200 text-sm font-mono tracking-widest focus:outline-none focus:border-primary"
                  />
                </div>

                <button
                  onClick={() => lockPeriodMutation.mutate({ period: closingPeriod, totpCode: totpInput })}
                  disabled={lockPeriodMutation.isPending || !closingPeriod}
                  className="w-full py-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                  {lockPeriodMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Lock size={16} />
                  )}
                  Lock Periode {closingPeriod} (TOTP Required)
                </button>
              </div>
            </div>

            <div className="glass-card p-6 rounded-3xl border-white/5 space-y-6 lg:col-span-2">
              <h3 className="text-lg font-bold text-zinc-100">Status Periode Akuntansi</h3>
              {isLoadingPeriods ? (
                <div className="py-12 flex justify-center">
                  <Loader2 size={28} className="text-primary animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-zinc-500 text-xs font-bold uppercase tracking-wider">
                        <th className="pb-3">Periode</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Locked At</th>
                        <th className="pb-3">Locked By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm">
                      {closingPeriods.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 font-bold text-zinc-200">{item.period || item.month}</td>
                          <td className="py-3.5">
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-xs font-bold uppercase",
                              item.status === 'locked' || item.is_locked
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            )}>
                              {item.status || (item.is_locked ? 'Locked' : 'Open')}
                            </span>
                          </td>
                          <td className="py-3.5 text-zinc-400 text-xs">{item.locked_at ? format(parseISO(item.locked_at), 'dd MMM yyyy HH:mm') : '-'}</td>
                          <td className="py-3.5 text-zinc-400 text-xs">{item.locked_by || '-'}</td>
                        </tr>
                      ))}
                      {closingPeriods.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-zinc-500 text-xs">
                            Belum ada periode akuntansi yang tercatat / terkunci.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
             <div className="glass-card p-6 rounded-3xl border-white/5 space-y-4">
                <h3 className="text-lg font-bold text-zinc-100">Cash & Liability Summary</h3>
                {isLoadingCashLiability ? (
                   <div className="py-4 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
                ) : (
                   <table className="w-full text-left text-sm">
                      <thead>
                         <tr className="text-zinc-500 font-bold uppercase text-[10px] border-b border-white/5">
                            <th className="pb-2">Account</th>
                            <th className="pb-2 text-right">Debit</th>
                            <th className="pb-2 text-right">Credit</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                         {closingCashLiability.map((c: any, i: number) => (
                            <tr key={i}>
                               <td className="py-3 text-zinc-300 font-bold">{c.account_name}</td>
                               <td className="py-3 text-zinc-400 font-mono text-right">{formatCurrency(c.debit_idr)}</td>
                               <td className="py-3 text-zinc-400 font-mono text-right">{formatCurrency(c.credit_idr)}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                )}
             </div>

             <div className="glass-card p-6 rounded-3xl border-white/5 space-y-4">
                <h3 className="text-lg font-bold text-zinc-100">Tax Summary (VAT & WHT)</h3>
                {isLoadingTaxSummary ? (
                   <div className="py-4 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
                ) : (
                   <table className="w-full text-left text-sm">
                      <thead>
                         <tr className="text-zinc-500 font-bold uppercase text-[10px] border-b border-white/5">
                            <th className="pb-2">Tax Type</th>
                            <th className="pb-2 text-right">Count</th>
                            <th className="pb-2 text-right">Total Amount</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                         {closingTaxSummary.map((t: any, i: number) => (
                            <tr key={i}>
                               <td className="py-3 text-zinc-300 font-bold">{t.tax_type}</td>
                               <td className="py-3 text-zinc-400 font-mono text-right">{t.transaction_count}</td>
                               <td className="py-3 text-zinc-400 font-mono text-right">{formatCurrency(t.total_tax)}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                )}
             </div>
          </div>

          <div className="glass-card p-6 rounded-3xl border-white/5 space-y-4">
             <h3 className="text-lg font-bold text-zinc-100">Settlement Outstanding</h3>
             {isLoadingSettlementOutstanding ? (
                <div className="py-4 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
             ) : (
                <table className="w-full text-left text-sm">
                   <thead>
                      <tr className="text-zinc-500 font-bold uppercase text-[10px] border-b border-white/5">
                         <th className="pb-2">Status</th>
                         <th className="pb-2 text-right">Total Settlements</th>
                         <th className="pb-2 text-right">Total Amount (IDR)</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                      {closingSettlementOutstanding.map((s: any, i: number) => (
                         <tr key={i}>
                            <td className="py-3">
                               <span className="px-2 py-1 rounded bg-white/10 text-[10px] uppercase font-bold text-zinc-300">{s.status}</span>
                            </td>
                            <td className="py-3 text-zinc-400 font-mono text-right">{s.total_settlements}</td>
                            <td className="py-3 text-zinc-400 font-mono text-right font-bold">{formatCurrency(s.total_amount)}</td>
                         </tr>
                      ))}
                   </tbody>
                </table>
             )}
          </div>
        </div>
      )}

      {/* S3-AD-01: Secure payout confirmation modal — replaces all window.prompt() for review actions */}
      {confirmModal && (
        <ConfirmPayoutModal
          isOpen={confirmModal.isOpen}
          action={confirmModal.action}
          reviewId={confirmModal.reviewId}
          courierName={reviewRequest?.courier_name}
          amountIdr={reviewRequest?.amount}
          isPending={payoutReviewActionMutation.isPending}
          onConfirm={handleModalConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}
