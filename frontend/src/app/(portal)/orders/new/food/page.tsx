'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, MapPin, Minus, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { api } from '@/lib/api';
import { useNotificationStore } from '@/store/useNotificationStore';
import { CustomerPageSkeleton } from '@/components/ui/Skeleton';

type ReorderVariant = {
  variant_id: string;
  option_id: string;
  variant_name: string;
  option_name: string;
  price_delta: number;
};

type ReorderItem = {
  menu_item_id: string;
  item_name: string;
  quantity: number;
  notes?: string;
  variants?: ReorderVariant[];
  old_price: number;
  new_price: number;
  available: boolean;
  price_changed: boolean;
};

type ReorderCheck = {
  order_id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_open: boolean;
  items: ReorderItem[];
  total_old: number;
  total_new: number;
  has_changes: boolean;
};

type FoodMerchant = {
  id: string;
  name: string;
  is_open: boolean;
  paused_until?: string | null;
  menu_items?: Array<{ id: string; name: string; price: number; is_available: boolean }>;
};

type SavedAddress = {
  id: string;
  label: string;
  address: string;
  lat?: number | string | null;
  lng?: number | string | null;
  contact_name?: string | null;
  contact_phone_masked?: string | null;
  is_favorite?: boolean;
};

const formatPrice = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

const responseData = <T,>(response: { data?: { data?: T } & T }) => response.data?.data ?? response.data as T;

