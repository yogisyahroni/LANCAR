'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Calendar, MapPin, Navigation, Package, Phone, Truck, UtensilsCrossed } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CustomerPageSkeleton } from '@/components/ui/Skeleton';
import { AsyncRecoveryState } from '@/components/ui/AsyncRecoveryState';
import { OrderDetailContent } from './OrderDetailContent';
import { useOrderDetailRuntime } from './useOrderDetailRuntime';

export default function OrderDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const runtime = useOrderDetailRuntime(id);
  const {
    order, events, carrierEvents, proofs, tracking, trackingError, loading, loadError, chatsLoading, sharingTracking,
    retryingMatching, cancellingOrder, showCancelModal, setShowCancelModal, activePhoto,
    setActivePhoto, isDisputeModalOpen, setIsDisputeModalOpen, chatInput, setChatInput,
    chatMessages, uploading, previewImage, setPreviewImage, selectedFile, setSelectedFile,
    fileInputRef, chatScrollRef, addNotification, handleCreatePublicTrackingLink,
    handleDownloadResi, handleReportIssue, handleRetryMatching, handleCancelOrder,
    handleSendMessage, handleFileUpload, handlePaste,
  } = runtime;

  const formatPrice = (price: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(price);
  const formatDate = (value: string) => value ? new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value)) : '';
  const formatTime = (value: string) => value ? new Intl.DateTimeFormat('id-ID', {
    timeStyle: 'short',
  }).format(new Date(value)) : '';
  const formatTrackingTime = (value?: string) => value ? formatTime(value) : 'Belum tersedia';
  const uploadUrl = (path?: string | null) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const baseUrl = String(api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  };
  const getStatusBadgeClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'created': case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'picked_up': case 'in_transit': case 'delivering': return 'bg-info/10 text-info border-info/20 animate-pulse';
      case 'completed': case 'delivered': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'cancelled': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'no_courier_found': return 'bg-orange-500/10 text-orange-400 border-orange-500/30 animate-pulse';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const proofGroups = {
    pickup: proofs.filter((proof) => proof.proof_category === 'pickup'),
    pod: proofs.filter((proof) => proof.proof_category === 'pod'),
    cancellation: proofs.filter((proof) => proof.proof_category === 'cancellation'),
  };
  const serviceProofs = [
    ...(order?.tambal_ban_report ? [
      { label: 'Foto ban sebelum', url: order.tambal_ban_report.tire_photo_before_url },
      { label: 'Foto ban sesudah', url: order.tambal_ban_report.tire_photo_after_url },
    ] : []),
    ...(order?.towing_report ? [
      { label: 'Foto kendaraan sebelum', url: order.towing_report.vehicle_photo_before_url },
      { label: 'Foto loading', url: order.towing_report.loading_photo_url },
      { label: 'Foto unloading', url: order.towing_report.unloading_photo_url },
      { label: 'Foto completion', url: order.towing_report.completion_photo_url },
      { label: 'Tanda tangan penerima', url: order.towing_report.signature_url, signature: true },
    ] : []),
  ].filter((proof) => proof.url);
  const serviceReportNotes = order?.tambal_ban_report?.notes || order?.towing_report?.notes || '';
  const foodItems = order?.food_items || [];
  const packageDetails = order?.package_details || {};
  const packageDimensions = packageDetails.dimensions || {};
  const packageLength = Number(packageDetails.length_cm ?? packageDimensions.length ?? 0);
  const packageWidth = Number(packageDetails.width_cm ?? packageDimensions.width ?? 0);
  const packageHeight = Number(packageDetails.height_cm ?? packageDimensions.height ?? 0);
  const packageWeight = Number(packageDetails.weight_kg ?? 0);
  const packageCount = Number(packageDetails.package_count ?? packageDetails.count ?? 0);
  const hasPackageDetails = Boolean(
    packageDetails.category || packageDetails.item_description || packageDetails.description ||
    packageDetails.size_tier || packageCount > 0 || packageWeight > 0 || packageLength > 0 ||
    packageWidth > 0 || packageHeight > 0,
  );

  if (loading) return <CustomerPageSkeleton />;
  if (!order) {
    return (
      <div className="mx-auto my-12 max-w-xl space-y-4">
        {loadError ? (
          <AsyncRecoveryState title="Detail order belum tersedia" message={loadError} onRetry={() => void runtime.refresh()} retrying={loading} />
        ) : (
          <div className="flex flex-col items-center space-y-4 rounded-2xl border border-white/10 bg-card p-12 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500" aria-hidden="true" />
            <h3 className="text-xl font-bold">Order tidak ditemukan</h3>
            <p className="text-sm text-muted-foreground">Detail order yang Anda cari mungkin telah dihapus atau tidak dapat diakses.</p>
            <Link href="/orders" className="text-sm font-semibold text-primary underline">Kembali ke Daftar Order</Link>
          </div>
        )}
      </div>
    );
  }

  return <OrderDetailContent
    order={order} tracking={tracking} events={events} carrierEvents={carrierEvents} proofs={proofs} proofGroups={proofGroups}
    serviceProofs={serviceProofs} serviceReportNotes={serviceReportNotes} foodItems={foodItems}
    packageCount={packageCount} packageDetails={packageDetails} activePhoto={activePhoto}
    isDisputeModalOpen={isDisputeModalOpen} showCancelModal={showCancelModal}
    cancellingOrder={cancellingOrder} retryingMatching={retryingMatching} sharingTracking={sharingTracking}
    uploading={uploading} loading={loading} trackingError={trackingError} chatMessages={chatMessages}
    chatInput={chatInput} chatsLoading={chatsLoading} fileInputRef={fileInputRef} chatScrollRef={chatScrollRef}
    selectedFile={selectedFile} previewImage={previewImage} id={id} uploadUrl={uploadUrl}
    formatDate={formatDate} formatPrice={formatPrice} formatTrackingTime={formatTrackingTime}
    getStatusBadgeClass={getStatusBadgeClass} addNotification={addNotification}
    handleCreatePublicTrackingLink={handleCreatePublicTrackingLink} handleDownloadResi={handleDownloadResi}
    handleReportIssue={handleReportIssue} handleRetryMatching={handleRetryMatching}
    handleCancelOrder={handleCancelOrder} handleSendMessage={handleSendMessage}
    handleFileUpload={handleFileUpload} handlePaste={handlePaste} setShowCancelModal={setShowCancelModal}
    setActivePhoto={setActivePhoto} setIsDisputeModalOpen={setIsDisputeModalOpen} setChatInput={setChatInput}
    setSelectedFile={setSelectedFile} setPreviewImage={setPreviewImage} api={api} cn={cn}
    formatTime={formatTime} Calendar={Calendar} hasPackageDetails={hasPackageDetails} MapPin={MapPin}
    Navigation={Navigation} Package={Package} packageHeight={packageHeight} packageLength={packageLength}
    packageWeight={packageWeight} packageWidth={packageWidth} Phone={Phone} Truck={Truck}
    UtensilsCrossed={UtensilsCrossed}
  />;
}
