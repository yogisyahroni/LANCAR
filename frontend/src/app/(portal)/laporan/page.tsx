'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Calendar,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { downloadCsv, type CsvRow } from '@/lib/csv';
import { useNotificationStore } from '@/store/useNotificationStore';

type ReportPeriod = 'bulan_ini' | 'bulan_lalu' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom';

interface ReportSummary {
  total_orders: number;
  completed_orders: number;
  failed_orders: number;
  total_spend: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  avg_weight: number;
  avg_cost: number;
}

interface ReportTrendPoint {
  date: string;
  label: string;
  order_count: number;
  total_spend: number;
}

interface ReportModelDistribution {
  name: string;
  count: number;
  total_spend: number;
}

interface ReportDestinationZone {
  zone: string;
  order_count: number;
  total_spend: number;
}

interface ReportExportRow {
  no_order: string;
  tanggal: string;
  penerima: string;
  tujuan: string;
  berat_kg: number;
  model: string;
  harga: number;
  status: string;
}

interface UmkmReportData {
  period: ReportPeriod;
  range: {
    start_date: string;
    end_date: string;
  };
  summary: ReportSummary;
  trend: ReportTrendPoint[];
  model_distribution: ReportModelDistribution[];
  destination_zones: ReportDestinationZone[];
  export_rows: ReportExportRow[];
}

const periodOptions: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'bulan_ini', label: 'Bulan Ini' },
  { value: 'bulan_lalu', label: 'Bulan Lalu' },
  { value: 'q1', label: 'Q1' },
  { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' },
  { value: 'q4', label: 'Q4' },
];

const distributionColors = ['#009864', '#6366f1', '#f97316', '#0ea5e9', '#f43f5e', '#a855f7'];

const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat('id-ID').format(value);

const formatPercent = (value: number | null) => (value === null ? '-' : `${value.toFixed(1)}%`);

const defaultReportData: UmkmReportData = {
  period: 'bulan_ini',
  range: {
    start_date: '',
    end_date: '',
  },
  summary: {
    total_orders: 0,
    completed_orders: 0,
    failed_orders: 0,
    total_spend: 0,
    completion_rate: null,
    on_time_rate: null,
    avg_weight: 0,
    avg_cost: 0,
  },
  trend: [],
  model_distribution: [],
  destination_zones: [],
  export_rows: [],
};

const chartWidth = 720;
const chartHeight = 260;
const chartPadding = 36;

const buildPolylinePoints = (values: number[]) => {
  if (values.length === 0) return '';

  const maxValue = Math.max(...values, 1);
  const usableWidth = chartWidth - chartPadding * 2;
  const usableHeight = chartHeight - chartPadding * 2;
  const xStep = values.length > 1 ? usableWidth / (values.length - 1) : usableWidth;

  return values.map((value, index) => {
    const x = chartPadding + index * xStep;
    const y = chartPadding + usableHeight - ((value / maxValue) * usableHeight);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
};

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 rounded-[28px] border border-white/10 bg-white/5 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-36 rounded-[28px] border border-white/10 bg-white/5 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.7fr] gap-6">
        <div className="h-96 rounded-[28px] border border-white/10 bg-white/5 animate-pulse" />
        <div className="h-96 rounded-[28px] border border-white/10 bg-white/5 animate-pulse" />
      </div>
    </div>
  );
}

function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
      <BarChart3 className="mb-4 h-10 w-10 text-zinc-600" />
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 max-w-md text-sm text-zinc-500">{message}</p>
    </div>
  );
}

