// Leaf module: order status → human label.
// Kept dependency-free (no heavy order/_shared imports) so consumers like
// publicTracking.controller.ts don't pull the circular order/_shared ↔
// courierAuth.controller graph, which made `controllers.publicTracking`
// resolve to undefined under jest/CommonJS module init.

export const customerOrderStatusLabel = (status: any, serviceSubType?: any, serviceCategory?: any): string => {
  const normalized = String(status || '').toLowerCase();
  const service = `${String(serviceSubType || '')} ${String(serviceCategory || '')}`.toLowerCase();
  const isFood = service.includes('food');
  const isTambalBan = service.includes('tambal') || service.includes('tire') || service.includes('ban');
  const isTowing = service.includes('towing') || service.includes('derek');
  const labels: Record<string, string> = {
    pending_payment: 'Menunggu pembayaran',
    pending_merchant: 'Menunggu merchant menerima pesanan',
    preparing: 'Merchant sedang menyiapkan pesanan',
    searching: isFood
      ? 'Mencari kurir sepeda terdekat'
      : isTambalBan
        ? 'Mencari teknisi siaga'
        : isTowing
          ? 'Mencari petugas towing'
          : 'Mencari kurir terdekat',
    offered: 'Menawarkan order ke kurir',
    accepted: isTambalBan ? 'Teknisi menerima order' : isTowing ? 'Driver towing menerima order' : 'Kurir menerima order',
    assigned: isTambalBan ? 'Teknisi menerima order' : isTowing ? 'Driver towing menerima order' : 'Kurir menerima order',
    picking_up: isFood
      ? 'Kurir menuju merchant'
      : isTambalBan
        ? 'Teknisi menuju lokasi'
        : isTowing
          ? 'Driver towing menuju titik jemput'
          : 'Kurir menuju titik pickup',
    arrived_pickup: isFood
      ? 'Kurir tiba di merchant'
      : isTambalBan
        ? 'Teknisi tiba dan verifikasi lokasi'
        : isTowing
          ? 'Driver towing tiba di titik jemput'
          : 'Kurir tiba di pickup',
    picked_up: isFood
      ? 'Pesanan sudah diambil dari merchant'
      : isTambalBan
        ? 'Layanan dimulai'
        : isTowing
          ? 'Kendaraan mulai dievakuasi'
          : 'Barang sudah dipickup',
    in_transit: isTambalBan ? 'Perbaikan ban sedang dikerjakan' : isTowing ? 'Kendaraan dalam proses towing' : 'Dalam perjalanan ke tujuan',
    delivering: isTambalBan ? 'Perbaikan ban sedang dikerjakan' : isTowing ? 'Kendaraan dalam proses towing' : 'Dalam perjalanan ke tujuan',
    service_started: isTambalBan ? 'Perbaikan ban sedang dikerjakan' : isTowing ? 'Kendaraan dalam proses towing' : 'Layanan sedang dikerjakan',
    completed: isTambalBan ? 'Layanan selesai' : isTowing ? 'Towing selesai' : 'Order selesai',
    delivered: isTambalBan ? 'Layanan selesai' : isTowing ? 'Towing selesai' : 'Order selesai',
    cancelled: isTambalBan ? 'Layanan tidak dilanjutkan' : isTowing ? 'Towing tidak dilanjutkan' : 'Order dibatalkan',
    failed: isTambalBan ? 'Layanan gagal' : isTowing ? 'Towing gagal' : 'Order gagal',
    payment_failed: 'Pembayaran gagal',
    scheduled: isFood ? 'Pesanan terjadwal' : 'Order terjadwal',
  };
  return labels[normalized] || 'Menunggu update pengiriman';
};
