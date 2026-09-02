import { RouteSnapshotPanel } from './RouteSnapshotPanel';
import { DisputeModal } from '@/components/orders/DisputeModal';
import { ArrowLeft, Share2, Download, AlertTriangle, Loader2, RefreshCw, X, CheckCircle2, Sparkles, Send, ImageIcon, FileSignature, MessageSquare, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';
import { OrderPriceBreakdown } from '@/components/orders/OrderPriceBreakdown';
import { OrderServiceBadge } from '@/components/orders/OrderServiceBadge';
import { presentCarrierStatus } from '@/lib/carrierStatusPresentation';

type OrderDetailContentProps = {
  order: any,
  tracking: any,
  events: any,
  carrierEvents: any,
  proofs: any,
  proofGroups: any,
  serviceProofs: any,
  serviceReportNotes: any,
  foodItems: any,
  packageCount: any,
  packageDetails: any,
  activePhoto: any,
  isDisputeModalOpen: any,
  showCancelModal: any,
  cancellingOrder: any,
  retryingMatching: any,
  sharingTracking: any,
  uploading: any,
  loading: any,
  trackingError: any,
  chatMessages: any,
  chatInput: any,
  chatsLoading: any,
  fileInputRef: any,
  chatScrollRef: any,
  selectedFile: any,
  previewImage: any,
  id: any,
  uploadUrl: any,
  formatDate: any,
  formatPrice: any,
  formatTrackingTime: any,
  getStatusBadgeClass: any,
  addNotification: any,
  handleCreatePublicTrackingLink: any,
  handleDownloadResi: any,
  handleReportIssue: any,
  handleRetryMatching: any,
  handleCancelOrder: any,
  handleSendMessage: any,
  handleFileUpload: any,
  handlePaste: any,
  setShowCancelModal: any,
  setActivePhoto: any,
  setIsDisputeModalOpen: any,
  setChatInput: any,
  setSelectedFile: any,
  setPreviewImage: any,
  api: any,
  cn: any,
  formatTime: any,
  Calendar: any,
  hasPackageDetails: any,
  MapPin: any,
  Navigation: any,
  Package: any,
  packageHeight: any,
  packageLength: any,
  packageWeight: any,
  packageWidth: any,
  Phone: any,
  Truck: any,
  UtensilsCrossed: any
};

export function OrderDetailContent({
  order,
  tracking,
  events,
  carrierEvents,
  proofs,
  proofGroups,
  serviceProofs,
  serviceReportNotes,
  foodItems,
  packageCount,
  packageDetails,
  activePhoto,
  isDisputeModalOpen,
  showCancelModal,
  cancellingOrder,
  retryingMatching,
  sharingTracking,
  uploading,
  loading,
  trackingError,
  chatMessages,
  chatInput,
  chatsLoading,
  fileInputRef,
  chatScrollRef,
  selectedFile,
  previewImage,
  id,
  uploadUrl,
  formatDate,
  formatPrice,
  formatTrackingTime,
  getStatusBadgeClass,
  addNotification,
  handleCreatePublicTrackingLink,
  handleDownloadResi,
  handleReportIssue,
  handleRetryMatching,
  handleCancelOrder,
  handleSendMessage,
  handleFileUpload,
  handlePaste,
  setShowCancelModal,
  setActivePhoto,
  setIsDisputeModalOpen,
  setChatInput,
  setSelectedFile,
  setPreviewImage,
  api,
  cn,
  formatTime,
  Calendar,
  hasPackageDetails,
  MapPin,
  Navigation,
  Package,
  packageHeight,
  packageLength,
  packageWeight,
  packageWidth,
  Phone,
  Truck,
  UtensilsCrossed
}: OrderDetailContentProps) {
  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Premium Header/Navigation */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-1">
          <Link
            href="/orders"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-white transition duration-200"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Order
          </Link>
          <div className="flex items-center gap-3 pt-1">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
              Detail Order {order.order_number}
            </h1>
            <span
              className={`inline-flex items-center px-3.5 py-1.5 text-xs font-medium border rounded-full select-none ${getStatusBadgeClass(
                order.status
              )}`}
            >
              {order.status?.toUpperCase().replace(/_/g, ' ') || 'UNKNOWN'}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Waktu booking: {formatDate(order.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {order.status.toLowerCase() !== 'cancelled' && (
            <>
              <button
                onClick={handleCreatePublicTrackingLink}
                disabled={sharingTracking || !order.courier_name}
                className="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 disabled:opacity-50 disabled:hover:bg-primary/10 border border-primary/20 text-primary rounded-xl text-sm font-medium transition duration-200 flex items-center gap-2"
              >
                {sharingTracking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Bagikan Tracking
              </button>
              <button
                onClick={handleDownloadResi}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm font-medium transition duration-200 flex items-center gap-2"
              >
                <Download className="h-4 w-4" /> Download Resi
              </button>
            </>
          )}
          <button
            onClick={handleReportIssue}
            className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition duration-200 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" /> {order.service_category === 'on_demand' ? 'Bantuan & Laporkan Masalah' : 'Laporkan Masalah'}
          </button>
        </div>
      </div>

      {/* No Courier Found Action Banner */}
      {order.status.toLowerCase() === 'no_courier_found' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/15 via-amber-500/10 to-background p-6 shadow-xl backdrop-blur-md"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400">
                <AlertTriangle className="h-6 w-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  Belum Ada Kurir Ditemukan
                  <span className="inline-flex items-center rounded-full bg-orange-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-orange-300 border border-orange-500/30">
                    Pencarian Berakhir
                  </span>
                </h3>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  Pencarian otomatis telah selesai namun belum ada mitra kurir di sekitar area pick up yang menerima pesanan Anda. Anda dapat memulai ulang pencarian kurir sekarang atau membatalkan pesanan dengan pengembalian dana (refund) 100% secara otomatis.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={handleRetryMatching}
                disabled={retryingMatching || cancellingOrder}
                className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition duration-200 flex items-center gap-2 shadow-lg shadow-orange-500/20 active:scale-[0.98]"
              >
                {retryingMatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Coba Cari Kurir Lagi
              </button>
              <button
                onClick={() => setShowCancelModal(true)}
                disabled={retryingMatching || cancellingOrder}
                className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 border border-red-500/30 text-red-400 rounded-xl text-sm font-semibold transition duration-200 flex items-center gap-2 active:scale-[0.98]"
              >
                Batalkan & Ajukan Refund
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main 2 Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Tracking Column (Map) */}
        <div className="col-span-1 lg:col-span-5 space-y-6">
          <div className="relative aspect-square md:aspect-[4/3] lg:aspect-auto lg:h-[620px] bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
            {/* Elegant Header Layer on top of map */}
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between p-3.5 bg-background/80 backdrop-blur-md rounded-xl border border-white/10 select-none shadow-lg">
              <div className="flex items-center gap-3">
                <Navigation className={cn("h-5 w-5", order.status.toLowerCase() === 'cancelled' ? "text-slate-500" : "text-primary animate-pulse")} />
                <div>
                  <p className="text-xs text-muted-foreground leading-tight uppercase font-bold tracking-wider">
                    {order.status.toLowerCase() === 'cancelled' ? 'Status Pelacakan' : 'Live tracking'}
                  </p>
                  <p className="text-sm font-bold text-white">
                    {order.status.toLowerCase() === 'cancelled' 
                      ? 'Dibatalkan' 
                      : (tracking?.location_stale
                        ? 'Posisi terakhir'
                        : (tracking?.eta || (tracking?.location ? 'Lokasi kurir aktif' : 'Menunggu lokasi kurir')))}
                  </p>
                </div>
              </div>
              <span className={cn(
                "h-2 w-2 rounded-full",
                order.status.toLowerCase() === 'cancelled' ? "bg-slate-500" : tracking?.location_stale ? "bg-amber-400" : tracking?.location ? "bg-green-500 animate-ping" : "bg-amber-400"
              )} />
            </div>

            {/* Premium Dynamic/Interactive Visual Map View or High Quality Simulated view */}
            <div className="flex-1 bg-zinc-950 p-6 flex flex-col justify-center items-center space-y-4 select-none relative overflow-hidden">
              {/* Map Grid Pattern */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:24px_24px]" />
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/30 via-transparent to-blue-950/30" />
              
              <Navigation className="h-10 w-10 text-primary/50 relative z-10" />
              <div className="text-center space-y-1 relative z-10">
                <h4 className="font-bold text-white tracking-tight">
                  {order.status.toLowerCase() === 'cancelled' ? 'Peta Pengiriman (Dibatalkan)' : 'Peta Pengiriman'}
                </h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  {order.status.toLowerCase() === 'cancelled' 
                    ? 'Pesanan dibatalkan. Tracking dihentikan.'
                    : tracking?.location_stale
                      ? `Posisi terakhir diperbarui ${formatTrackingTime(tracking.location?.timestamp)}. Menunggu update GPS baru.`
                    : tracking?.location
                      ? `Update terakhir ${formatTrackingTime(tracking.location.timestamp)}`
                      : trackingError || 'Lokasi kurir otomatis muncul setelah pekerjaan diterima dan tracking aktif.'}
                </p>
              </div>

              <div className="w-full max-w-xs bg-black/40 backdrop-blur-md p-4 border border-white/10 rounded-xl space-y-3.5 relative z-10">
                {tracking?.location && order.status.toLowerCase() !== 'cancelled' && (
                  <>
                    <div className="flex items-start gap-3">
                      <Truck className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Posisi kurir</p>
                        <p className="text-xs text-white max-w-[220px] truncate">
                          {tracking.location.latitude.toFixed(6)}, {tracking.location.longitude.toFixed(6)}
                        </p>
                      </div>
                    </div>
                    <div className="h-8 border-l-2 border-dashed border-white/10 ml-2.5" />
                  </>
                )}
                <div className="flex items-start gap-3 opacity-90">
                  <MapPin className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pickup Point</p>
                    <p className="text-xs text-white max-w-[190px] truncate" title={order.pickup_address}>
                      {order.pickup_address}
                    </p>
                  </div>
                </div>
                <div className="h-8 border-l-2 border-dashed border-white/10 ml-2.5 opacity-90" />
                <div className="flex items-start gap-3 opacity-90">
                  <MapPin className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Destination Point</p>
                    <p className="text-xs text-white max-w-[190px] truncate" title={order.dropoff_address}>
                      {order.dropoff_address}
                    </p>
                  </div>
                </div>
              </div>
              {tracking?.location && order.status.toLowerCase() !== 'cancelled' && (
                <a
                  href={`https://www.google.com/maps?q=${tracking.location.latitude},${tracking.location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:bg-primary/90"
                >
                  <MapPin className="h-4 w-4" /> Buka posisi kurir
                </a>
              )}
            </div>

            {/* Premium Courier Info Overlay Card */}
            <div className="p-4 bg-background/90 backdrop-blur-md border-t border-white/10 flex items-center justify-between gap-4">
              {order.status.toLowerCase() === 'cancelled' ? (
                <div className="flex items-center gap-3 text-red-500">
                  <AlertTriangle className="h-5 w-5" />
                  <p className="text-sm font-medium">Pesanan telah dibatalkan.</p>
                </div>
              ) : order.courier_name ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center font-bold text-primary select-none text-base">
                      {order.courier_name.split(' ').map((n: any) => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground leading-tight">Kurir Terpilih</p>
                      <p className="text-sm font-bold text-white">{order.courier_name}</p>
                      <p className="text-xs text-muted-foreground">
                        ⭐ {order.courier_rating || '5.0'} | {order.courier_vehicle || 'Motor'} ({order.courier_plate || '-'})
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => chatScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className="p-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl transition duration-200 select-none shadow-sm"
                    aria-label="Buka obrolan dalam aplikasi"
                    title="Buka obrolan dalam aplikasi"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <div className="space-y-2" aria-busy="true" aria-label="Mencari kurir">
                  <Skeleton className="h-4 w-48 bg-white/10" />
                  <Skeleton className="h-2 w-full bg-white/10" />
                </div>
              )}
            </div>
          </div>

          <RouteSnapshotPanel order={order} tracking={tracking} />

          {/* Inline Chat Module */}
          <div className="bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h4 className="text-sm font-bold">Obrolan dengan Kurir</h4>
            </div>
            <div 
              ref={chatScrollRef}
              className="h-[210px] bg-background/40 border border-white/5 rounded-xl p-3.5 overflow-y-auto space-y-3.5 scroll-smooth"
            >
              {chatsLoading && chatMessages.length === 0 ? (
                <div className="space-y-2" aria-busy="true" aria-label="Memuat chat">
                  <Skeleton className="h-8 w-4/5 bg-white/10" />
                  <Skeleton className="ml-auto h-8 w-3/5 bg-white/10" />
                  <Skeleton className="h-8 w-2/3 bg-white/10" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-30">
                  <MessageSquare className="h-8 w-8" />
                  <p className="text-[10px] font-medium uppercase tracking-widest">Belum ada percakapan</p>
                </div>
              ) : (
                chatMessages.map((msg: any) => {
                  const isMe = msg.sender_role === 'customer';
                  const isImage = msg.message_type === 'image';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[80%] space-y-1 ${
                        isMe ? 'ml-auto items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={cn(
                          "px-3.5 py-2.5 rounded-2xl text-xs font-normal leading-relaxed overflow-hidden",
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-tr-none shadow-md shadow-primary/20'
                            : 'bg-white/5 border border-white/5 text-white rounded-tl-none',
                          isImage && "p-1"
                        )}
                      >
                        {isImage ? (
                          <img 
                            src={`${api.defaults.baseURL}${msg.message}`} 
                            alt="Attachment" 
                            className="max-w-full rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(`${api.defaults.baseURL}${msg.message}`, '_blank')}
                          />
                        ) : (
                          msg.message
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground px-1 select-none">{formatTime(msg.created_at)}</span>
                    </div>
                  );
                })
              )}
            </div>

            <AnimatePresence>
              {previewImage && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 bg-muted/20 border border-white/5 rounded-xl flex items-center gap-3 mb-2"
                >
                  <div className="relative group">
                    <img src={previewImage} alt="Preview" className="h-14 w-14 object-cover rounded-lg border border-white/10" />
                    <button 
                      onClick={() => { setPreviewImage(null); setSelectedFile(null); }}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-lg"
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-primary uppercase">Gambar siap kirim</p>
                    <p className="text-[10px] text-muted-foreground">Klik kirim untuk mengunggah</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    setPreviewImage(URL.createObjectURL(file));
                  }
                }}
              />
              <button 
                type="button"
                disabled={!order.courier_name}
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:text-white transition-all disabled:opacity-50"
              >
                <ImageIcon size={18} />
              </button>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onPaste={handlePaste}
                disabled={!order.courier_name}
                placeholder={previewImage ? "Tambah keterangan..." : (order.courier_name ? "Ketik pesan atau paste gambar..." : "Menunggu kurir ditugaskan...")}
                className="flex-1 bg-background/50 border border-white/10 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition duration-200 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={(!chatInput.trim() && !previewImage) || !order.courier_name || uploading}
                className="p-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition duration-200 shadow-sm disabled:opacity-50 disabled:grayscale"
              >
                {uploading ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </div>

        {/* Right Details Column */}
        <div className="col-span-1 lg:col-span-7 space-y-6">
          {/* Order Data Summary */}
          <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-6">
            <div className="border-b border-white/10 pb-4">
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" /> Rincian Order & Pengiriman
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nama Penerima</p>
                <p className="text-sm font-semibold">{order.recipient_name || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nomor Telepon Penerima</p>
                <p className="text-sm">{order.recipient_phone_masked || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Metode Pengiriman</p>
                <OrderServiceBadge
                  compact
                  model={order.model}
                  service_category={order.service_category}
                  service_code={order.service_code}
                  order_contract={order.order_contract}
                  service_snapshot={order.service_snapshot}
                  logistics_provider={order.logistics_provider}
                  logistics_service_type={order.logistics_service_type}
                  awb_number={order.awb_number}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Jarak Tempuh</p>
                <p className="text-sm">{order.distance_km ? `${order.distance_km} km` : '-'}</p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Alamat Dropoff</p>
                <p className="text-sm text-white/90 leading-normal">{order.dropoff_address || '-'}</p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Catatan Order</p>
                <p className="text-sm text-white/90 italic leading-relaxed">{order.customer_notes || 'Tidak ada catatan khusus.'}</p>
              </div>
            </div>
          </div>

          <OrderPriceBreakdown
            totalPriceIdr={order.total_price_idr}
            paymentStatus={order.payment_status}
            deliveryStatus={order.status}
          />

          {hasPackageDetails && (
            <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" /> Rincian paket
                </h3>
                {packageCount > 0 && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {packageCount} paket
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-background/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Kategori</p>
                  <p className="mt-1 text-sm font-semibold text-white">{packageDetails.category || packageDetails.size_tier || '-'}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-background/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Berat</p>
                  <p className="mt-1 text-sm font-semibold text-white">{packageWeight > 0 ? `${packageWeight} kg` : '-'}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-background/40 p-4 md:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Isi paket</p>
                  <p className="mt-1 text-sm leading-6 text-white/90">{packageDetails.item_description || packageDetails.description || '-'}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-background/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dimensi</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {packageLength > 0 || packageWidth > 0 || packageHeight > 0
                      ? `${packageLength || '-'} × ${packageWidth || '-'} × ${packageHeight || '-'} cm`
                      : '-'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-background/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Validasi dimensi</p>
                  <p className="mt-1 text-sm font-semibold text-white">{packageDetails.dimensions_scanned ? 'Scan selesai' : 'Manual / tidak wajib scan'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Order Pricing Breakdown Card */}
          <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2 border-b border-white/10 pb-3">
              Kalkulasi Biaya
            </h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ongkos dasar</span>
                <span className="font-medium">{formatPrice(order.base_price_idr || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Surge & Volumetrik Surcharge</span>
                <span className="font-medium">{formatPrice(order.volumetric_surcharge_idr || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Asuransi barang</span>
                <span className="font-medium">{formatPrice(order.insurance_premium_idr || 0)}</span>
              </div>
              <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-base bg-white/5 p-3 rounded-xl">
                <span>TOTAL HARGA</span>
                <span className="text-primary">{formatPrice(order.total_price_idr || 0)}</span>
              </div>
            </div>
          </div>

          {foodItems.length > 0 && (
            <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5 text-primary" /> Rincian pesanan food
                </h3>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {foodItems.length} item
                  </span>
                  {(order.status.toLowerCase() === 'completed' || order.status.toLowerCase() === 'delivered' || order.status.toLowerCase() === 'cancelled') && (
                    <Link href={`/orders/new/food?orderId=${encodeURIComponent(order.id)}`} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20">
                      <ShoppingBag className="h-3.5 w-3.5" /> Pesan Lagi
                    </Link>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {foodItems.map((item: any, index: any) => {
                  const itemName = item.name || item.item_name || 'Item makanan';
                  const quantity = Number(item.quantity || 1);
                  const subtotal = Number(item.subtotal || 0);
                  const variants = Array.isArray(item.variants) ? item.variants : [];
                  return (
                    <div key={`${itemName}-${index}`} className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-background/40 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white">{quantity}× {itemName}</p>
                        {variants.length > 0 && (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {variants.map((variant: any) => {
                              const variantName = String(variant.variant_name || '').trim();
                              const optionName = String(variant.option_name || '').trim();
                              return variantName ? `${variantName}: ${optionName}` : optionName;
                            }).filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {item.notes && (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">Catatan: {item.notes}</p>
                        )}
                      </div>
                      {subtotal > 0 && (
                        <p className="shrink-0 text-sm font-bold text-primary">{formatPrice(subtotal)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Timeline Tracking Flow */}
          <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-6">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2 border-b border-white/10 pb-3">
              <Sparkles className="h-5 w-5 text-primary" /> Timeline Tracking
            </h3>
            <div className="relative pl-6 space-y-6 border-l-2 border-white/10 ml-3">
              {events.length === 0 ? (
                <div className="flex items-start gap-4">
                  <div className="absolute left-[-9px] h-4 w-4 bg-primary rounded-full border-2 border-background flex items-center justify-center animate-ping" />
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Order Diterima</h5>
                    <p className="text-sm text-white font-medium">Sistem sedang memproses booking Anda.</p>
                  </div>
                </div>
              ) : (
                events.map((event: any, i: any) => (
                  <div key={event.id} className="relative">
                    <div
                      className={`absolute left-[-15px] top-1.5 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center ${
                        i === events.length - 1
                          ? 'bg-primary text-primary animate-pulse'
                          : 'bg-green-500 text-green-500'
                      }`}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-bold tracking-tight text-white capitalize">
                          {event.event_type?.replace(/_/g, ' ')}
                        </h5>
                        <span className="text-xs text-muted-foreground font-medium">{formatDate(event.created_at)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-normal">{event.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {carrierEvents.length > 0 && (
            <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-6">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" /> Update Kurir Eksternal
                </h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {carrierEvents.length} update
                </span>
              </div>
              <div className="space-y-3">
                {carrierEvents.map((event: any) => {
                  const statusPresentation = presentCarrierStatus(event.canonical_status);
                  const providerStatus = String(event.provider_status || '').trim();
                  return (
                    <div key={event.id} className={cn(
                      "rounded-xl border bg-background/40 p-4",
                      statusPresentation.isUnknown ? "border-amber-400/30" : "border-white/10",
                    )}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                            statusPresentation.isUnknown ? "bg-amber-400/15 text-amber-300" : "bg-primary/15 text-primary",
                          )}>
                            {statusPresentation.label}
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground">{event.provider}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDate(event.occurred_at || event.received_at)}</span>
                      </div>
                      {statusPresentation.isUnknown && (
                        <p className="mt-2 text-sm text-amber-100/80">{statusPresentation.description}</p>
                      )}
                      {providerStatus && providerStatus.toUpperCase() !== statusPresentation.label && (
                        <p className="mt-2 text-sm text-white/90">Status {event.provider}: {providerStatus}</p>
                      )}
                      {event.provider_status_description && (
                        <p className="mt-1 text-sm text-muted-foreground">{event.provider_status_description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {event.provider_status_code && <span>Kode: {event.provider_status_code}</span>}
                        {event.provider_location && <span>Lokasi: {event.provider_location}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-primary" /> Bukti pickup, POD, dan pembatalan
              </h3>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
                {proofs.length} bukti
              </span>
            </div>

            {proofs.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-background/40 p-4 text-sm text-muted-foreground">
                Bukti operasional akan muncul setelah kurir melakukan scan pickup, foto barang, POD, atau pembatalan sebelum pickup.
              </div>
            ) : (
              <div className="space-y-4">
                {proofGroups.cancellation.map((proof: any) => (
                  <div key={proof.id} className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-red-400" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-red-100">{proof.proof_label || 'Bukti pembatalan pickup'}</p>
                        <p className="mt-1 text-xs leading-5 text-red-100/80">
                          {proof.reason_note || proof.override_reason?.replace(/^[^:]+:\s*/, '') || 'Kurir mengirim alasan pembatalan sebelum barang dipickup.'}
                        </p>
                        <p className="mt-2 text-[11px] font-medium text-red-100/60">{formatTrackingTime(proof.recorded_at || undefined)}</p>
                      </div>
                    </div>
                    {proof.photo_url && (
                      <button type="button" onClick={() => setActivePhoto(uploadUrl(proof.photo_url))} className="mt-3 overflow-hidden rounded-xl border border-red-500/20">
                        <img src={uploadUrl(proof.photo_url)} alt={proof.proof_label || 'Bukti pembatalan'} className="h-40 w-full object-cover transition hover:opacity-90" />
                      </button>
                    )}
                  </div>
                ))}

                {(['pickup', 'pod'] as const).map((group: any) => {
                  const groupProofs = proofGroups[group];
                  if (groupProofs.length === 0) return null;
                  return (
                    <div key={group} className="rounded-xl border border-white/10 bg-background/40 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        <p className="text-sm font-bold text-white">{group === 'pickup' ? 'Bukti pickup' : 'Bukti POD'}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {groupProofs.map((proof: any) => {
                          const imageUrl = uploadUrl(proof.photo_url || proof.image_urls?.[0]);
                          return (
                            <div key={proof.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <p className="text-sm font-semibold text-white">{proof.proof_label || proof.scan_type || 'Bukti pengiriman'}</p>
                              <p className="mt-1 text-[11px] font-medium text-muted-foreground">{formatTrackingTime(proof.recorded_at || undefined)}</p>
                              {imageUrl ? (
                                <button type="button" onClick={() => setActivePhoto(imageUrl)} className="mt-3 block overflow-hidden rounded-lg border border-white/10">
                                  <img src={imageUrl} alt={proof.proof_label || 'Bukti pengiriman'} className="h-36 w-full object-cover transition hover:opacity-90" />
                                </button>
                              ) : (
                                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
                                  Scan tercatat tanpa foto.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {(serviceProofs.length > 0 || serviceReportNotes) && (
            <div className="p-6 bg-card/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-sm space-y-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-primary" /> Bukti layanan
                </h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {serviceProofs.length} bukti
                </span>
              </div>

              {serviceProofs.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {serviceProofs.map((proof: any) => {
                    const imageUrl = uploadUrl(proof.url);
                    return (
                      <div key={proof.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{proof.label}</p>
                          {proof.signature ? <FileSignature className="h-4 w-4 text-primary" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <button type="button" onClick={() => setActivePhoto(imageUrl)} className="block overflow-hidden rounded-lg border border-white/10">
                          <img src={imageUrl} alt={proof.label} className="h-36 w-full object-cover transition hover:opacity-90" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {serviceReportNotes && (
                <div className="rounded-xl border border-white/10 bg-background/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catatan kurir</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/85">{serviceReportNotes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {activePhoto && (
          <motion.button
            type="button"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActivePhoto(null)}
          >
            <img src={activePhoto} alt="Bukti pengiriman" className="max-h-[86vh] max-w-[92vw] rounded-2xl border border-white/10 object-contain shadow-2xl" />
          </motion.button>
        )}
      </AnimatePresence>

      <DisputeModal
        isOpen={isDisputeModalOpen}
        onClose={() => setIsDisputeModalOpen(false)}
        orderId={id as string}
        isOnDemand={order.service_category === 'on_demand'}
        onSuccess={() => {
          addNotification({ title: 'Terkirim', message: 'Laporan Anda telah kami terima dan akan segera diproses.', type: 'success' });
        }}
      />

      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-card p-6 shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Konfirmasi Pembatalan</h3>
                    <p className="text-xs text-muted-foreground">Pengembalian dana 100% otomatis</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancellingOrder}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-white/5 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="my-5 space-y-3 text-sm text-muted-foreground">
                <p>
                  Apakah Anda yakin ingin membatalkan pesanan <strong className="text-white">{order.order_number}</strong>?
                </p>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-brand-emerald-400 text-xs font-semibold">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Dana akan dikembalikan penuh (100%)
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Proses refund ke metode pembayaran awal atau saldo dompet Anda akan diproses secara instan oleh sistem.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancellingOrder}
                  className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white hover:bg-white/10 transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={cancellingOrder}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-semibold text-white transition flex items-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-50"
                >
                  {cancellingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Ya, Batalkan Pesanan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
