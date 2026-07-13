import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  DollarSign,
  ArrowUpRight,
  RefreshCw,
  Settings,
  ShieldCheck,
  Save
} from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';

interface MerchantSettlement {
  id: string;
  order_id: string;
  merchant_id?: string;
  user_id?: string;
  amount?: number;
  gross_item_price_idr?: number;
  platform_fee?: number;
  merchant_fee_idr?: number;
  net_amount?: number;
  net_payout_idr?: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
  payout_source?: string;
  status: 'pending' | 'holding' | 'processing' | 'completed' | 'failed';
  failure_reason?: string;
  version?: number;
  created_at: string;
  updated_at?: string;
  processed_at?: string;
  holding_release_at?: string;
  pod_confirmed_at?: string;
  settled_at?: string;
}

interface SettlementConfig {
  holding_days: number;
  auto_enabled: boolean;
  max_retry: number;
  retry_delay_hours: number;
}

export default function MerchantSettlements() {
  const [settlements, setSettlements] = useState<MerchantSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Config dynamic states
  const [config, setConfig] = useState<SettlementConfig>({
    holding_days: 1,
    auto_enabled: true,
    max_retry: 3,
    retry_delay_hours: 1,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Verify merchant bank state
  const [merchantIdToVerify, setMerchantIdToVerify] = useState('');
  const [verifyingBank, setVerifyingBank] = useState(false);

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/finance/merchant-settlements', {
        params: {
          status: statusFilter || undefined,
          limit: 100,
        },
      });
      const data = res.data?.data || res.data;
      setSettlements(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error('Gagal memuat data escrow settlement merchant');
    } finally {
      setLoading(false);
    }
  };

  const fetchConfigs = async () => {
    try {
      const res = await api.get('/admin/finance/merchant-settlements/configs');
      if (res.data) {
        setConfig({
          holding_days: Number(res.data.holding_days ?? 1),
          auto_enabled: Boolean(res.data.auto_enabled),
          max_retry: Number(res.data.max_retry ?? 3),
          retry_delay_hours: Number(res.data.retry_delay_hours ?? 1),
        });
      }
    } catch (err) {
      console.error('Failed to load settlement configs', err);
    }
  };

  useEffect(() => {
    fetchSettlements();
    fetchConfigs();
  }, [statusFilter]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingConfig(true);
      await api.put('/admin/finance/merchant-settlements/configs', config);
      toast.success('Konfigurasi escrow & auto-disbursement berhasil disimpan');
      await fetchConfigs();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan konfigurasi');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleVerifyBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantIdToVerify.trim()) {
      return toast.error('Masukkan Merchant ID / User ID');
    }
    try {
      setVerifyingBank(true);
      const res = await api.patch(
        `/admin/finance/merchant-settlements/merchants/${merchantIdToVerify.trim()}/verify-bank`
      );
      toast.success(res.data.message || 'Rekening bank merchant berhasil diverifikasi');
      setMerchantIdToVerify('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memverifikasi rekening bank merchant');
    } finally {
      setVerifyingBank(false);
    }
  };

  const filteredSettlements = settlements.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const orderId = s.order_id || '';
    const merchantId = s.merchant_id || s.user_id || '';
    const bankHolder = s.bank_account_holder || '';
    const bankNum = s.bank_account_number || '';
    return (
      orderId.toLowerCase().includes(q) ||
      merchantId.toLowerCase().includes(q) ||
      bankHolder.toLowerCase().includes(q) ||
      bankNum.toLowerCase().includes(q)
    );
  });

  const getNetPayout = (s: MerchantSettlement) =>
    Number(s.net_payout_idr ?? s.net_amount ?? 0);

  const getGrossPrice = (s: MerchantSettlement) =>
    Number(s.gross_item_price_idr ?? s.amount ?? 0);

  const getPlatformFee = (s: MerchantSettlement) =>
    Number(s.merchant_fee_idr ?? s.platform_fee ?? 0);

  const totalPendingNet = settlements
    .filter((s) => s.status === 'pending' || s.status === 'holding' || s.status === 'processing')
    .reduce((sum, s) => sum + getNetPayout(s), 0);

  const totalCompletedNet = settlements
    .filter((s) => s.status === 'completed')
    .reduce((sum, s) => sum + getNetPayout(s), 0);

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Escrow & Settlement Merchant
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pantau penahanan dana escrow pesanan reguler & agregator serta atur pencairan otomatis secara dinamis tanpa hardcode.
          </p>
        </div>
        <button
          onClick={() => {
            fetchSettlements();
            fetchConfigs();
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border/40 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Dynamic Settings & Bank Verification Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dynamic Config Card */}
        <div className="lg:col-span-2 rounded-xl bg-card border border-border/40 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Konfigurasi Dinamis Escrow & Auto-Disbursement
            </h2>
          </div>
          <form onSubmit={handleSaveConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Hari Penahanan Dana (setelah POD)
              </label>
              <input
                type="number"
                min="0"
                value={config.holding_days}
                onChange={(e) => setConfig({ ...config, holding_days: Number(e.target.value) })}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Contoh: 1 hari kerja sebelum dana dilepas ke rekening penjual.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Status Auto-Disbursement
              </label>
              <select
                value={config.auto_enabled ? 'true' : 'false'}
                onChange={(e) => setConfig({ ...config, auto_enabled: e.target.value === 'true' })}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="true" className="bg-zinc-950 text-zinc-100">Aktif (Otomatis Pencairan)</option>
                <option value="false" className="bg-zinc-950 text-zinc-100">Nonaktif (Tahan Manual)</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Worker diproses setiap menit menggunakan pengunci anti-race condition.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Maksimal Retry Gagal
              </label>
              <input
                type="number"
                min="1"
                value={config.max_retry}
                onChange={(e) => setConfig({ ...config, max_retry: Number(e.target.value) })}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Jeda Waktu Retry (Jam)
              </label>
              <input
                type="number"
                min="1"
                value={config.retry_delay_hours}
                onChange={(e) => setConfig({ ...config, retry_delay_hours: Number(e.target.value) })}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div className="sm:col-span-2 flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingConfig}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingConfig ? 'Menyimpan...' : 'Simpan Konfigurasi'}
              </button>
            </div>
          </form>
        </div>

        {/* Merchant Bank Verification Card */}
        <div className="rounded-xl bg-card border border-border/40 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <h2 className="text-lg font-semibold text-foreground">
                Verifikasi Rekening Bank
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Rekening bank merchant harus berstatus terverifikasi agar pencairan otomatis tidak diblokir oleh sistem keamanan.
            </p>
            <form onSubmit={handleVerifyBank} className="space-y-3">
              <input
                type="text"
                placeholder="Masukkan Merchant ID / User ID UUID"
                value={merchantIdToVerify}
                onChange={(e) => setMerchantIdToVerify(e.target.value)}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={verifyingBank}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 text-sm transition-colors disabled:opacity-50"
              >
                {verifyingBank ? 'Memverifikasi...' : 'Verifikasi Rekening Bank'}
              </button>
            </form>
          </div>
          <div className="mt-4 pt-3 border-t border-border/40 text-[11px] text-muted-foreground">
            Sertifikasi keamanan: Regulasi Anti-Pencucian Uang & verifikasi kepemilikan rekening.
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl bg-card border border-border/40 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Dana Escrow Tertahan (Pending / Holding)
            </span>
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {formatIDR(totalPendingNet)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Menunggu verifikasi delivered & bukti kirim POD 3PL
          </p>
        </div>

        <div className="rounded-xl bg-card border border-border/40 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Total Dana Selesai Dicairkan
            </span>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {formatIDR(totalCompletedNet)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Berhasil ditransfer ke rekening bank merchant
          </p>
        </div>

        <div className="rounded-xl bg-card border border-border/40 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Total Transaksi Escrow
            </span>
            <DollarSign className="h-5 w-5 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {settlements.length}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Catatan transaksi terlindungi sistem Escrow
          </p>
        </div>
      </div>

      {/* Filters Table Container */}
      <div className="rounded-xl bg-card border border-border/40 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari Order ID, Merchant ID, Rekening..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" className="bg-zinc-950 text-zinc-100">Semua Status</option>
              <option value="holding" className="bg-zinc-950 text-zinc-100">Holding / Escrow</option>
              <option value="pending" className="bg-zinc-950 text-zinc-100">Pending</option>
              <option value="processing" className="bg-zinc-950 text-zinc-100">Processing (Sedang Cair)</option>
              <option value="completed" className="bg-zinc-950 text-zinc-100">Completed (Selesai)</option>
              <option value="failed" className="bg-zinc-950 text-zinc-100">Failed (Gagal)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground">
            Memuat daftar transaksi escrow...
          </div>
        ) : filteredSettlements.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            Belum ada data escrow settlement merchant yang ditemukan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase border-b border-border/40">
                <tr>
                  <th className="px-4 py-3">Order ID / Merchant</th>
                  <th className="px-4 py-3">Rekening Bank</th>
                  <th className="px-4 py-3 text-right">Nilai Bruto</th>
                  <th className="px-4 py-3 text-right">Platform Fee</th>
                  <th className="px-4 py-3 text-right">Net Payout</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Jadwal Rilis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredSettlements.map((item) => {
                  const netAmt = getNetPayout(item);
                  const grossAmt = getGrossPrice(item);
                  const feeAmt = getPlatformFee(item);

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground truncate max-w-[180px]">
                          Order: {item.order_id}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                          Merchant: {item.merchant_id || item.user_id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {item.bank_account_number ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium text-foreground">
                                {item.bank_name || 'BANK'} - {item.bank_account_number}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.bank_account_holder}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-500 italic">
                            Belum set rekening
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatIDR(grossAmt)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatIDR(feeAmt)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatIDR(netAmt)}
                      </td>
                      <td className="px-4 py-3">
                        {item.status === 'completed' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Cair (Completed)
                          </span>
                        )}
                        {(item.status === 'holding' || item.status === 'pending') && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Clock className="h-3.5 w-3.5" />
                            Holding Escrow
                          </span>
                        )}
                        {item.status === 'processing' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Processing
                          </span>
                        )}
                        {item.status === 'failed' && (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            title={item.failure_reason}
                          >
                            <AlertCircle className="h-3.5 w-3.5" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>
                          POD: {item.pod_confirmed_at ? new Date(item.pod_confirmed_at).toLocaleDateString('id-ID') : '-'}
                        </div>
                        <div>
                          Rilis: {item.holding_release_at ? new Date(item.holding_release_at).toLocaleDateString('id-ID') : '-'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
