'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  TrendingUp, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  CreditCard, 
  Award, 
  Plus, 
  Layers, 
  ChevronRight, 
  MapPin, 
  RefreshCcw, 
  Calendar, 
  Eye, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { api } from '@/lib/api';
import Link from 'next/link';

interface Order {
  id: string;
  order_number: string;
  pickup_address: string;
  dropoff_address: string;
  recipient_name: string;
  model: string;
  status: string;
  distance_km: number;
  total_price_idr: number;
  created_at: string;
}

interface DashboardStats {
  active_orders: number;
  completed_orders_month: number;
  cancelled_orders_month: number;
  total_spend_month: number;
  previous_spend_month: number;
  spend_growth_percent: number;
  weekly_activity: Array<{ label: string; count: number; value: number }>;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'count' | 'value'>('count');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);

  // Load only real customer orders. Empty/error states should stay honest.
  const fetchOrders = async () => {
    try {
      const res = await api.get('/auth/web/orders?limit=5');
      if (res.data && res.data.success) {
        setOrders(res.data.orders || []);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await api.get('/auth/web/dashboard/stats');
      if (res.data?.success) {
        setDashboardStats(res.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch customer dashboard stats:', error);
      setDashboardStats(null);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchDashboardStats();

    const interval = setInterval(() => {
      fetchOrders();
      fetchDashboardStats();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Format currency
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Calculate statistics
  const activeOrdersCount = dashboardStats?.active_orders ?? orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'delivered').length;
  const completedOrdersCount = dashboardStats?.completed_orders_month ?? orders.filter((o) => o.status === 'completed' || o.status === 'delivered').length;
  const totalSpend = dashboardStats?.total_spend_month ?? orders.reduce((sum, order) => sum + Number(order.total_price_idr || 0), 0);

  // SVG-based custom premium Bar Chart Data
  const chartData = dashboardStats?.weekly_activity?.length ? dashboardStats.weekly_activity : [
    { label: 'W1', count: 0, value: 0 },
    { label: 'W2', count: 0, value: 0 },
    { label: 'W3', count: 0, value: 0 },
    { label: 'W4', count: 0, value: 0 },
  ];

  // Max value calculation for custom SVG heights
  const maxCountValue = Math.max(...chartData.map((d) => d.count)) || 1;
  const maxAmountValue = Math.max(...chartData.map((d) => d.value)) || 1;

  const toggleRow = (id: string) => {
    if (expandedOrderId === id) {
      setExpandedOrderId(null);
    } else {
      setExpandedOrderId(id);
    }
  };

  // Render skeletons while loading
  if (loading) {
    return (
      <div className="space-y-8 select-none">
        <div className="flex flex-col gap-2">
          <div className="h-9 bg-muted/60 rounded-xl w-64 animate-pulse" />
          <div className="h-5 bg-muted/60 rounded-lg w-48 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted/40 border border-border/40 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 h-[420px] bg-muted/40 border border-border/40 rounded-2xl animate-pulse" />
          <div className="h-[420px] bg-muted/40 border border-border/40 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 select-none">
      {/* Header section with fast actions */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {user?.name || 'Customer'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pantau pengiriman paketmu secara real-time dan akurat.
          </p>
        </div>

        {/* Action Shortcuts */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/orders/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium text-sm rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-primary/20 cursor-pointer select-none"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Kirim Sekarang
          </Link>
          <Link
            href="/orders/bulk"
            className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border/40 text-foreground hover:bg-muted font-medium text-sm rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm select-none"
          >
            <Layers className="h-4 w-4 shrink-0" />
            Kirim Massal
          </Link>
        </div>
      </motion.div>

      {/* Promo banner */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="p-5 bg-gradient-to-r from-primary/20 via-primary/5 to-transparent border border-primary/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
      >
        <div>
          <h4 className="text-sm font-bold text-primary flex items-center gap-1.5 select-none">
            <Award className="h-4 w-4 shrink-0" /> Promo Bulan Ini
          </h4>
          <p className="text-xs text-muted-foreground mt-1 select-none">
            Gunakan voucher <strong className="text-foreground">LANCARNEW</strong> untuk diskon ongkir <strong className="text-foreground">15%</strong> khusus pengiriman Instant.
          </p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline shrink-0 select-none cursor-pointer"
        >
          Klaim Voucher <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </Link>
      </motion.div>

      {/* Widget Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Orders */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="p-5 glass-card rounded-2xl flex flex-col justify-between h-36 relative overflow-hidden group transition-all duration-300"
        >
          <div className="flex items-start justify-between z-10">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Order Aktif</p>
              <h3 className="text-2xl font-extrabold text-foreground mt-2">{activeOrdersCount}</h3>
            </div>
            <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary group-hover:scale-105 transition-all">
              <Package className="h-5 w-5 shrink-0" />
            </div>
          </div>
          <div className="text-xs font-medium text-emerald-500 mt-2 z-10">
            Sedang diproses / dikirim
          </div>
        </motion.div>

        {/* Completed this month */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="p-5 glass-card rounded-2xl flex flex-col justify-between h-36 relative overflow-hidden group transition-all duration-300"
        >
          <div className="flex items-start justify-between z-10">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Selesai Bulan Ini</p>
              <h3 className="text-2xl font-extrabold text-foreground mt-2">{completedOrdersCount}</h3>
            </div>
            <div className="h-10 w-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 group-hover:scale-105 transition-all">
              <CheckCircle className="h-5 w-5 shrink-0" />
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2 z-10">
            {dashboardStats ? `${dashboardStats.spend_growth_percent >= 0 ? '+' : ''}${dashboardStats.spend_growth_percent}% belanja vs bulan lalu` : 'Menunggu data bulan berjalan'}
          </div>
        </motion.div>

        {/* Total Spend */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="p-5 glass-card rounded-2xl flex flex-col justify-between h-36 relative overflow-hidden group transition-all duration-300"
        >
          <div className="flex items-start justify-between z-10">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Belanja</p>
              <h3 className="text-xl font-extrabold text-foreground mt-2 truncate">
                {formatIDR(totalSpend)}
              </h3>
            </div>
            <div className="h-10 w-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 group-hover:scale-105 transition-all">
              <CreditCard className="h-5 w-5 shrink-0" />
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2 z-10">
            Akumulasi bulan berjalan
          </div>
        </motion.div>

        {/* Loyalty Tier Progress */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="p-5 glass-card rounded-2xl flex flex-col justify-between h-36 relative overflow-hidden group transition-all duration-300"
        >
          <div className="flex items-start justify-between z-10">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Loyalty Tier</p>
              <h3 className="text-xl font-extrabold text-primary mt-2">Gold Member</h3>
            </div>
            <div className="h-10 w-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500 group-hover:scale-105 transition-all">
              <Award className="h-5 w-5 shrink-0" />
            </div>
          </div>
          <div className="z-10 mt-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1 select-none">
              <span>Next: Platinum</span>
              <span>75%</span>
            </div>
            <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden select-none">
              <div className="h-full w-[75%] bg-primary rounded-full transition-all duration-300 select-none" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Analytics Graph & Order List Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Custom pure SVG SVG Chart Component */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="lg:col-span-2 glass-card rounded-2xl p-6 flex flex-col justify-between min-h-[400px]"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-base font-bold text-foreground">Aktivitas Kirim 30 Hari</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Rincian mingguan perbandingan total order.</p>
            </div>

            {/* Toggle count vs value */}
            <div className="flex bg-muted/60 p-1 rounded-xl border border-border/40 self-start sm:self-center select-none shrink-0">
              <button
                onClick={() => setChartMode('count')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                  chartMode === 'count' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Order Count
              </button>
              <button
                onClick={() => setChartMode('value')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                  chartMode === 'value' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Order Value (Rp)
              </button>
            </div>
          </div>

          {/* SVG Custom interactive Bar Chart */}
          <div className="flex-1 w-full flex items-end justify-between px-4 pb-4 select-none min-h-[220px]">
            {chartData.map((d) => {
              const heightPercentage = chartMode === 'count' 
                ? (d.count / maxCountValue) * 100 
                : (d.value / maxAmountValue) * 100;
              return (
                <div key={d.label} className="flex flex-col items-center gap-3 w-1/5 group select-none relative">
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-2 bg-card border border-border/40 px-2 py-1 rounded-lg shadow-xl text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 font-mono whitespace-nowrap">
                    {chartMode === 'count' ? `${d.count} Orders` : formatIDR(d.value)}
                  </div>
                  <div className="w-12 bg-muted/30 hover:bg-muted/50 rounded-xl h-[180px] flex items-end overflow-hidden transition-all duration-300 border border-border/10 select-none">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${heightPercentage}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="w-full bg-gradient-to-t from-primary/80 to-primary rounded-t-xl group-hover:brightness-110 transition-all select-none"
                    />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground select-none">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Live Active Order List with Inline tracking */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-4 mb-4 select-none">
            <div>
              <h3 className="text-base font-bold text-foreground">Order Aktif Terbaru</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Real-time update 30s.</p>
            </div>
            <Link
              href="/orders"
              className="text-xs font-medium text-primary hover:underline select-none cursor-pointer shrink-0"
            >
              Lihat Semua
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="p-3.5 glass-card rounded-xl hover:bg-white/10 dark:hover:bg-white/10 transition-all flex flex-col gap-2 select-none"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-foreground font-mono truncate">
                      {order.order_number}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {order.recipient_name} • {order.model.toUpperCase()}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleRow(order.id)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer select-none"
                    title={expandedOrderId === order.id ? 'Collapse' : 'Expand Details'}
                  >
                    {expandedOrderId === order.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between border-t border-border/40 pt-2 select-none">
                  <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full capitalize font-semibold shadow-sm select-none">
                    {order.status.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-muted-foreground select-none">
                    {order.distance_km} km • {formatIDR(order.total_price_idr)}
                  </span>
                </div>

                <AnimatePresence>
                  {expandedOrderId === order.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-border/40 pt-3 mt-1 flex flex-col gap-2"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2 select-none">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground select-none">Pickup Address</p>
                            <p className="text-[11px] text-foreground leading-relaxed truncate">{order.pickup_address}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 select-none">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground select-none">Dropoff Address</p>
                            <p className="text-[11px] text-foreground leading-relaxed truncate">{order.dropoff_address}</p>
                          </div>
                        </div>
                      </div>

                      <div className="h-20 w-full bg-muted/40 rounded-xl border border-border/40 flex items-center justify-center text-[10px] text-muted-foreground mt-1 select-none flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <RefreshCcw className="h-3 w-3 text-primary" />
                          <span>Status terakhir: {order.status.replace('_', ' ')}</span>
                        </div>
                        <Link href={`/orders/${order.id}`} className="font-semibold text-primary hover:underline">
                          Buka tracking real-time
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {orders.length === 0 && (
              <div className="text-center p-6 select-none">
                <p className="text-xs text-muted-foreground">Tidak ada order aktif.</p>
              </div>
            )}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
