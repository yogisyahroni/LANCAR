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

export type FinanceTab = 'treasury' | 'pnl' | 'tax' | 'trial-balance' | 'ledger' | 'reconciliation' | 'closing' | 'unit-economics';

export function useFinanceData() {
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



  // derived metrics (moved from inline JSX IIFE)
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

  return {
    COLORS,
    activePayoutStatuses,
    payoutStatusLabel,
    riskActionLabel,
    queryClient,
    activeTab,
    setActiveTab,
    pnlPeriod,
    setPnlPeriod,
    pphPeriod,
    setPphPeriod,
    closingPeriod,
    setClosingPeriod,
    totpInput,
    setTotpInput,
    selectedReviewId,
    setSelectedReviewId,
    ledgerStartDate,
    setLedgerStartDate,
    ledgerEndDate,
    setLedgerEndDate,
    ledgerAccountFilter,
    setLedgerAccountFilter,
    ledgerJournalTypeFilter,
    setLedgerJournalTypeFilter,
    simInfraCost,
    setSimInfraCost,
    simSalaryCost,
    setSimSalaryCost,
    simReserveCost,
    setSimReserveCost,
    confirmModal,
    setConfirmModal,
    financialData,
    isLoadingStats,
    payouts,
    isLoadingPayouts,
    payoutAccounts,
    isLoadingPayoutAccounts,
    payoutRequests,
    isLoadingPayoutRequests,
    payoutOps,
    isLoadingPayoutOps,
    serviceSettlementSummary,
    isLoadingServiceSettlement,
    payoutReviewQueue,
    isLoadingReviewQueue,
    activeReviewId,
    payoutReviewDetail,
    cashPosition,
    isLoadingCashPosition,
    pnlReport,
    isLoadingPnl,
    taxDashboard,
    isLoadingTax,
    pphReport,
    isLoadingPph,
    unitEconomicsData,
    isLoadingUnitEconomics,
    updatePayoutAccountMutation,
    updatePayoutRequestMutation,
    payoutReviewActionMutation,
    dispatchApprovedPayoutsMutation,
    reconcilePayoutsMutation,
    releaseMutation,
    batchReleaseMutation,
    reconciliationSummary,
    isLoadingRecon,
    runReconciliationMutation,
    closingPeriods,
    isLoadingPeriods,
    closingPnl,
    isLoadingClosingPnl,
    closingTB,
    isLoadingClosingTB,
    closingCashLiability,
    isLoadingCashLiability,
    closingTaxSummary,
    isLoadingTaxSummary,
    closingSettlementOutstanding,
    isLoadingSettlementOutstanding,
    lockPeriodMutation,
    topUpMutation,
    trialBalanceData,
    isLoadingTrialBalance,
    ledgerEntriesData,
    isLoadingLedgerEntries,
    stats,
    revenueBreakdown,
    emergencyFund,
    unitEconomics,
    opsCounts,
    latestReconItems,
    formatCurrency,
    serviceSettlementRows,
    serviceSettlementTotals,
    serviceLabel,
    reviewRequest,
    reviewRisk,
    reviewAccount,
    handleExportEfaktur,
    handleExportPPh23,
    runReviewAction,
    handleModalConfirm,
    gtv,
    courierEscrow,
    totalTrx,
    realOmzet,
    totalInfra,
    totalSalary,
    totalReserve,
    totalCompanyDeductions,
    netProfit,
    pphBadan22,
  };
}

export type FinanceData = ReturnType<typeof useFinanceData>;
