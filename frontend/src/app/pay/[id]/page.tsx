import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createElement } from 'react';
import { MapPin, Package, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';
import { getCustomerServerApiRootUrl } from '@/lib/runtimeConfig';
import { getCustomerServiceIconForService } from '@/components/orders/serviceIcon';
import CheckoutButton from './CheckoutButton';

interface PaymentLink {
  id: string;
  item_name: string;
  item_price: number;
  item_image_url: string;
  dropoff_address: string;
  status: string;
  expired_at: string;
  delivery_fee_amount: number;
  service_code?: string;
  order_id?: string;
  store_name?: string;
  created_at: string;
}

async function getPaymentLink(id: string): Promise<PaymentLink | null> {
  try {
    const serverApiUrl = getCustomerServerApiRootUrl() + '/api/v1';
    const res = await fetch(`${serverApiUrl}/payment-links/${id}`, {
      next: { revalidate: 0 },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as PaymentLink;
  } catch {
    return null;
  }
}

export default async function PaymentLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const link = await getPaymentLink(id);

  if (!link) {
    notFound();
  }

  const isExpired = link.status === 'EXPIRED' || new Date() > new Date(link.expired_at);
  const isPaid = link.status === 'PAID';

  const totalPrice = link.item_price + link.delivery_fee_amount;
  const ServiceIcon = getCustomerServiceIconForService({ code: link.service_code, name: link.service_code });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface-raised backdrop-blur-xl border border-border rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
        
        {/* Header Status */}
        <div className={`p-6 text-center ${isPaid ? 'bg-success/10' : isExpired ? 'bg-error-surface' : 'bg-primary/10'}`}>
          {isPaid ? (
            <div className="flex flex-col items-center text-success">
              <CheckCircle2 className="w-16 h-16 mb-2" aria-hidden="true" />
              <h1 className="text-2xl font-bold">Pembayaran Berhasil</h1>
              <p className="text-sm opacity-80 mt-1 text-center">
                Pesanan Anda sedang diproses. <br/>
                Silakan pantau status pengiriman pada live tracking.
              </p>
            </div>
          ) : isExpired ? (
            <div className="flex flex-col items-center text-error">
              <Clock className="w-16 h-16 mb-2" aria-hidden="true" />
              <h1 className="text-2xl font-bold">Link Kedaluwarsa</h1>
              <p className="text-sm opacity-80 mt-1">Silakan minta link baru kepada penjual</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-primary">
              <ShieldCheck className="w-16 h-16 mb-2" aria-hidden="true" />
              <h1 className="text-2xl font-bold">Selesaikan Pembayaran</h1>
              <p className="text-sm text-muted-foreground mt-1 text-foreground-secondary">Aman & Terverifikasi oleh TEMBUS</p>
            </div>
          )}
        </div>

        {/* Item Details */}
        <div className="p-6 space-y-6">
          <div className="flex gap-4">
            <div className="w-24 h-24 rounded-2xl bg-surface-subtle border border-border overflow-hidden shrink-0">
              <Image 
                src={link.item_image_url || '/placeholder-item.png'} 
                alt={link.item_name}
                width={96}
                height={96}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col justify-center">
              {link.store_name && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold mb-1 uppercase tracking-wider">
                  <Package className="w-3.5 h-3.5" aria-hidden="true" />
                  {link.store_name}
                </div>
              )}
              <h3 className="text-xl font-bold text-foreground line-clamp-2">{link.item_name}</h3>
              <p className="text-primary font-semibold mt-1">{formatPrice(link.item_price)}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3 bg-surface-subtle p-4 rounded-2xl border border-border">
              <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Tujuan Pengiriman</p>
                <p className="text-sm text-foreground mt-1 leading-relaxed">{link.dropoff_address}</p>
              </div>
            </div>

            <div className="bg-surface-subtle rounded-2xl border border-border p-4 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Harga Barang</span>
                <span className="text-foreground font-medium">{formatPrice(link.item_price)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  {createElement(ServiceIcon, { className: 'w-4 h-4', 'aria-hidden': true })} Ongkir TEMBUS {link.service_code && `(${link.service_code.replace(/_/g, ' ').toUpperCase()})`}
                </span>
                <span className="text-foreground font-medium">{formatPrice(link.delivery_fee_amount)}</span>
              </div>
              <div className="pt-3 border-t border-border flex justify-between items-center">
                <span className="text-foreground font-bold">Total Pembayaran</span>
                <span className="text-xl font-extrabold text-primary">{formatPrice(totalPrice)}</span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          {!isPaid && !isExpired && (
            <CheckoutButton paymentLinkId={link.id} />
          )}

          {isPaid && link.order_id && (
            <div className="mt-4">
              <a 
                href={`/track/${link.order_id}`}
                className="w-full flex items-center justify-center gap-2 bg-success text-on-success font-bold py-4 rounded-2xl hover:bg-success transition-colors shadow-lg shadow-success/20"
              >
                <MapPin className="w-5 h-5" aria-hidden="true" />
                Lacak Pesanan (Live Tracking)
              </a>
            </div>
          )}

          {/* Powered By */}
          <div className="text-center pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Powered securely by <span className="font-bold text-foreground">TEMBUS</span>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