export default function FoodReorderPage() {
  const router = useRouter();
  const { addNotification } = useNotificationStore();
  const [orderId, setOrderId] = useState('');
  const [check, setCheck] = useState<ReorderCheck | null>(null);
  const [merchant, setMerchant] = useState<FoodMerchant | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadReorder = useCallback(async (sourceOrderId: string) => {
    setLoading(true);
    setError('');
    try {
      const [checkResponse, addressResponse] = await Promise.all([
        api.get('/orders/reorder-info', { params: { id: sourceOrderId } }),
        api.get('/customer/addresses'),
      ]);
      const reorder = responseData<ReorderCheck>(checkResponse);
      const savedAddresses = (addressResponse.data?.data || []) as SavedAddress[];
      if (!reorder?.merchant_id || !Array.isArray(reorder.items)) {
        throw new Error('Data validasi reorder tidak lengkap.');
      }
      setCheck(reorder);
      setAddresses(savedAddresses);
      setSelectedAddressId(savedAddresses.find((item) => item.is_favorite)?.id || savedAddresses[0]?.id || '');
      setQuantities(Object.fromEntries(reorder.items.map((item) => [item.menu_item_id, item.available ? item.quantity : 0])));

      const merchantResponse = await api.get(`/food/merchants/${reorder.merchant_id}`);
      const merchantPayload = responseData<{ merchant: FoodMerchant }>(merchantResponse);
      setMerchant(merchantPayload?.merchant || merchantPayload as unknown as FoodMerchant);
    } catch (loadError: any) {
      const message = loadError?.response?.data?.message || loadError?.message || 'Validasi pesanan lagi belum bisa dimuat.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const queryOrderId = new URLSearchParams(window.location.search).get('orderId') || '';
    setOrderId(queryOrderId);
    if (queryOrderId) void loadReorder(queryOrderId);
    else {
      setError('Order asal untuk Pesan Lagi tidak ditemukan.');
      setLoading(false);
    }
  }, [loadReorder]);

  const selectedAddress = addresses.find((item) => item.id === selectedAddressId);
  const availableItems = useMemo(
    () => (check?.items || []).filter((item) => item.available && (quantities[item.menu_item_id] || 0) > 0),
    [check?.items, quantities]
  );
  const total = availableItems.reduce((sum, item) => sum + item.new_price * (quantities[item.menu_item_id] || 0), 0);

  const changeQuantity = (itemId: string, delta: number) => {
    setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(99, (current[itemId] || 0) + delta)) }));
  };

  const submitReorder = async () => {
    if (!check || !selectedAddress) return;
    const lat = Number(selectedAddress.lat);
    const lng = Number(selectedAddress.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) {
      addNotification({ title: 'Alamat belum lengkap', message: 'Pilih alamat tersimpan yang memiliki koordinat GPS.', type: 'error' });
      return;
    }
    if (!merchant?.is_open || !check.merchant_open || availableItems.length === 0) {
      addNotification({ title: 'Belum bisa dipesan', message: 'Merchant tutup atau tidak ada item yang tersedia.', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post('/orders/food', {
        merchant_id: check.merchant_id,
        items: availableItems.map((item) => ({
          menu_item_id: item.menu_item_id,
          quantity: quantities[item.menu_item_id],
          notes: item.notes,
          variants: (item.variants || []).map((variant) => ({ variant_id: variant.variant_id, option_id: variant.option_id })),
        })),
        dropoff_address: selectedAddress.address,
        dropoff_lat: lat,
        dropoff_lng: lng,
        receiver_name: selectedAddress.contact_name || undefined,
        receiver_phone: selectedAddress.contact_phone_masked?.includes('*') ? undefined : selectedAddress.contact_phone_masked || undefined,
      });
      const createdOrder = response.data?.data || response.data;
      addNotification({ title: 'Pesanan dibuat', message: 'Pesanan ulang berhasil dikirim ke merchant.', type: 'success' });
      if (createdOrder?.id) router.push(`/orders/${createdOrder.id}`);
      else router.push('/orders');
    } catch (submitError: any) {
      addNotification({ title: 'Pesan lagi gagal', message: submitError?.response?.data?.message || 'Pesanan tidak dapat dibuat saat ini.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <CustomerPageSkeleton />;
  }

  if (error || !check) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center">
        <h1 className="text-xl font-bold text-white">Pesan Lagi belum bisa dilanjutkan</h1>
        <p className="mt-3 text-sm text-red-100">{error || 'Validasi order tidak tersedia.'}</p>
        <Link href={orderId ? `/orders/${orderId}` : '/orders'} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
      </div>
    );
  }

  const unavailableItems = check.items.filter((item) => !item.available);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/orders/${orderId}`} className="rounded-xl border border-white/10 p-2 text-muted-foreground hover:text-white"><ArrowLeft className="h-5 w-5" /></Link>
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Food delivery</p><h1 className="text-2xl font-black text-white">Pesan Lagi dari {check.merchant_name}</h1></div>
      </div>

      {check.has_changes && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">Harga dan ketersediaan sudah divalidasi ulang dari menu saat ini. Total baru: <strong>{formatPrice(check.total_new)}</strong>.</div>}
      {!check.merchant_open && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">Merchant sedang tutup. Pesanan tidak dikirim sebelum merchant buka.</div>}
      {unavailableItems.length > 0 && <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">{unavailableItems.map((item) => item.item_name).join(', ')} tidak tersedia dan otomatis tidak ikut dipesan.</div>}

      <section className="rounded-2xl border border-white/10 bg-card/40 p-5 shadow-sm">
        <h2 className="flex items-center gap-2 border-b border-white/10 pb-4 font-bold text-white"><UtensilsCrossed className="h-5 w-5 text-primary" /> Item pesanan</h2>
        <div className="divide-y divide-white/10">
          {check.items.map((item) => {
            const quantity = quantities[item.menu_item_id] || 0;
            return <div key={item.menu_item_id} className={`flex items-center justify-between gap-4 py-4 ${!item.available ? 'opacity-45' : ''}`}>
              <div className="min-w-0"><p className="font-semibold text-white">{item.item_name}</p><p className="text-xs text-muted-foreground">{item.variants?.map((variant) => `${variant.variant_name}: ${variant.option_name}`).join(' · ') || 'Tanpa varian'}</p><p className="mt-1 text-sm text-primary">{formatPrice(item.new_price)} {item.price_changed && <span className="text-xs text-amber-300">(harga berubah)</span>}</p></div>
              <div className="flex items-center gap-3"><button type="button" disabled={!item.available || quantity === 0} onClick={() => changeQuantity(item.menu_item_id, -1)} className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"><Minus className="h-4 w-4" /></button><span className="w-5 text-center font-bold text-white">{quantity}</span><button type="button" disabled={!item.available} onClick={() => changeQuantity(item.menu_item_id, 1)} className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"><Plus className="h-4 w-4" /></button></div>
            </div>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-card/40 p-5 shadow-sm">
        <h2 className="flex items-center gap-2 border-b border-white/10 pb-4 font-bold text-white"><MapPin className="h-5 w-5 text-primary" /> Antar ke alamat</h2>
        {addresses.length === 0 ? <div className="py-5 text-sm text-muted-foreground">Belum ada alamat tersimpan dengan data penerima. <Link href="/alamat" className="font-semibold text-primary underline">Kelola buku alamat</Link>.</div> : <div className="mt-4 space-y-3">{addresses.map((address) => <label key={address.id} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selectedAddressId === address.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}><input type="radio" name="address" value={address.id} checked={selectedAddressId === address.id} onChange={() => setSelectedAddressId(address.id)} className="mt-1 accent-primary" /><span><span className="block font-semibold text-white">{address.label}</span><span className="block text-sm text-muted-foreground">{address.address}</span><span className="mt-1 block text-xs text-muted-foreground">{address.contact_name || 'Penerima'} · {Number(address.lat) && Number(address.lng) ? 'Koordinat tersedia' : 'Koordinat belum tersedia'}</span></span></label>)}</div>}
      </section>

      <div className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/10 p-5 sm:flex-row sm:items-center"><div><p className="text-sm text-muted-foreground">Estimasi subtotal menu</p><p className="text-2xl font-black text-white">{formatPrice(total)}</p><p className="text-xs text-muted-foreground">Ongkir dan promo dihitung server saat order dibuat.</p></div><button type="button" onClick={submitReorder} disabled={submitting || !selectedAddress || !check.merchant_open || availableItems.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingBag className="h-5 w-5" />} Buat Pesanan Lagi</button></div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Harga, merchant, availability, varian, dan ongkir tetap divalidasi ulang oleh backend. Halaman ini tidak memakai data mock.</p>
    </div>
  );
}
