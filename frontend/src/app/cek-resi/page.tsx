'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  MapPin,
  PackageSearch,
  SearchX,
  User,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { customerApiUrl } from '@/lib/runtimeConfig';

const RESI_PATTERN = /^[A-Za-z0-9-]{1,40}$/;

interface TimelineEntry {
  status: string;
  label: string;
  at: string | null;
}

interface PublicResiData {
  resi: string;
  service_code: string;
  status: string;
  status_label: string;
  timeline?: TimelineEntry[];
  origin_city?: string | null;
  destination_city?: string | null;
  courier_first_name?: string | null;
  estimated_delivery_at?: string | null;
}

type ResultState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'unavailable'; message?: string }
  | { kind: 'error'; message?: string }
  | { kind: 'found'; data: PublicResiData };

// Canonical step order for the status stepper (mirrors portal tracking language)
const STEPS = [
  { key: 'created', label: 'Order dibuat' },
  { key: 'picked_up', label: 'Paket diambil' },
  { key: 'in_transit', label: 'Dalam pengiriman' },
  { key: 'delivered', label: 'Terkirim' },
] as const;

const formatTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(parsed);
};

function sanitizeResiInput(raw: string): string {
  // Alphanumeric + dash only, max 40 chars — mirrors backend expectations
  return raw.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40).trim();
}

async function fetchPublicTracking(resi: string): Promise<ResultState> {
  if (!RESI_PATTERN.test(resi)) {
    return { kind: 'error', message: 'Format resi tidak valid.' };
  }
  try {
    const response = await fetch(
      `${customerApiUrl}/tracking/public?resi=${encodeURIComponent(resi)}`,
      { headers: { Accept: 'application/json' } }
    );
    let body: { found?: boolean; data?: PublicResiData; message?: string } | null = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (response.ok && body?.found === true && body.data?.resi) {
      return { kind: 'found', data: body.data };
    }
    if (body?.found === false || (response.status === 404 && body !== null)) {
      return { kind: 'not_found' };
    }
    if (response.status === 404 || response.status === 501) {
      // Endpoint not deployed yet — graceful "coming soon" state
      return {
        kind: 'unavailable',
        message: body?.message,
      };
    }
    return {
      kind: 'error',
      message: `Terjadi kesalahan pada server (kode ${response.status}).`,
    };
  } catch {
    return {
      kind: 'error',
      message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
    };
  }
}

function StatusStepper({ data }: { data: PublicResiData }) {
  const normalized = (data.status || '').toLowerCase();

  if (['cancelled', 'failed', 'canceled'].includes(normalized)) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
        <div>
          <p className="text-sm font-bold text-red-200">Kiriman tidak aktif</p>
          <p className="mt-1 text-xs text-red-200/80">
            {data.status_label || 'Pesanan dibatalkan atau gagal diproses.'}
          </p>
        </div>
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((step) => normalized.includes(step.key));
  const isDone = currentIndex === STEPS.length - 1;

  return (
    <ol className="flex items-center" aria-label="Progres pengiriman">
      {STEPS.map((step, index) => {
        const reached = currentIndex >= index;
        const isCurrent = currentIndex === index;
        const isLast = index === STEPS.length - 1;
        return (
          <li key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={
                  reached
                    ? 'flex h-8 w-8 items-center justify-center rounded-full bg-brand-emerald-500 text-slate-950'
                    : 'flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-slate-500'
                }
              >
                {reached ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-4 w-4" />}
              </span>
              <span
                className={`max-w-[72px] text-center text-[10px] font-semibold leading-tight sm:max-w-none sm:text-xs ${
                  reached ? 'text-brand-emerald-300' : 'text-slate-500'
                }`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                aria-hidden="true"
                className={`mx-1 mb-4 h-0.5 flex-1 rounded sm:mx-2 ${
                  currentIndex > index ? 'bg-brand-emerald-500' : 'bg-white/10'
                }`}
              />
            )}
          </li>
        );
      })}
      {isDone && <span className="sr-only">Paket telah terkirim.</span>}
    </ol>
  );
}

function ResiSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-16 w-full bg-white/10" />
      <Skeleton className="h-28 w-full bg-white/10" />
      <Skeleton className="h-48 w-full bg-white/10" />
    </div>
  );
}

function CekResiContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialResi = sanitizeResiInput(searchParams.get('resi') ?? '');

  const [inputValue, setInputValue] = useState(initialResi);
  const [state, setState] = useState<ResultState>({ kind: 'idle' });

  const runSearch = useCallback(async (resi: string) => {
    setState({ kind: 'loading' });
    const result = await fetchPublicTracking(resi);
    setState(result);
  }, []);

  useEffect(() => {
    if (initialResi && RESI_PATTERN.test(initialResi)) {
      void runSearch(initialResi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sanitized = sanitizeResiInput(inputValue);
    setInputValue(sanitized);
    if (!sanitized) {
      setState({ kind: 'error', message: 'Masukkan nomor resi terlebih dahulu.' });
      return;
    }
    if (!RESI_PATTERN.test(sanitized)) {
      setState({ kind: 'error', message: 'Resi hanya boleh huruf, angka, dan tanda hubung.' });
      return;
    }
    router.replace(`/cek-resi?resi=${encodeURIComponent(sanitized)}`, { scroll: false });
    void runSearch(sanitized);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-8">
        <header className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/tembusweb.svg" alt="TEMBUS" className="h-8 object-contain" />
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-slate-300 transition-colors hover:text-white">
              Beranda
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-white/10 px-3.5 py-1.5 font-bold text-slate-200 transition-all hover:bg-white/5"
            >
              Masuk
            </Link>
          </nav>
        </header>

        <div className="rounded-3xl border border-brand-emerald-500/20 bg-brand-emerald-500/10 p-3 text-brand-emerald-300 w-fit">
          <PackageSearch className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight">Lacak Kiriman</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Masukkan nomor resi untuk melihat status dan riwayat perjalanan paketmu.
        </p>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="mt-6" noValidate>
          <label
            htmlFor="cek-resi-input"
            className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400"
          >
            Nomor Resi
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="cek-resi-input"
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={40}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Contoh: TB-12345678"
              aria-describedby="cek-resi-help"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-semibold uppercase tracking-wide outline-none transition-all placeholder:normal-case placeholder:text-slate-500 focus:border-brand-emerald-400/60 focus:ring-2 focus:ring-brand-emerald-500/20"
            />
            <button
              type="submit"
              disabled={state.kind === 'loading'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-emerald-500 px-6 py-3 text-sm font-black text-slate-950 transition-all hover:bg-brand-emerald-400 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
            >
              {state.kind === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Mencari…
                </>
              ) : (
                'Cari'
              )}
            </button>
          </div>
          <p id="cek-resi-help" className="mt-2 text-xs text-slate-500">
            Hanya huruf, angka, dan tanda hubung (maksimal 40 karakter).
          </p>
        </form>

        {/* Results */}
        <div className="mt-8 space-y-5" aria-live="polite" aria-busy={state.kind === 'loading'}>
          {state.kind === 'loading' && <ResiSkeleton />}

          {state.kind === 'idle' && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm text-slate-400">
              Hasil pelacakan akan muncul di sini setelah kamu mencari nomor resi.
            </div>
          )}

          {(state.kind === 'not_found') && (
            <div className="flex items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <SearchX className="mt-0.5 h-6 w-6 shrink-0 text-orange-300" />
              <div>
                <h2 className="text-lg font-black">Resi tidak ditemukan</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-300">
                  Pastikan nomor resi sudah benar, atau hubungi pengirim untuk konfirmasi.
                </p>
              </div>
            </div>
          )}

          {state.kind === 'unavailable' && (
            <div className="flex items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <Clock className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
              <div>
                <h2 className="text-lg font-black">Layanan sedang dipersiapkan</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-300">
                  {state.message ||
                    'Pelacakan resi publik belum tersedia. Coba lagi beberapa saat kemudian.'}
                </p>
              </div>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="flex items-start gap-3 rounded-3xl border border-red-500/20 bg-red-500/10 p-6">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-300" />
              <div>
                <h2 className="text-lg font-bold text-red-200">Gagal memuat</h2>
                <p className="mt-1.5 text-sm leading-6 text-red-200/90">{state.message}</p>
              </div>
            </div>
          )}

          {state.kind === 'found' && (
            <div className="space-y-5">
              {/* Summary card */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500">Nomor resi</p>
                    <h2 className="mt-1 break-all text-2xl font-black tracking-tight">{state.data.resi}</h2>
                  </div>
                  <span className="rounded-full bg-brand-emerald-400/15 px-4 py-2 text-sm font-bold text-brand-emerald-200">
                    {state.data.status_label || state.data.status || 'Menunggu update'}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-900 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">
                      <MapPin className="h-3.5 w-3.5" /> Rute
                    </p>
                    <p className="mt-1.5 text-sm font-semibold">
                      {state.data.origin_city || '-'} → {state.data.destination_city || '-'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-900 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">
                      <Clock className="h-3.5 w-3.5" /> Estimasi tiba
                    </p>
                    <p className="mt-1.5 text-sm font-semibold">{formatTime(state.data.estimated_delivery_at)}</p>
                  </div>
                  {state.data.courier_first_name && (
                    <div className="rounded-2xl bg-slate-900 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">
                        <User className="h-3.5 w-3.5" /> Kurir
                      </p>
                      <p className="mt-1.5 text-sm font-semibold">{state.data.courier_first_name}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stepper */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <h3 className="mb-5 text-lg font-black">Status Pengiriman</h3>
                <StatusStepper data={state.data} />
              </div>

              {/* Timeline */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <h3 className="mb-4 text-lg font-black">Riwayat Perjalanan</h3>
                {state.data.timeline && state.data.timeline.length > 0 ? (
                  <ol className="space-y-4">
                    {[...state.data.timeline].reverse().map((entry, index) => {
                      const isFirst = index === 0;
                      return (
                        <li key={`${entry.status}-${index}`} className="flex gap-3">
                          <span
                            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                              isFirst ? 'bg-brand-emerald-400 ring-4 ring-brand-emerald-500/20' : 'bg-slate-600'
                            }`}
                          />
                          <div>
                            <p className={`text-sm ${isFirst ? 'font-bold text-brand-emerald-200' : 'font-semibold text-slate-200'}`}>
                              {entry.label || entry.status}
                            </p>
                            <p className="text-xs text-slate-500">{formatTime(entry.at)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-400">Belum ada riwayat perjalanan.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* CTA login */}
        <div className="mt-10 rounded-3xl border border-brand-emerald-500/20 bg-gradient-to-br from-brand-emerald-500/10 via-white/[0.02] to-transparent p-6 text-center">
          <p className="text-sm text-slate-300">Ingin melihat detail order lengkap?</p>
          <Link
            href="/login"
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-brand-emerald-500 px-6 py-3 text-sm font-black text-slate-950 transition-all hover:bg-brand-emerald-400 active:scale-[0.98]"
          >
            Masuk untuk detail lengkap
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function CekResiPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-slate-950 px-5 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <Skeleton className="h-16 w-full bg-white/10" />
          <Skeleton className="h-24 w-full bg-white/10" />
          <ResiSkeleton />
        </div>
      </main>
    }>
      <CekResiContent />
    </Suspense>
  );
}
