import { MapPin, Navigation, PackageCheck, Timer, Truck } from 'lucide-react';
import { getCustomerServerApiRootUrl } from '@/lib/runtimeConfig';

type PublicTrackingResponse = {
  success: boolean;
  data?: {
    order_id: string;
    order_number?: string | null;
    status: string;
    pickup_address?: string | null;
    drop_address?: string | null;
    pickup_latitude?: number | null;
    pickup_longitude?: number | null;
    drop_latitude?: number | null;
    drop_longitude?: number | null;
    courier_name?: string | null;
    courier_latitude?: number | null;
    courier_longitude?: number | null;
    last_location_at?: string | null;
    location_stale?: boolean;
    location_age_seconds?: number | null;
    eta?: string | null;
    eta_minutes?: number | null;
    eta_source?: string | null;
    expires_at?: string | null;
  };
  message?: string;
};

const statusLabel = (status?: string) => {
  const normalized = (status || '').toLowerCase();
  if (['delivered', 'completed'].includes(normalized)) return 'Selesai';
  if (['in_transit', 'picked_up'].includes(normalized)) return 'Dalam pengantaran';
  if (['accepted', 'assigned', 'matched'].includes(normalized)) return 'Kurir menuju pickup';
  if (['cancelled', 'failed'].includes(normalized)) return 'Tidak aktif';
  return 'Menunggu update';
};

const formatTime = (value?: string | null) => {
  if (!value) return 'Belum tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
};

// S3-CW-05: Validate token format before using in URL to prevent path injection.
// Tracking tokens must be alphanumeric + URL-safe chars (A-Z, a-z, 0-9, _, -), 10–128 chars.
// This blocks tokens like: "../admin", "?inject=true", "<script>", etc.
const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;

async function getTracking(token: string): Promise<PublicTrackingResponse> {
  // Reject tokens with invalid format before they ever reach the network
  if (!TRACKING_TOKEN_PATTERN.test(token)) {
    return { success: false, message: 'Link tracking tidak valid.' };
  }

  try {
    const response = await fetch(`${getCustomerServerApiRootUrl()}/track/${token}`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
    if (!response.ok) {
      return { success: false, message: body?.message || 'Link tracking tidak tersedia.' };
    }
    return body;
  } catch {
    return {
      success: false,
      message: 'Layanan tracking sedang tidak tersedia. Coba muat ulang beberapa saat lagi.',
    };
  }
}

export default async function PublicTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tracking = await getTracking(token);
  const data = tracking.data;
  const hasCourierLocation = Number.isFinite(Number(data?.courier_latitude)) && Number.isFinite(Number(data?.courier_longitude));

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-emerald-300">TEMBUS Tracking</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Status Pengiriman</h1>
          </div>
          <div className="rounded-2xl bg-brand-emerald-500/15 p-3 text-brand-emerald-300">
            <Truck className="h-7 w-7" />
          </div>
        </div>

        {!tracking.success || !data ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-bold">Link tidak aktif</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {tracking.message || 'Link tracking sudah berakhir atau pengiriman tidak tersedia.'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">Nomor order</p>
                  <h2 className="mt-1 text-2xl font-black">{data.order_number || data.order_id}</h2>
                </div>
                <span className="rounded-full bg-brand-emerald-400/15 px-4 py-2 text-sm font-bold text-brand-emerald-200">
                  {statusLabel(data.status)}
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-900 p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Kurir</p>
                  <p className="mt-1 font-bold">{data.courier_name || 'Kurir TEMBUS'}</p>
                </div>
                <div className="rounded-2xl bg-slate-900 p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Update lokasi</p>
                  <p className={`mt-1 font-bold ${data.location_stale ? 'text-amber-300' : ''}`}>
                    {data.location_stale ? 'Posisi terakhir' : formatTime(data.last_location_at)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h3 className="flex items-center gap-2 text-lg font-black">
                <Navigation className="h-5 w-5 text-brand-emerald-300" />
                Live Tracking
              </h3>
              <div className="mt-5 rounded-3xl border border-white/10 bg-slate-900 p-5">
                {data.eta && (
                  <p className="mb-4 text-sm font-bold text-brand-emerald-200">
                    ETA dari server: {data.eta}{data.eta_source ? ` · ${data.eta_source}` : ''}
                  </p>
                )}
                {hasCourierLocation ? (
                  <a
                    className="block rounded-2xl bg-brand-emerald-500 px-5 py-4 text-center font-black text-slate-950"
                    href={`https://www.google.com/maps?q=${data.courier_latitude},${data.courier_longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka posisi kurir di Maps
                  </a>
                ) : (
                  <p className="text-sm leading-6 text-slate-300">
                    Posisi kurir akan tampil setelah tracking aktif dari aplikasi kurir.
                  </p>
                )}
                {data.location_stale && (
                  <p className="mt-4 text-xs leading-5 text-amber-200">
                    GPS terakhir sudah lebih dari batas freshness. Tunggu update baru sebelum mengambil keputusan berdasarkan posisi ini.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h3 className="mb-5 flex items-center gap-2 text-lg font-black">
                <PackageCheck className="h-5 w-5 text-brand-emerald-300" />
                Rute Pengiriman
              </h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <MapPin className="mt-1 h-5 w-5 text-orange-300" />
                  <div>
                    <p className="font-bold">Pickup</p>
                    <p className="text-sm text-slate-300">{data.pickup_address || '-'}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <MapPin className="mt-1 h-5 w-5 text-brand-emerald-300" />
                  <div>
                    <p className="font-bold">Tujuan</p>
                    <p className="text-sm text-slate-300">{data.drop_address || '-'}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Timer className="mt-1 h-5 w-5 text-sky-300" />
                  <div>
                    <p className="font-bold">Link berlaku sampai</p>
                    <p className="text-sm text-slate-300">{formatTime(data.expires_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
