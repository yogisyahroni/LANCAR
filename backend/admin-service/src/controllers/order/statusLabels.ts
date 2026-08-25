// Leaf module: order status → human label.
// Kept dependency-free (no heavy order/_shared imports) so consumers like
// publicTracking.controller.ts don't pull the circular order/_shared ↔
// courierAuth.controller graph, which made `controllers.publicTracking`
// resolve to undefined under jest/CommonJS module init.

export const customerOrderStatusLabel = (status: any, serviceSubType?: any): string => {
  const normalized = String(status || '').toLowerCase();
  const service = String(serviceSubType || '').toLowerCase();
  const isFood = service === 'food_delivery';
  const labels: Record<string, string> = {
    pending_payment: 'Menunggu pembayaran',
    pending_merchant: 'Menunggu merchant menerima pesanan',
    preparing: 'Merchant sedang menyiapkan pesanan',
    searching: isFood ? 'Mencari kurir sepeda terdekat' : 'Mencari kurir terdekat',
    offered: 'Menawarkan order ke kurir',
    accepted: 'Kurir menerima order',
    assigned: 'Kurir menerima order',
    picking_up: isFood ? 'Kurir menuju merchant' : 'Kurir menuju titik pickup',
    arrived_pickup: isFood ? 'Kurir tiba di merchant' : 'Kurir tiba di pickup',
    picked_up: isFood ? 'Pesanan sudah diambil dari merchant' : 'Barang sudah dipickup',
    in_transit: 'Dalam perjalanan ke tujuan',
    delivering: 'Dalam perjalanan ke tujuan',
    service_started: 'Layanan sedang dikerjakan',
    completed: 'Order selesai',
    delivered: 'Order selesai',
    cancelled: 'Order dibatalkan',
    failed: 'Order gagal',
    payment_failed: 'Pembayaran gagal',
    scheduled: 'Pesanan terjadwal',
  };
  return labels[normalized] || 'Menunggu update pengiriman';
};