function TrendLineChart({ data }: { data: ReportTrendPoint[] }) {
  if (data.length === 0) {
    return <EmptyPanel title="Belum ada tren" message="Belum ada order pada periode ini, jadi grafik belum dapat dibentuk." />;
  }

  const orderPoints = buildPolylinePoints(data.map((item) => item.order_count));
  const spendPoints = buildPolylinePoints(data.map((item) => item.total_spend));
  const maxSpend = Math.max(...data.map((item) => item.total_spend), 0);
  const hasSpend = maxSpend > 0;

  return (
    <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-zinc-400">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Jumlah order
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          Pengeluaran
        </span>
      </div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[300px] w-full overflow-visible" role="img" aria-label="Tren order dan pengeluaran harian">
        <defs>
          <linearGradient id="umkmSpendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = chartPadding + (line * ((chartHeight - chartPadding * 2) / 3));
          return (
            <line
              key={line}
              x1={chartPadding}
              x2={chartWidth - chartPadding}
              y1={y}
              y2={y}
              stroke="rgba(148, 163, 184, 0.18)"
              strokeDasharray="6 8"
            />
          );
        })}
        {hasSpend && (
          <polyline
            fill="none"
            points={spendPoints}
            stroke="url(#umkmSpendGradient)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          />
        )}
        <polyline
          fill="none"
          points={orderPoints}
          stroke="#009864"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {data.map((item, index) => {
          const values = data.map((point) => point.order_count);
          const maxValue = Math.max(...values, 1);
          const usableWidth = chartWidth - chartPadding * 2;
          const usableHeight = chartHeight - chartPadding * 2;
          const xStep = data.length > 1 ? usableWidth / (data.length - 1) : usableWidth;
          const x = chartPadding + index * xStep;
          const y = chartPadding + usableHeight - ((item.order_count / maxValue) * usableHeight);
          const shouldShowLabel = data.length <= 12 || index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 8) === 0;

          return (
            <g key={item.date}>
              <circle cx={x} cy={y} r="5" fill="#050505" stroke="#009864" strokeWidth="3" />
              {shouldShowLabel && (
                <text x={x} y={chartHeight - 8} textAnchor="middle" className="fill-zinc-500 text-[12px] font-semibold">
                  {item.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function UMKMReportsPage() {
  const { addNotification } = useNotificationStore();
  const [period, setPeriod] = useState<ReportPeriod>('bulan_ini');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState<UmkmReportData>(defaultReportData);
  const [loading, setLoading] = useState(true);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const hasOrders = reportData.summary.total_orders > 0;
  const maxModelCount = useMemo(
    () => Math.max(...reportData.model_distribution.map((item) => item.count), 1),
    [reportData.model_distribution],
  );
  const maxZoneCount = useMemo(
    () => Math.max(...reportData.destination_zones.map((item) => item.order_count), 1),
    [reportData.destination_zones],
  );

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { period };
      if (period === 'custom') {
        params.start_date = startDate;
        params.end_date = endDate;
      }

      const response = await api.get('/auth/web/reports/umkm', { params });
      setReportData(response.data.data || defaultReportData);
    } catch (error: any) {
      setReportData(defaultReportData);
      addNotification({
        title: 'Gagal memuat laporan',
        message: error?.response?.data?.message || 'Data laporan belum dapat diambil dari database.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [addNotification, endDate, period, startDate]);

  useEffect(() => {
    if (period === 'custom' && (!startDate || !endDate)) {
      setLoading(false);
      return;
    }

    loadReport();
  }, [loadReport, period, startDate, endDate]);

  const handleExportCsv = async () => {
    if (reportData.export_rows.length === 0) {
      addNotification({
        title: 'Tidak ada data',
        message: 'Tidak ada order pada periode ini untuk diekspor.',
        type: 'warning',
      });
      return;
    }

    setIsExportingCsv(true);
    try {
      const csvRows: CsvRow[] = reportData.export_rows.map((row) => ({
        no_order: row.no_order,
        tanggal: row.tanggal,
        penerima: row.penerima,
        tujuan: row.tujuan,
        status: row.status,
        model: row.model,
        berat_kg: row.berat_kg,
        harga: row.harga,
      }));
      downloadCsv(`laporan-umkm-${reportData.range.start_date}-${reportData.range.end_date}.csv`, csvRows);
      addNotification({
        title: 'CSV siap',
        message: 'Laporan dari database berhasil diunduh.',
        type: 'success',
      });
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
      >
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-emerald-400">
            <BarChart3 className="h-4 w-4" />
            Database Report
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">Dashboard & Laporan UMKM</h1>
          <p className="mt-2 max-w-3xl text-zinc-400">
            Semua angka di halaman ini dihitung dari order customer aktif di database. Tidak ada data simulasi.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Sync DB
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExportingCsv || loading}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
          >
            {isExportingCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            CSV
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/30 transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          >
            <FileText className="h-4 w-4" />
            PDF Report
          </button>
        </div>
      </motion.div>

      <section className="rounded-[32px] border border-white/15 bg-white/[0.03] p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-white">
              <Calendar className="h-4 w-4" />
              Pilihan Periode:
            </div>
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                  period === option.value
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/30'
                    : 'border border-white/15 text-zinc-200 hover:bg-white/10'
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPeriod('custom')}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                period === 'custom'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/30'
                  : 'border border-white/15 text-zinc-200 hover:bg-white/10'
              }`}
            >
              Custom
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPeriod('custom');
              }}
              className="rounded-full border border-white/15 bg-black/30 px-5 py-3 text-sm font-semibold text-white outline-none transition-all focus:border-emerald-500"
            />
            <span className="text-center text-sm font-bold text-zinc-500">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPeriod('custom');
              }}
              className="rounded-full border border-white/15 bg-black/30 px-5 py-3 text-sm font-semibold text-white outline-none transition-all focus:border-emerald-500"
            />
          </div>
        </div>
      </section>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              title="Total Order"
              value={formatNumber(reportData.summary.total_orders)}
              subtitle={reportData.range.start_date ? `${reportData.range.start_date} s/d ${reportData.range.end_date}` : 'Periode aktif'}
              icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
            />
            <SummaryCard
              title="Selesai"
              value={formatNumber(reportData.summary.completed_orders)}
              subtitle="Berhasil terkirim"
              icon={<CheckCircle className="h-5 w-5 text-emerald-400" />}
            />
            <SummaryCard
              title="Gagal"
              value={formatNumber(reportData.summary.failed_orders)}
              subtitle="Cancel, gagal, atau ditolak"
              icon={<XCircle className="h-5 w-5 text-red-400" />}
            />
            <SummaryCard
              title="Total Biaya"
              value={formatCurrency(reportData.summary.total_spend)}
              subtitle="Akumulasi dari order DB"
              icon={<Wallet className="h-5 w-5 text-indigo-400" />}
            />
            <SummaryCard
              title="Completion"
              value={formatPercent(reportData.summary.completion_rate)}
              subtitle="Selesai dibanding final status"
              icon={<BarChart3 className="h-5 w-5 text-emerald-400" />}
            />
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.75fr]">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[32px] border border-white/15 bg-white/[0.03] p-7"
            >
              <div className="mb-6">
                <h2 className="text-xl font-bold tracking-tight text-white">Tren Order & Pengeluaran Harian</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Rincian aktivitas harian periode {reportData.range.start_date || '-'} sampai {reportData.range.end_date || '-'}.
                </p>
              </div>
              <TrendLineChart data={reportData.trend} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[32px] border border-white/15 bg-white/[0.03] p-7"
            >
              <h2 className="text-xl font-bold tracking-tight text-white">Distribusi Model</h2>
              <p className="mt-1 text-sm text-zinc-400">Pilihan model pengiriman dari order aktual.</p>

              {reportData.model_distribution.length === 0 ? (
                <EmptyPanel title="Belum ada model" message="Distribusi model akan muncul setelah ada order pada periode ini." />
              ) : (
                <div className="mt-6 space-y-4">
                  {reportData.model_distribution.map((item, index) => (
                    <div key={item.name} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: distributionColors[index % distributionColors.length] }}
                          />
                          <p className="font-semibold text-white">{item.name}</p>
                        </div>
                        <p className="text-sm font-bold text-zinc-200">{formatNumber(item.count)} order</p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max((item.count / maxModelCount) * 100, 3)}%`,
                            backgroundColor: distributionColors[index % distributionColors.length],
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-zinc-500">{formatCurrency(item.total_spend)}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[32px] border border-white/15 bg-white/[0.03] p-7"
            >
              <h2 className="text-xl font-bold tracking-tight text-white">Top 5 Zona Tujuan</h2>
              <p className="mt-1 text-sm text-zinc-400">Wilayah paling sering menerima paket berdasarkan alamat dropoff.</p>
              {reportData.destination_zones.length === 0 ? (
                <EmptyPanel title="Belum ada zona" message="Zona tujuan akan muncul setelah ada alamat dropoff di order aktual." />
              ) : (
                <div className="mt-6 space-y-4">
                  {reportData.destination_zones.map((item) => (
                    <div key={item.zone}>
                      <div className="mb-2 flex items-center justify-between gap-4 text-sm font-semibold">
                        <span className="text-white">{item.zone}</span>
                        <span className="text-zinc-300">{formatNumber(item.order_count)} order</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                          style={{ width: `${Math.max((item.order_count / maxZoneCount) * 100, 3)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs font-semibold text-zinc-500">{formatCurrency(item.total_spend)}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[32px] border border-white/15 bg-white/[0.03] p-7"
            >
              <h2 className="text-xl font-bold tracking-tight text-white">Rata-rata & Performa</h2>
              <p className="mt-1 text-sm text-zinc-400">Metrik operasional dari order yang tersimpan di database.</p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MetricTile title="AVG Berat" value={`${reportData.summary.avg_weight.toFixed(2)} kg`} />
                <MetricTile title="AVG Ongkos" value={formatCurrency(reportData.summary.avg_cost)} />
                <MetricTile title="On-Time Rate" value={formatPercent(reportData.summary.on_time_rate)} />
                <MetricTile title="Export Row" value={formatNumber(reportData.export_rows.length)} />
              </div>
              {!hasOrders && (
                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm font-semibold text-amber-200">
                  Belum ada order pada periode ini. Laporan tetap kosong agar tidak menampilkan data simulasi.
                </div>
              )}
            </motion.div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-white/15 bg-white/[0.03] p-6 transition-all duration-200 hover:bg-white/[0.05]"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">{title}</p>
        <div className="rounded-2xl bg-white/5 p-2">{icon}</div>
      </div>
      <p className="break-words text-3xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-3 text-sm font-semibold text-zinc-500">{subtitle}</p>
    </motion.div>
  );
}

function MetricTile({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-black/20 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight text-white">{value}</p>
    </div>
  );
}
