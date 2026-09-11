import { Clock3, MapPinned, ShieldCheck } from 'lucide-react';
import { getCustomerServerApiRootUrl } from '@/lib/runtimeConfig';
import { LocationRequestForm } from './LocationRequestForm';

type LocationRequestResponse = {
  success: boolean;
  data?: {
    pickup_address: string;
    recipient_name?: string | null;
    status: string;
    expires_at: string;
  };
  message?: string;
};

const formatExpiry = (value?: string) => {
  if (!value) return 'Belum tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
};

async function getLocationRequest(token: string): Promise<LocationRequestResponse> {
  try {
    const response = await fetch(`${getCustomerServerApiRootUrl()}/api/v1/public/location-requests/${token}`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
    if (!response.ok) {
      return { success: false, message: body?.message || 'Link lokasi tidak tersedia.' };
    }
    return body;
  } catch {
    return {
      success: false,
      message: 'Layanan lokasi sedang tidak tersedia. Coba muat ulang beberapa saat lagi.',
    };
  }
}

export default async function ReceiverLocationRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await getLocationRequest(token);
  const data = request.data;

  return (
    <main className="min-h-screen bg-surface-subtle text-foreground-muted">
      <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-7">
        <div className="rounded-[2rem] bg-gradient-to-br from-primary via-primary to-info p-6 text-foreground shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-foreground-secondary">PAKET MASUK</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight">Konfirmasi titik penerima</h1>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface-subtle">
              <MapPinned className="h-9 w-9" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-foreground-secondary">
            Isi alamat tujuan supaya kurir mendapat titik dropoff yang akurat.
          </p>
        </div>

        <div className="my-5 grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-surface p-4 shadow-sm">
            <Clock3 className="h-5 w-5 text-success" aria-hidden="true" />
            <p className="mt-2 text-xs font-bold text-foreground-muted">Berlaku sampai</p>
            <p className="mt-1 text-sm font-black">{formatExpiry(data?.expires_at)}</p>
          </div>
          <div className="rounded-3xl bg-surface p-4 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-info" aria-hidden="true" />
            <p className="mt-2 text-xs font-bold text-foreground-muted">Keamanan</p>
            <p className="mt-1 text-sm font-black">Link satu kali pakai</p>
          </div>
        </div>

        {!request.success || !data ? (
          <div className="rounded-[2rem] border border-error bg-surface p-7 shadow-lg">
            <h2 className="text-2xl font-black tracking-tight">Link tidak aktif</h2>
            <p className="mt-3 text-sm leading-6 text-foreground-muted">
              {request.message || 'Link lokasi sudah dipakai atau kedaluwarsa.'}
            </p>
          </div>
        ) : data.status === 'submitted' ? (
          <div className="rounded-[2rem] border border-success bg-surface p-7 shadow-lg">
            <h2 className="text-2xl font-black tracking-tight">Lokasi sudah dikirim</h2>
            <p className="mt-3 text-sm leading-6 text-foreground-muted">
              Detail penerima sudah tersimpan. Pemesan bisa melanjutkan proses pengiriman.
            </p>
          </div>
        ) : (
          <LocationRequestForm token={token} initialRequest={data} />
        )}
      </section>
    </main>
  );
}
