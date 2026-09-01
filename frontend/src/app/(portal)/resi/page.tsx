'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { CustomerPageSkeleton } from '@/components/ui/Skeleton';
import { clientLog } from '@/lib/clientLogger';
import { useNotificationStore } from '@/store/useNotificationStore';
import { 
  Search, 
  Filter, 
  Download, 
  Eye, 
  Layers, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  X, 
  Printer, 
  FileText, 
  Loader2 
} from 'lucide-react';
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

export default function ResiPage() {
  const router = useRouter();
  const { addNotification } = useNotificationStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  
  // Searching and Filtering
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [model, setModel] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  // ZIP Download Polling Simulation
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [isZipFinished, setIsZipFinished] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/web/orders');
      if (res.data && res.data.success && res.data.orders) {
        setOrders(res.data.orders);
      } else {
        // API returned success:false or no orders — set empty, don't use mock data
        setOrders([]);
      }
    } catch (error: any) {
      clientLog.error('Failed to fetch customer receipts', { error });
      // Surface the real error to the user so they know something is wrong
      addNotification({
        title: 'Gagal Memuat Data',
        message: error?.response?.data?.error || 'Tidak dapat memuat daftar resi. Periksa koneksi internet Anda.',
        type: 'error',
      });
      // Show empty state — no mock data
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Filter computation
  const filteredOrders = orders.filter((order) => {
    const matchesSearch = 
      order.order_number.toLowerCase().includes(search.toLowerCase()) ||
      order.recipient_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === 'all' || order.status === status;
    const matchesModel = model === 'all' || order.model === model;
    return matchesSearch && matchesStatus && matchesModel;
  });

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleSelectOrder = (id: string) => {
    if (selectedOrderIds.includes(id)) {
      setSelectedOrderIds(selectedOrderIds.filter((item) => item !== id));
    } else {
      setSelectedOrderIds([...selectedOrderIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === filteredOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    }
  };

  // Trigger backend ZIP generation and poll for completion
  const handleDownloadZip = async () => {
    if (selectedOrderIds.length === 0) {
      addNotification({ title: 'Gagal', message: 'Silakan pilih resi terlebih dahulu.', type: 'error' });
      return;
    }

    setIsDownloadingZip(true);
    setZipProgress(0);
    setIsZipFinished(false);

    try {
      // Request ZIP generation job from backend
      const res = await api.post('/auth/web/orders/resi/bulk/generate', {
        order_ids: selectedOrderIds,
      });
      const jobId: string = res.data.job_id;

      // Poll backend for job completion
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await api.get(`/auth/web/orders/resi/bulk/status?job_id=${jobId}`);
          const { progress, status } = statusRes.data;
          setZipProgress(progress ?? 0);

          if (status === 'completed') {
            clearInterval(pollInterval);
            setIsZipFinished(true);
            addNotification({
              title: 'Selesai',
              message: 'ZIP Resi berhasil dibuat. Silakan klik tombol unduh ZIP.',
              type: 'success',
            });
          } else if (status === 'failed') {
            clearInterval(pollInterval);
            setIsDownloadingZip(false);
            addNotification({
              title: 'Gagal',
              message: 'Gagal memproses ZIP resi. Silakan coba lagi.',
              type: 'error',
            });
          }
        } catch {
          clearInterval(pollInterval);
          setIsDownloadingZip(false);
          addNotification({ title: 'Error', message: 'Koneksi terputus saat memproses ZIP.', type: 'error' });
        }
      }, 1500);
    } catch (error: any) {
      setIsDownloadingZip(false);
      addNotification({
        title: 'Gagal',
        message: error?.response?.data?.error || 'Tidak dapat memulai proses ZIP.',
        type: 'error',
      });
    }
  };

  // Trigger actual file download from backend-generated ZIP
  const executeZipDownload = async () => {
    try {
      const res = await api.get('/auth/web/orders/resi/bulk/download', {
        params: { order_ids: selectedOrderIds.join(',') },
        responseType: 'blob',
      });

      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `resi_bundle_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      addNotification({ title: 'Error', message: 'Gagal mengunduh file ZIP.', type: 'error' });
    } finally {
      setIsDownloadingZip(false);
      setZipProgress(0);
      setIsZipFinished(false);
      setSelectedOrderIds([]);
    }
  };

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  if (loading) {
    return <CustomerPageSkeleton />;
  }

  return (
    <div className="space-y-6 select-none">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground select-none">
            Resi Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1 select-none">
            Kelola, cetak, dan bagikan resi pengiriman untuk semua order.
          </p>
        </div>

        {/* Bulk action ZIP download */}
        {selectedOrderIds.length > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={handleDownloadZip}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-primary/20 select-none cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Download {selectedOrderIds.length} Resi (ZIP)
          </motion.button>
        )}
      </motion.div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none select-none" />
          <input
            type="text"
            placeholder="Cari No. Resi atau nama penerima..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full bg-card/60 backdrop-blur-md border border-border/40 pl-10 pr-4 py-2.5 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all select-none"
          />
        </div>

        {/* Filter Status */}
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none select-none" />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setCurrentPage(1); }}
            className="w-full bg-zinc-900/90 border border-white/10 pl-10 pr-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all select-none appearance-none cursor-pointer shadow-sm"
          >
            <option value="all" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Semua Status</option>
            <option value="pickup" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Pickup</option>
            <option value="in_transit" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Dalam Perjalanan</option>
            <option value="completed" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Selesai</option>
            <option value="cancelled" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Dibatalkan</option>
          </select>
        </div>

        {/* Filter Model */}
        <div className="relative">
          <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none select-none" />
          <select
            value={model}
            onChange={(e) => { setModel(e.target.value); setCurrentPage(1); }}
            className="w-full bg-zinc-900/90 border border-white/10 pl-10 pr-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all select-none appearance-none cursor-pointer shadow-sm"
          >
            <option value="all" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Semua Jenis Layanan</option>
            <option value="instant" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Instant (GoSend/Grab)</option>
            <option value="same_day" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Same Day</option>
            <option value="standard" className="bg-zinc-900 text-zinc-100 font-medium py-1.5">Reguler / Standard</option>
          </select>
        </div>
      </div>

      {/* Resi Table */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto select-none">
          <table className="w-full text-left border-collapse select-none">
            <thead>
              <tr className="bg-muted/40 border-b border-border/40 text-xs font-bold text-muted-foreground tracking-tight select-none">
                <th className="px-5 py-3.5 w-12 text-center select-none">
                  <input
                    type="checkbox"
                    checked={selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-border h-4 w-4 cursor-pointer select-none"
                  />
                </th>
                <th className="px-5 py-3.5 select-none">No. Resi</th>
                <th className="px-5 py-3.5 select-none">Penerima</th>
                <th className="px-5 py-3.5 select-none">Status</th>
                <th className="px-5 py-3.5 select-none">Harga</th>
                <th className="px-5 py-3.5 select-none">Created At</th>
                <th className="px-5 py-3.5 text-right select-none">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-sm font-medium text-foreground select-none">
              {paginatedOrders.map((order) => {
                const isSelected = selectedOrderIds.includes(order.id);
                return (
                  <tr
                    key={order.id}
                    className={`hover:bg-muted/20 transition-all ${isSelected ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-5 py-3.5 text-center select-none">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOrder(order.id)}
                        className="rounded border-border h-4 w-4 cursor-pointer select-none"
                      />
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-bold select-none truncate">
                      {order.order_number}
                    </td>
                    <td className="px-5 py-3.5 select-none truncate">
                      {order.recipient_name}
                    </td>
                    <td className="px-5 py-3.5 select-none">
                      <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary font-bold rounded-full shadow-sm capitalize select-none">
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs select-none truncate">
                      {formatIDR(order.total_price_idr)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground select-none truncate">
                      {new Date(order.created_at).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-5 py-3.5 text-right select-none">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/resi/${order.id}`}
                          className="p-1.5 hover:bg-muted rounded-lg text-primary hover:text-primary/80 transition-all select-none cursor-pointer"
                          title="Lihat Detail Resi"
                        >
                          <Eye className="h-4 w-4 shrink-0" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground select-none">
                    Tidak ada resi yang ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Premium Pagination */}
      {filteredOrders.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-border/40 rounded-2xl p-4 bg-card/20 backdrop-blur-sm select-none">
          <p className="text-xs font-medium text-muted-foreground tracking-wider uppercase">
            Showing {Math.min((currentPage - 1) * pageSize + 1, filteredOrders.length)} - {Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} resi
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              className="px-3.5 py-2 border border-border/40 bg-card/40 rounded-xl text-sm font-semibold text-foreground hover:bg-card hover:border-primary/40 transition duration-200 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            
            <div className="flex items-center gap-1 px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                        currentPage === page
                          ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105'
                          : 'bg-card/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-card'
                      }`}
                    >
                      {page}
                    </button>
                  );
                } else if (
                  (page === currentPage - 2 && page > 1) ||
                  (page === currentPage + 2 && page < totalPages)
                ) {
                  return <span key={page} className="text-muted-foreground text-xs px-1">...</span>;
                }
                return null;
              })}
            </div>

            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              className="px-3.5 py-2 border border-border/40 bg-card/40 rounded-xl text-sm font-semibold text-foreground hover:bg-card hover:border-primary/40 transition duration-200 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ZIP download progress polling modal */}
      <AnimatePresence>
        {isDownloadingZip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-card border border-border/40 max-w-md w-full rounded-2xl p-6 shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between select-none">
                <h3 className="text-base font-bold text-foreground">Status ZIP Download</h3>
                {!isZipFinished && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground select-none">
                {isZipFinished 
                  ? 'SIP! File ZIP Resi sudah siap diunduh.' 
                  : 'Sistem sedang memproses resi yang Anda pilih...'}
              </p>

              {/* Progress Bar */}
              <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden mt-2 select-none">
                <div 
                  className="h-full bg-primary transition-all duration-300 rounded-full select-none" 
                  style={{ width: `${zipProgress}%` }} 
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsDownloadingZip(false)}
                  className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-medium text-xs rounded-xl transition-all cursor-pointer select-none"
                >
                  Batal
                </button>
                {isZipFinished && (
                  <button
                    onClick={executeZipDownload}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
                  >
                    <Download className="h-3.5 w-3.5" /> Unduh ZIP
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
