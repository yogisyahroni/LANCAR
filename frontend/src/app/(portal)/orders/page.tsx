'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { clientLog } from '@/lib/clientLogger';
import Link from 'next/link';
import { useNotificationStore } from '@/store/useNotificationStore';
import { downloadCsv, type CsvRow } from '@/lib/csv';
import { Search, Filter, Calendar, Download, Eye, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { CustomerPageSkeleton } from '@/components/ui/Skeleton';
import { OrderPriceBreakdown } from '@/components/orders/OrderPriceBreakdown';
import { OrderServiceBadge } from '@/components/orders/OrderServiceBadge';
import { AsyncRecoveryState } from '@/components/ui/AsyncRecoveryState';

interface Order {
  id: string;
  order_number: string;
  pickup_address: string;
  dropoff_address: string;
  recipient_name: string;
  model: string;
  service_code?: string | null;
  service_snapshot?: {
    name?: string | null;
    service_name?: string | null;
    category?: string | null;
    service_category?: string | null;
  } | null;
  logistics_provider?: string | null;
  logistics_service_type?: string | null;
  payment_status?: string | null;
  status: string;
  distance_km: number;
  total_price_idr: number;
  created_at: string;
  awb_number?: string;
}

function OrderListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addNotification } = useNotificationStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  // Pagination & Filter state from URL
  const searchParam = searchParams.get('search') || '';
  const statusParam = searchParams.get('status') || 'all';
  const modelParam = searchParams.get('model') || 'all';
  const pageParam = parseInt(searchParams.get('page') || '1');
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';

  const [search, setSearch] = useState(searchParam);
  const [status, setStatus] = useState(statusParam);
  const [model, setModel] = useState(modelParam);
  const [startDate, setStartDate] = useState(startDateParam);
  const [endDate, setEndDate] = useState(endDateParam);

  const pageSize = 10;

  // Sync state with URL changes
  useEffect(() => {
    setSearch(searchParam);
    setStatus(statusParam);
    setModel(modelParam);
    setStartDate(startDateParam);
    setEndDate(endDateParam);
  }, [searchParam, statusParam, modelParam, startDateParam, endDateParam]);

  const fetchOrders = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (searchParam) params.append('search', searchParam);
      if (statusParam && statusParam !== 'all') params.append('status', statusParam);
      if (modelParam && modelParam !== 'all') params.append('model', modelParam);
      if (startDateParam) params.append('startDate', startDateParam);
      if (endDateParam) params.append('endDate', endDateParam);
      params.append('limit', String(pageSize));
      params.append('offset', String((pageParam - 1) * pageSize));

      const res = await api.get(`/auth/web/orders?${params.toString()}`);
      if (res.data && res.data.success) {
        setOrders(res.data.orders);
      } else {
        throw new Error('Customer orders response was not successful');
      }
    } catch (error: any) {
      clientLog.error('Failed to fetch customer orders', { error });
      setLoadError('Daftar order belum dapat dimuat dari server. Data yang tampil tidak diisi dengan data contoh.');
      addNotification({ title: 'Gagal', message: 'Gagal mengambil data order.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [searchParam, statusParam, modelParam, startDateParam, endDateParam, pageParam]);

  const updateFilters = (newFilters: { [key: string]: string | number }) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value === '' || value === 'all') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    // Reset page to 1 when filters change
    if (!('page' in newFilters)) {
      params.delete('page');
    }
    router.push(`/orders?${params.toString()}`);
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      updateFilters({ search });
    }
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map((o) => o.id));
    }
  };

  const toggleSelectOrder = (id: string) => {
    if (selectedOrders.includes(id)) {
      setSelectedOrders(selectedOrders.filter((oid) => oid !== id));
    } else {
      setSelectedOrders([...selectedOrders, id]);
    }
  };

  const handleBulkDownloadResi = () => {
    if (selectedOrders.length === 0) return;
    const selectedRows = orders.filter((order) => selectedOrders.includes(order.id));
    if (selectedRows.length === 0) return;

    const csvRows: CsvRow[] = selectedRows.map((order) => ({
      'No Order': order.order_number,
      Penerima: order.recipient_name,
      Tujuan: order.dropoff_address,
      Status: order.status,
      Model: order.model || '',
      'Jarak (km)': Number(order.distance_km || 0),
      'Harga (Rp)': Number(order.total_price_idr || 0),
      Tanggal: formatDate(order.created_at),
    }));

    downloadCsv(`resi-terpilih-${new Date().toISOString().slice(0, 10)}.csv`, csvRows, [
      'No Order',
      'Penerima',
      'Tujuan',
      'Status',
      'Model',
      'Jarak (km)',
      'Harga (Rp)',
      'Tanggal',
    ]);
    addNotification({ title: 'Selesai', message: `${selectedRows.length} resi diunduh dari data order.`, type: 'success' });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const getStatusBadgeClass = (statusStr: string) => {
    switch (statusStr?.toLowerCase()) {
      case 'created':
      case 'pending':
      case 'pending_payment':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'picked_up':
      case 'in_transit':
      case 'delivering':
        return 'bg-info/10 text-info border-info/20 animate-pulse';
      case 'completed':
      case 'delivered':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'cancelled':
      case 'payment_failed':
      case 'expired':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
            Riwayat Order Anda
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Kelola, filter, dan unduh resi order logistik Anda dalam satu tampilan dashboard premium.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/orders/new"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            + Buat Order Baru
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-muted/60 p-1 rounded-xl border border-border/40 select-none w-fit">
        <button
          role="tab"
          aria-selected={model === 'all'}
          onClick={() => updateFilters({ model: 'all', page: 1 })}
          className={`px-6 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
            model === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Semua
        </button>
        <button
          role="tab"
          aria-selected={model === 'p2p'}
          onClick={() => updateFilters({ model: 'p2p', page: 1 })}
          className={`px-6 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
            model === 'p2p' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          🚀 Instan
        </button>
        <button
          role="tab"
          aria-selected={model === 'hub_and_spoke'}
          onClick={() => updateFilters({ model: 'hub_and_spoke', page: 1 })}
          className={`px-6 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
            model === 'hub_and_spoke' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          📦 Ekspedisi
        </button>
      </div>

      {/* Filter & Search Panel */}
      <div className="p-6 bg-card/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search bar */}
          <div className="relative col-span-1 md:col-span-2">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground select-none" />
            <label htmlFor="order-search" className="sr-only">Cari order, resi, atau penerima</label>
            <input
              id="order-search"
              type="text"
              placeholder="Cari order, resi, atau penerima (Tekan Enter)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyPress}
              className="w-full bg-background/50 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
          </div>

          {/* Status Select */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase flex items-center gap-1">
              <Filter className="h-3 w-3" /> Status
            </label>
            <select
              value={status}
              onChange={(e) => updateFilters({ status: e.target.value })}
              className="w-full bg-zinc-900/90 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all cursor-pointer shadow-sm"
            >
              <option value="all" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Semua Status</option>
              <option value="pending" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Pending</option>
              <option value="pending_payment" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Menunggu pembayaran</option>
              <option value="in_transit" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Dalam Perjalanan</option>
              <option value="completed" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Selesai</option>
              <option value="cancelled" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Dibatalkan</option>
            </select>
          </div>

          {/* Model Select (Hidden since we have tabs now, or keep it sync'd) */}
          <div className="flex flex-col gap-1.5 hidden md:flex">
            <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase flex items-center gap-1">
              <Layers className="h-3 w-3" /> Model
            </label>
            <select
              value={model}
              onChange={(e) => updateFilters({ model: e.target.value })}
              className="w-full bg-zinc-900/90 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all cursor-pointer shadow-sm"
            >
              <option value="all" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Semua Model</option>
              <option value="p2p" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Instan (P2P)</option>
              <option value="hub_and_spoke" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Ekspedisi (3PL)</option>
            </select>
          </div>
        </div>

        {/* Date Filters & Search trigger */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Tanggal Mulai
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                updateFilters({ startDate: e.target.value });
              }}
              className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Tanggal Selesai
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                updateFilters({ endDate: e.target.value });
              }}
              className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-all"
            />
          </div>

          <div className="col-span-1 md:col-span-2 flex items-center gap-2">
            <button
              onClick={() => updateFilters({ search })}
              className="flex-1 px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary font-medium rounded-xl text-sm border border-primary/20 transition-all text-center flex items-center justify-center gap-2"
            >
              <Search className="h-4 w-4" /> Cari Sekarang
            </button>
            <button
              onClick={() => {
                setSearch('');
                setStatus('all');
                setModel('all');
                setStartDate('');
                setEndDate('');
                router.push('/orders');
              }}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm transition-all"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Selected Items & Bulk Action Menu */}
      {selectedOrders.length > 0 && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2 duration-200">
          <p className="text-sm font-medium text-primary">
            {selectedOrders.length} order dipilih
          </p>
          <button
            onClick={handleBulkDownloadResi}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-xl flex items-center gap-2 transition-all duration-200"
          >
            <Download className="h-4 w-4" /> Unduh Resi Terpilih
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-card/40 backdrop-blur-md rounded-2xl border border-white/10 shadow-sm overflow-hidden">
        {loading ? (
          <CustomerPageSkeleton />
        ) : loadError ? (
          <AsyncRecoveryState title="Daftar order belum tersedia" message={loadError} onRetry={() => void fetchOrders()} retrying={loading} />
        ) : orders.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground flex flex-col items-center justify-center space-y-2">
            <p className="text-lg font-semibold text-white">Belum ada order</p>
            <p className="text-sm">Silakan buat order atau sesuaikan filter Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse select-none">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-5 py-4 w-12 text-center">
                    <input
                      aria-label="Pilih semua order"
                      type="checkbox"
                      checked={orders.length > 0 && selectedOrders.length === orders.length}
                      onChange={toggleSelectAll}
                      className="rounded bg-background/50 border-white/10 focus:ring-primary/40 text-primary"
                    />
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    No Order
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Resi / AWB
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Penerima
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Tujuan
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Status
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Model
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Harga
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Tanggal
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase text-center w-24">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.map((order) => {
                  const isChecked = selectedOrders.includes(order.id);
                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-white/5 transition-colors duration-150 cursor-pointer ${
                        isChecked ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td className="px-5 py-4 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          aria-label={`Pilih order ${order.order_number}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOrder(order.id)}
                          className="rounded bg-background/50 border-white/10 focus:ring-primary/40 text-primary"
                        />
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold tracking-tight">
                        {order.order_number}
                      </td>
                      <td className="px-5 py-4 text-sm font-mono text-muted-foreground">
                        {order.awb_number || '-'}
                      </td>
                      <td className="px-5 py-4 text-sm">{order.recipient_name}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground max-w-[180px] truncate" title={order.dropoff_address}>
                        {order.dropoff_address}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span
                          className={`inline-flex items-center px-3 py-1 text-xs font-medium border rounded-full ${getStatusBadgeClass(
                            order.status
                          )}`}
                        >
                          {order.status?.toUpperCase() || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <OrderServiceBadge
                          compact
                          model={order.model}
                          service_code={order.service_code}
                          service_snapshot={order.service_snapshot}
                          logistics_provider={order.logistics_provider}
                          logistics_service_type={order.logistics_service_type}
                          awb_number={order.awb_number}
                        />
                      </td>
                      <td className="px-5 py-4 text-sm font-medium">
                        <OrderPriceBreakdown
                          compact
                          totalPriceIdr={order.total_price_idr}
                          paymentStatus={order.payment_status}
                          deliveryStatus={order.status}
                        />
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{formatDate(order.created_at)}</td>
                      <td className="px-5 py-4 text-sm text-center">
                        <Link
                          href={`/orders/${order.id}`}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white/5 hover:bg-primary hover:text-primary-foreground border border-white/10 hover:border-primary transition-all duration-200"
                          title="Lihat Detail"
                          aria-label={`Lihat detail order ${order.order_number}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Premium Pagination */}
      {orders.length > 0 && (
        <div className="flex items-center justify-between border border-white/10 rounded-2xl p-4 bg-card/20 backdrop-blur-sm">
          <p className="text-xs font-medium text-muted-foreground tracking-wider uppercase">
            Showing {(pageParam - 1) * pageSize + 1} - {(pageParam - 1) * pageSize + orders.length} orders
          </p>
          <div className="flex gap-2">
            <button
              disabled={pageParam <= 1}
              onClick={() => updateFilters({ page: pageParam - 1 })}
              className="px-3.5 py-2 border border-white/10 bg-white/5 rounded-xl text-sm font-semibold hover:bg-white/10 hover:text-white transition duration-200 disabled:opacity-40 flex items-center gap-1 select-none"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <button
              disabled={orders.length < pageSize}
              onClick={() => updateFilters({ page: pageParam + 1 })}
              className="px-3.5 py-2 border border-white/10 bg-white/5 rounded-xl text-sm font-semibold hover:bg-white/10 hover:text-white transition duration-200 disabled:opacity-40 flex items-center gap-1 select-none"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderListPage() {
  return (
    <Suspense fallback={<CustomerPageSkeleton />}>
      <OrderListContent />
    </Suspense>
  );
}
