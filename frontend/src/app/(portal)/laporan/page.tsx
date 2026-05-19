'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadCsv } from '@/lib/csv';
import { useNotificationStore } from '@/store/useNotificationStore';
import { 
  BarChart3, 
  Calendar, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Loader2, 
  Lock, 
  Sparkles, 
  TrendingUp, 
  Wallet, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ChevronRight, 
  Filter,
  RefreshCw 
} from 'lucide-react';

// Data shapes for our components
interface OrderSummary {
  totalOrders: number;
  completed: number;
  failed: number;
  totalSpend: number;
  onTimeRate: number;
  avgWeight: number;
  avgCost: number;
}

interface ChartPoint {
  day: number;
  orders: number;
  spend: number;
}

export default function LaporanPage() {
  const { addNotification } = useNotificationStore();

  // Premium / Upgrade Simulation Toggle
  const [isPremium, setIsPremium] = useState(false);

  // Filter conditions & state
  const [period, setPeriod] = useState<string>('bulan_ini');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Loaded report data state
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<OrderSummary>({
    totalOrders: 0,
    completed: 0,
    failed: 0,
    totalSpend: 0,
    onTimeRate: 0,
    avgWeight: 0,
    avgCost: 0,
  });

  const [trendData, setTrendData] = useState<ChartPoint[]>([]);
  const [modelDistribution, setModelDistribution] = useState<{ name: string; value: number }[]>([]);
  const [destinationZones, setDestinationZones] = useState<{ zone: string; orders: number }[]>([]);

  // Action / Generation loading states
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Set default initial data
  useEffect(() => {
    // Check if premium mode or simulate data
    const savedPremium = localStorage.getItem('lancar_umkm_premium');
    if (savedPremium === 'true') {
      setIsPremium(true);
    }
    loadData();
  }, [period, isPremium]);

  const togglePremiumMode = (val: boolean) => {
    setIsPremium(val);
    localStorage.setItem('lancar_umkm_premium', String(val));
    addNotification({
      title: val ? 'Premium Aktif' : 'Status Reset',
      message: val ? 'Selamat! Mode Premium UMKM berhasil diaktifkan.' : 'Mode UMKM dinonaktifkan.',
      type: val ? 'success' : 'info',
    });
  };

  const loadData = () => {
    setLoading(true);

    // Dynamic data generator simulating full backend response based on period
    setTimeout(() => {
      let multiplier = 1;
      if (period === 'bulan_lalu') multiplier = 1.15;
      if (period === 'Q1') multiplier = 2.8;
      if (period === 'Q2') multiplier = 3.2;
      if (period === 'Q3') multiplier = 3.5;
      if (period === 'Q4') multiplier = 4.1;

      const baseOrders = Math.round(48 * multiplier);
      const baseSpend = Math.round(7200000 * multiplier);

      setSummary({
        totalOrders: baseOrders,
        completed: Math.round(baseOrders * 0.94),
        failed: Math.round(baseOrders * 0.06),
        totalSpend: baseSpend,
        onTimeRate: 98.4,
        avgWeight: 2.35,
        avgCost: Math.round(baseSpend / baseOrders),
      });

      // Daily Trend Data Generation for Premium Charting
      const dailyPoints: ChartPoint[] = [];
      const days = period.startsWith('Q') ? 90 : 30;
      for (let i = 1; i <= days; i++) {
        if (days === 90 && i % 3 !== 0) continue; // Sample days for longer periods
        dailyPoints.push({
          day: i,
          orders: Math.round(2 + Math.sin(i * 0.4) * 1.5 + multiplier * 0.5),
          spend: Math.round(300000 + Math.sin(i * 0.4) * 120000 * multiplier),
        });
      }
      setTrendData(dailyPoints);

      // Model distribution breakdown
      setModelDistribution([
        { name: 'P2P (Same Day)', value: Math.round(baseOrders * 0.65) },
        { name: '2-Kaki (Next Day)', value: Math.round(baseOrders * 0.35) },
      ]);

      // Destination zones breakdown
      setDestinationZones([
        { zone: 'Jabodetabek', orders: Math.round(baseOrders * 0.45) },
        { zone: 'Jawa Barat', orders: Math.round(baseOrders * 0.22) },
        { zone: 'Jawa Tengah', orders: Math.round(baseOrders * 0.15) },
        { zone: 'Jawa Timur', orders: Math.round(baseOrders * 0.11) },
        { zone: 'Luar Jawa', orders: Math.round(baseOrders * 0.07) },
      ]);

      setLoading(false);
    }, 450);
  };

  const handleExportCsv = () => {
    setIsExportingExcel(true);
    setTimeout(() => {
      try {
        const orderRows = [
          {
            'No Resi': 'LCR-2026-0001',
            'Tanggal': '2026-05-01',
            'Penerima': 'Siska Amalia',
            'Alamat': 'Jl. Kebagusan Dalam No. 12, Jakarta Selatan',
            'Berat (kg)': 1.5,
            'Model': 'P2P',
            'Harga (Rp)': 15000,
            'Status': 'DELIVERED',
          },
          {
            'No Resi': 'LCR-2026-0002',
            'Tanggal': '2026-05-02',
            'Penerima': 'Budi Santoso',
            'Alamat': 'Jl. Braga No. 89, Bandung',
            'Berat (kg)': 3.0,
            'Model': '2-Kaki',
            'Harga (Rp)': 45000,
            'Status': 'DELIVERED',
          },
          {
            'No Resi': 'LCR-2026-0003',
            'Tanggal': '2026-05-03',
            'Penerima': 'Doni Haris',
            'Alamat': 'Jl. Ahmad Yani No. 100, Surabaya',
            'Berat (kg)': 2.5,
            'Model': 'P2P',
            'Harga (Rp)': 25000,
            'Status': 'DELIVERED',
          },
        ];

        downloadCsv(`Laporan_UMKM_${period.toUpperCase()}_LANCAR.csv`, orderRows);
        addNotification({ title: 'Sukses Export', message: 'Laporan CSV berhasil diunduh.', type: 'success' });
      } catch (err) {
        console.error('Failed to export report CSV:', err);
        addNotification({ title: 'Gagal', message: 'Gagal mengunduh laporan CSV.', type: 'error' });
      } finally {
        setIsExportingExcel(false);
      }
    }, 600);
  };

  // Simulated server PDF print trigger (Puppeteer)
  const handleExportPDF = () => {
    setIsExportingPDF(true);
    setTimeout(() => {
      setIsExportingPDF(false);
      addNotification({
        title: 'Sukses Cetak PDF',
        message: 'Laporan PDF performa UMKM berhasil diunduh.',
        type: 'success',
      });
    }, 2200);
  };

  // Conditional Upgrade/Notice view for non-premium customers (<10 orders)
  if (!isPremium) {
    return (
      <div className="space-y-6 select-none max-w-4xl mx-auto py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border/40 p-8 rounded-2xl text-center space-y-6 shadow-sm select-none relative overflow-hidden"
        >
          {/* Accent decoration background */}
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-transparent pointer-events-none" />

          <div className="mx-auto h-16 w-16 bg-primary/10 border border-primary/20 flex items-center justify-center rounded-2xl select-none mb-4">
            <Lock className="h-7 w-7 text-primary" />
          </div>

          <div className="max-w-md mx-auto space-y-2 select-none">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2 select-none">
              Fitur Laporan UMKM Terkunci
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed select-none">
              Dashboard laporan mendalam dan analisis performa UMKM hanya tersedia untuk pelanggan yang melakukan lebih dari 10 pengiriman per bulan.
            </p>
          </div>

          {/* Simulated Premium activation or Unlock activator */}
          <div className="p-4 bg-muted/40 border border-border/40 rounded-xl max-w-sm mx-auto space-y-3 select-none">
            <span className="text-xs font-bold text-foreground block select-none">
              Ingin mengevaluasi Laporan UMKM sekarang?
            </span>
            <button
              onClick={() => togglePremiumMode(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
            >
              <Sparkles className="h-4 w-4" /> Aktifkan Mode Premium UMKM
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none">
      {/* Upper header section */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6 select-none"
      >
        <div>
          <div className="flex items-center gap-2 select-none">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Dashboard & Laporan UMKM
            </h1>
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 font-bold px-2 py-0.5 rounded-full select-none flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> PREMIUM
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 select-none">
            Pantau dan analisis perkembangan metrik pengiriman dan biaya bisnis Anda secara terpusat.
          </p>
        </div>

        {/* Top-right Actions & Tools */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => togglePremiumMode(false)}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border/40 hover:bg-muted text-muted-foreground text-xs font-semibold rounded-xl transition-all cursor-pointer select-none"
          >
            Matikan Premium
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isExportingExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border/40 hover:bg-muted text-foreground font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm select-none"
          >
            {isExportingExcel ? (
              <Loader2 className="h-4 w-4 animate-spin select-none" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 select-none" />
            )}
            CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
          >
            {isExportingPDF ? (
              <Loader2 className="h-4 w-4 animate-spin select-none" />
            ) : (
              <FileText className="h-4 w-4 select-none" />
            )}
            PDF Report
          </button>
        </div>
      </motion.div>

      {/* Period Selector Panel */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 border bg-card/60 border-border/40 rounded-2xl flex flex-wrap items-center justify-between gap-4 select-none shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2 select-none">
          <Calendar className="h-4 w-4 text-muted-foreground hidden md:block select-none" />
          <span className="text-xs font-bold text-muted-foreground select-none pr-1">Pilihan Periode:</span>
          {[
            { id: 'bulan_ini', label: 'Bulan Ini' },
            { id: 'bulan_lalu', label: 'Bulan Lalu' },
            { id: 'Q1', label: 'Q1' },
            { id: 'Q2', label: 'Q2' },
            { id: 'Q3', label: 'Q3' },
            { id: 'Q4', label: 'Q4' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setPeriod(item.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all select-none cursor-pointer ${
                period === item.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground border border-border/40'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Custom date range inputs */}
        <div className="flex items-center gap-2 select-none">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPeriod('custom');
            }}
            className="bg-muted/40 border border-border/40 px-3 py-1.5 rounded-xl text-xs font-semibold focus:outline-none focus:border-primary/60 select-none cursor-pointer"
          />
          <span className="text-muted-foreground text-xs select-none">s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPeriod('custom');
            }}
            className="bg-muted/40 border border-border/40 px-3 py-1.5 rounded-xl text-xs font-semibold focus:outline-none focus:border-primary/60 select-none cursor-pointer"
          />
        </div>
      </motion.div>

      {/* High-fidelity responsive Summary Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 select-none">
        <div className="p-4 border border-border/40 bg-card/40 backdrop-blur-md rounded-2xl space-y-3 shadow-sm select-none">
          <div className="flex justify-between items-center select-none">
            <span className="text-[11px] font-bold text-muted-foreground select-none uppercase">Total Order</span>
            <TrendingUp className="h-4 w-4 text-primary select-none" />
          </div>
          <p className="text-2xl font-bold text-foreground select-none">
            {summary.totalOrders}
          </p>
          <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full select-none">
            +14% vs last period
          </span>
        </div>

        <div className="p-4 border border-border/40 bg-card/40 backdrop-blur-md rounded-2xl space-y-3 shadow-sm select-none">
          <div className="flex justify-between items-center select-none">
            <span className="text-[11px] font-bold text-muted-foreground select-none uppercase">Selesai</span>
            <CheckCircle className="h-4 w-4 text-emerald-500 select-none" />
          </div>
          <p className="text-2xl font-bold text-foreground select-none">
            {summary.completed}
          </p>
          <span className="text-[10px] font-semibold text-muted-foreground select-none">
            Berhasil terkirim
          </span>
        </div>

        <div className="p-4 border border-border/40 bg-card/40 backdrop-blur-md rounded-2xl space-y-3 shadow-sm select-none">
          <div className="flex justify-between items-center select-none">
            <span className="text-[11px] font-bold text-muted-foreground select-none uppercase">Gagal</span>
            <XCircle className="h-4 w-4 text-destructive select-none" />
          </div>
          <p className="text-2xl font-bold text-foreground select-none">
            {summary.failed}
          </p>
          <span className="text-[10px] font-semibold text-muted-foreground select-none">
            Retur/Kendala
          </span>
        </div>

        <div className="p-4 border border-border/40 bg-card/40 backdrop-blur-md rounded-2xl space-y-3 shadow-sm select-none">
          <div className="flex justify-between items-center select-none">
            <span className="text-[11px] font-bold text-muted-foreground select-none uppercase">Total Biaya</span>
            <Wallet className="h-4 w-4 text-indigo-500 select-none" />
          </div>
          <p className="text-2xl font-bold text-foreground select-none">
            Rp{summary.totalSpend.toLocaleString('id-ID')}
          </p>
          <span className="text-[10px] font-semibold text-muted-foreground select-none">
            Akumulasi pengeluaran
          </span>
        </div>

        <div className="p-4 border border-border/40 bg-card/40 backdrop-blur-md rounded-2xl space-y-3 shadow-sm select-none">
          <div className="flex justify-between items-center select-none">
            <span className="text-[11px] font-bold text-muted-foreground select-none uppercase">On-Time Rate</span>
            <Clock className="h-4 w-4 text-primary select-none" />
          </div>
          <p className="text-2xl font-bold text-foreground select-none">
            {summary.onTimeRate}%
          </p>
          <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full select-none">
            Tinggi • On Time
          </span>
        </div>
      </div>

      {/* Main Analysis and Premium Custom Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 select-none">
        {/* Customized interactive SVG Line Chart: Tren Order & Pengeluaran */}
        <div className="lg:col-span-2 border border-border/40 bg-card/60 backdrop-blur-md rounded-2xl p-6 space-y-5 shadow-sm select-none min-h-[360px]">
          <div className="flex justify-between items-center select-none">
            <div>
              <h3 className="text-sm font-bold text-foreground select-none">Tren Order & Pengeluaran Harian</h3>
              <p className="text-xs text-muted-foreground select-none">Rincian aktivitas harian periode {period.toUpperCase()}</p>
            </div>
          </div>

          {/* SVG Line chart visualization canvas */}
          <div className="relative h-60 w-full select-none">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs select-none">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Memuat chart...
              </div>
            ) : trendData.length > 0 ? (
              <svg className="w-full h-full select-none">
                {/* Horizontal guide lines */}
                {[0, 1, 2, 3].map((g, idx) => (
                  <line
                    key={idx}
                    x1="0%"
                    y1={`${idx * 30 + 5}%`}
                    x2="100%"
                    y2={`${idx * 30 + 5}%`}
                    className="stroke-muted/40 stroke-1 stroke-dasharray-[4,4] select-none"
                  />
                ))}

                {/* Draw active line matching orders count */}
                <path
                  d={trendData.reduce((acc, point, index) => {
                    const x = (index / (trendData.length - 1)) * 100;
                    const maxOrders = Math.max(...trendData.map((d) => d.orders)) || 1;
                    const y = 90 - (point.orders / maxOrders) * 80;
                    return acc + `${index === 0 ? 'M' : 'L'} ${x}% ${y}%`;
                  }, '')}
                  fill="none"
                  className="stroke-primary stroke-2 transition-all select-none"
                />

                {/* Draw points & interactions for order days */}
                {trendData.map((point, index) => {
                  const x = (index / (trendData.length - 1)) * 100;
                  const maxOrders = Math.max(...trendData.map((d) => d.orders)) || 1;
                  const y = 90 - (point.orders / maxOrders) * 80;
                  return (
                    <circle
                      key={index}
                      cx={`${x}%`}
                      cy={`${y}%`}
                      r="4"
                      className="fill-card stroke-primary stroke-2 transition-all hover:scale-125 select-none cursor-pointer"
                    >
                      <title>{`Hari ${point.day}: ${point.orders} Order • Rp${point.spend.toLocaleString('id-ID')}`}</title>
                    </circle>
                  );
                })}
              </svg>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs select-none">
                Belum ada data trend harian.
              </div>
            )}
          </div>
        </div>

        {/* Donut Chart: Distribusi Model Pengiriman */}
        <div className="border border-border/40 bg-card/60 backdrop-blur-md rounded-2xl p-6 space-y-4 shadow-sm select-none min-h-[360px] flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground select-none">Distribusi Model</h3>
            <p className="text-xs text-muted-foreground select-none">Pilihan kurir / model pengiriman</p>
          </div>

          {/* Canvas SVG Donut */}
          <div className="flex flex-col items-center justify-center space-y-4 flex-1 select-none">
            <svg className="w-32 h-32 transform -rotate-90 select-none">
              {/* Outer stroke radius circle segmenting models */}
              <circle
                cx="64"
                cy="64"
                r="48"
                className="stroke-primary stroke-[16] fill-none select-none"
                strokeDasharray={`${modelDistribution[0]?.value * 4 || 190} 301`}
              />
              <circle
                cx="64"
                cy="64"
                r="48"
                className="stroke-indigo-500 stroke-[16] fill-none select-none"
                strokeDasharray={`${modelDistribution[1]?.value * 4 || 111} 301`}
                strokeDashoffset={`-${modelDistribution[0]?.value * 4 || 190}`}
              />
            </svg>

            {/* Premium Legend & details */}
            <div className="w-full grid grid-cols-2 gap-2 select-none">
              {modelDistribution.map((model, idx) => (
                <div key={idx} className="bg-muted/40 border border-border/40 p-2.5 rounded-xl space-y-1 select-none">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground select-none">
                    <span className={`h-2.5 w-2.5 rounded-full select-none ${idx === 0 ? 'bg-primary' : 'bg-indigo-500'}`} />
                    {model.name}
                  </span>
                  <span className="text-xs text-muted-foreground block pl-4 font-bold select-none">
                    {model.value} Order
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Extra Detail Stats & Top Destinations Bar Graph */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none">
        {/* Custom horizontal stacked bar chart: Top 5 Destinations */}
        <div className="p-6 border border-border/40 bg-card/40 backdrop-blur-md rounded-2xl space-y-5 shadow-sm select-none">
          <div>
            <h3 className="text-sm font-bold text-foreground select-none">Top 5 Zona Tujuan</h3>
            <p className="text-xs text-muted-foreground select-none">Wilayah paling sering menerima paket</p>
          </div>

          <div className="space-y-3.5 select-none">
            {destinationZones.map((zone, idx) => {
              const maxOrders = Math.max(...destinationZones.map((z) => z.orders)) || 1;
              const barWidth = `${Math.round((zone.orders / maxOrders) * 100)}%`;
              return (
                <div key={idx} className="space-y-1 select-none">
                  <div className="flex justify-between text-xs font-semibold text-foreground select-none">
                    <span>{zone.zone}</span>
                    <span className="font-bold">{zone.orders} Order</span>
                  </div>
                  <div className="w-full bg-muted/40 h-2 rounded-full overflow-hidden select-none">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-300 select-none"
                      style={{ width: barWidth }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Averages & performance KPI card metrics */}
        <div className="p-6 border border-border/40 bg-card/40 backdrop-blur-md rounded-2xl space-y-4 shadow-sm select-none flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground select-none">Rata-rata & Performa</h3>
            <p className="text-xs text-muted-foreground select-none">Metrik operasional pengiriman bisnis UMKM</p>
          </div>

          <div className="grid grid-cols-2 gap-4 select-none">
            <div className="p-4 bg-muted/40 border border-border/40 rounded-2xl space-y-1.5 select-none">
              <span className="text-[10px] font-bold text-muted-foreground select-none uppercase block">Avg Berat</span>
              <p className="text-xl font-bold text-foreground select-none">{summary.avgWeight} kg</p>
              <p className="text-[10px] text-muted-foreground select-none">Berat rata-rata paket</p>
            </div>

            <div className="p-4 bg-muted/40 border border-border/40 rounded-2xl space-y-1.5 select-none">
              <span className="text-[10px] font-bold text-muted-foreground select-none uppercase block">Avg Ongkos</span>
              <p className="text-xl font-bold text-foreground select-none">Rp{summary.avgCost.toLocaleString('id-ID')}</p>
              <p className="text-[10px] text-muted-foreground select-none">Ongkir rata-rata per order</p>
            </div>
          </div>

          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 select-none">
            <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 select-none" />
            <p className="text-xs font-semibold text-emerald-500 leading-relaxed select-none">
              Bisnis Anda memiliki tingkat on-time pengiriman sangat baik sebesar <strong className="font-bold">{summary.onTimeRate}%</strong>. Pertahankan SLA untuk loyalitas pelanggan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
