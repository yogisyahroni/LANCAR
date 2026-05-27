import { Clock3, MapPinned, ShieldCheck } from 'lucide-react';
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

const apiRoot = () => {
  const configured =
    process.env.SERVER_API_URL ||
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8080/api/v1';
  return configured.replace(/\/api\/v1\/?$/, '');
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
    const response = await fetch(`${apiRoot()}/api/v1/public/location-requests/${token}`, {
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
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-7">
        <div className="rounded-[2rem] bg-gradient-to-br from-emerald-700 via-emerald-600 to-sky-600 p-6 text-white shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-white/75">TEMBUS</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight">Bagikan titik penerima</h1>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15">
              <MapPinned className="h-9 w-9" />
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-white/85">
            Isi alamat tujuan supaya kurir mendapat titik dropoff yang akurat.
          </p>
        </div>

        <div className="my-5 grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <Clock3 className="h-5 w-5 text-emerald-700" />
            <p className="mt-2 text-xs font-bold text-slate-500">Berlaku sampai</p>
            <p className="mt-1 text-sm font-black">{formatExpiry(data?.expires_at)}</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-sky-600" />
            <p className="mt-2 text-xs font-bold text-slate-500">Keamanan</p>
            <p className="mt-1 text-sm font-black">Link satu kali pakai</p>
          </div>
        </div>

        {!request.success || !data ? (
          <div className="rounded-[2rem] border border-red-100 bg-white p-7 shadow-lg">
            <h2 className="text-2xl font-black tracking-tight">Link tidak aktif</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {request.message || 'Link lokasi sudah dipakai atau kedaluwarsa.'}
            </p>
          </div>
        ) : data.status === 'submitted' ? (
          <div className="rounded-[2rem] border border-emerald-100 bg-white p-7 shadow-lg">
            <h2 className="text-2xl font-black tracking-tight">Lokasi sudah dikirim</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
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
