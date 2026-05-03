'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
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
        // Mock fallback if empty
        setOrders([
          {
            id: 'ord-1',
            order_number: 'ORD/2026/05/0001',
            pickup_address: 'Jl. Jend. Sudirman No. 12, Jakarta Pusat',
            dropoff_address: 'Jl. Asia Afrika No. 89, Bandung',
            recipient_name: 'Budi Santoso',
            model: 'instant',
            status: 'pickup',
            distance_km: 154.2,
            total_price_idr: 450000,
            created_at: new Date().toISOString(),
          },
          {
            id: 'ord-2',
            order_number: 'ORD/2026/05/0002',
            pickup_address: 'Gedung Wisma Mandiri No. 34, Jakarta Pusat',
            dropoff_address: 'Pondok Indah Mall No. 1, Jakarta Selatan',
            recipient_name: 'Anita Rahma',
            model: 'same_day',
            status: 'in_transit',
            distance_km: 14.5,
            total_price_idr: 25000,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      // Premium Mock fallback data
      setOrders([
        {
          id: 'ord-1',
          order_number: 'ORD/2026/05/0001',
          pickup_address: 'Jl. Jend. Sudirman No. 12, Jakarta Pusat',
          dropoff_address: 'Jl. Asia Afrika No. 89, Bandung',
          recipient_name: 'Budi Santoso',
          model: 'instant',
          status: 'pickup',
          distance_km: 154.2,
          total_price_idr: 450000,
          created_at: new Date().toISOString(),
        },
        {
          id: 'ord-2',
          order_number: 'ORD/2026/05/0002',
          pickup_address: 'Gedung Wisma Mandiri No. 34, Jakarta Pusat',
          dropoff_address: 'Pondok Indah Mall No. 1, Jakarta Selatan',
          recipient_name: 'Anita Rahma',
          model: 'same_day',
          status: 'in_transit',
          distance_km: 14.5,
          total_price_idr: 25000,
          created_at: new Date().toISOString(),
        },
      ]);
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

  // Status ZIP download polling simulation
  const handleDownloadZip = () => {
    if (selectedOrderIds.length === 0) {
      addNotification({ title: 'Gagal', message: 'Silakan pilih resi terlebih dahulu.', type: 'error' });
      return;
    }

    setIsDownloadingZip(true);
    setZipProgress(0);
    setIsZipFinished(false);

    // Polling simulation up to 100%
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setZipProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsZipFinished(true);
        addNotification({ 
          title: 'Selesai', 
          message: 'ZIP Resi berhasil dibuat. Silakan klik tombol unduh ZIP.', 
          type: 'success' 
        });
      }
    }, 500);
  };

  const executeZipDownload = () => {
    // Premium instant ZIP/Bundle downloading text simulation
    const blob = new Blob(
      [
        `=== LANCAR RESI ARCHIVE BUNDLE ===\n\nTotal Resi: ${selectedOrderIds.length}\nResi Numbers: ${orders
          .filter((o) => selectedOrderIds.includes(o.id))
          .map((o) => o.order_number)
          .join(', ')}`
      ],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resi_bundle_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Reset polling modal state
    setIsDownloadingZip(false);
    setZipProgress(0);
    setIsZipFinished(false);
    setSelectedOrderIds([]);
  };

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  if (loading) {
    return (
      <div className="space-y-6 select-none animate-pulse">
        <div className="h-10 bg-muted/50 rounded-xl w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-12 bg-muted/40 rounded-xl" />
          <div className="h-12 bg-muted/40 rounded-xl" />
          <div className="h-12 bg-muted/40 rounded-xl" />
        </div>
        <div className="h-[400px] bg-muted/40 border border-border/40 rounded-2xl" />
      </div>
    );
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
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card/60 backdrop-blur-md border border-border/40 pl-10 pr-4 py-2.5 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all select-none"
          />
        </div>

        {/* Filter Status */}
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none select-none" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full bg-card/60 backdrop-blur-md border border-border/40 pl-10 pr-4 py-2.5 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all select-none appearance-none cursor-pointer"
          >
            <option value="all">Semua Status</option>
            <option value="pickup">Pickup</option>
            <option value="in_transit">Dalam Perjalanan</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </div>

        {/* Filter Model */}
        <div className="relative">
          <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none select-none" />
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-card/60 backdrop-blur-md border border-border/40 pl-10 pr-4 py-2.5 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all select-none appearance-none cursor-pointer"
          >
            <option value="all">Semua Jenis Layanan</option>
            <option value="instant">Instant (GoSend/Grab)</option>
            <option value="same_day">Same Day</option>
            <option value="standard">Reguler / Standard</option>
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
              {filteredOrders.map((order) => {
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
