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
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
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
      <div className="flex items-start gap-3 rounded-xl border border-error bg-error-surface p-4">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-error" />
        <div>
          <p className="text-sm font-bold text-error">Kiriman tidak aktif</p>
          <p className="mt-1 text-xs text-error">
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
                    ? 'flex h-8 w-8 items-center justify-center rounded-full bg-success text-on-success'
                    : 'flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface/[0.04] text-foreground-muted'
                }
              >
                {reached ? <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> : <Circle aria-hidden="true" className="h-4 w-4" />}
              </span>
              <span
                className={`max-w-[72px] text-center text-xs font-semibold leading-tight sm:max-w-none sm:text-xs ${
                  reached ? 'text-success' : 'text-foreground-muted'
                }`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                aria-hidden="true"
                className={`mx-1 mb-4 h-0.5 flex-1 rounded sm:mx-2 ${
                  currentIndex > index ? 'bg-success' : 'bg-surface-subtle'
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
      <Skeleton className="h-16 w-full bg-surface-subtle" />
      <Skeleton className="h-28 w-full bg-surface-subtle" />
      <Skeleton className="h-48 w-full bg-surface-subtle" />
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
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-8">
        <header className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/tembusweb.svg" alt="TEMBUS" className="h-8 object-contain" />
          </Link>
          <nav aria-label="Breadcrumb" className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-foreground-muted transition-colors hover:text-foreground">
              Beranda
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-border px-3.5 py-1.5 font-bold text-foreground-muted transition-all hover:bg-surface-subtle"
            >
              Masuk
            </Link>
          </nav>
        </header>

        <div className="rounded-3xl border border-success/20 bg-success-surface p-3 text-success w-fit">
          <PackageSearch aria-hidden="true" className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight">Lacak Kiriman</h1>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          Masukkan nomor resi untuk melihat status dan riwayat perjalanan paketmu.
        </p>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="mt-6" noValidate>
          <label
            htmlFor="cek-resi-input"
            className="mb-2 block text-xs font-bold uppercase tracking-wide text-foreground-muted"
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
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface/[0.06] px-4 py-3 text-sm font-semibold uppercase tracking-wide outline-none transition-all placeholder:normal-case placeholder:text-foreground-muted focus:border-success/60 focus:ring-2 focus:ring-focus-ring"
            />
            <button
              type="submit"
              disabled={state.kind === 'loading'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-success px-6 py-3 text-sm font-black text-on-success transition-all hover:bg-success active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
            >
              {state.kind === 'loading' ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Mencari…
                </>
              ) : (
                'Cari'
              )}
            </button>
          </div>
          <p id="cek-resi-help" className="mt-2 text-xs text-foreground-muted">
            Hanya huruf, angka, dan tanda hubung (maksimal 40 karakter).
          </p>
        </form>

        {/* Results */}
        <div className="mt-8 space-y-5" aria-live="polite" aria-busy={state.kind === 'loading'}>
          {state.kind === 'loading' && <ResiSkeleton />}

          {state.kind === 'idle' && (
            <div className="rounded-3xl border border-border bg-surface/[0.04] p-6 text-sm text-foreground-muted">
              Hasil pelacakan akan muncul di sini setelah kamu mencari nomor resi.
            </div>
          )}

          {(state.kind === 'not_found') && (
            <div role="alert" aria-live="assertive" className="flex items-start gap-3 rounded-3xl border border-border bg-surface/[0.04] p-6">
              <SearchX aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-accent" />
              <div>
                <h2 className="text-lg font-black">Resi tidak ditemukan</h2>
                <p className="mt-1.5 text-sm leading-6 text-foreground-muted">
                  Pastikan nomor resi sudah benar, atau hubungi pengirim untuk konfirmasi.
                </p>
              </div>
            </div>
          )}

          {state.kind === 'unavailable' && (
            <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-3xl border border-border bg-surface/[0.04] p-6">
              <Clock aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
              <div>
                <h2 className="text-lg font-black">Layanan sedang dipersiapkan</h2>
                <p className="mt-1.5 text-sm leading-6 text-foreground-muted">
                  {state.message ||
                    'Pelacakan resi publik belum tersedia. Coba lagi beberapa saat kemudian.'}
                </p>
              </div>
            </div>
          )}

          {state.kind === 'error' && (
            <div role="alert" aria-live="assertive" className="flex items-start gap-3 rounded-3xl border border-error bg-error-surface p-6">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-error" />
              <div>
                <h2 className="text-lg font-bold text-error">Gagal memuat</h2>
                <p className="mt-1.5 text-sm leading-6 text-error">{state.message}</p>
              </div>
            </div>
          )}

          {state.kind === 'found' && (
            <div className="space-y-5">
              {/* Summary card */}
              <div className="rounded-3xl border border-border bg-surface/[0.04] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-foreground-muted">Nomor resi</p>
                    <h2 className="mt-1 break-all text-2xl font-black tracking-tight">{state.data.resi}</h2>
                  </div>
                  <OrderStatusBadge
                    status={state.data.status}
                    label={state.data.status_label || undefined}
                    className="px-4 py-2 text-sm"
                  />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-surface p-4">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground-muted">
                      <MapPin aria-hidden="true" className="h-3.5 w-3.5" /> Rute
                    </p>
                    <p className="mt-1.5 text-sm font-semibold">
                      {state.data.origin_city || '-'} → {state.data.destination_city || '-'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-surface p-4">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground-muted">
                        <Clock aria-hidden="true" className="h-3.5 w-3.5" /> Estimasi tiba
                    </p>
                    <p className="mt-1.5 text-sm font-semibold">{formatTime(state.data.estimated_delivery_at)}</p>
                  </div>
                  {state.data.courier_first_name && (
                    <div className="rounded-2xl bg-surface p-4">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-foreground-muted">
                        <User aria-hidden="true" className="h-3.5 w-3.5" /> Kurir
                      </p>
                      <p className="mt-1.5 text-sm font-semibold">{state.data.courier_first_name}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stepper */}
              <div className="rounded-3xl border border-border bg-surface/[0.04] p-6">
                <h3 className="mb-5 text-lg font-black">Status Pengiriman</h3>
                <StatusStepper data={state.data} />
              </div>

              {/* Timeline */}
              <div className="rounded-3xl border border-border bg-surface/[0.04] p-6">
                <h3 className="mb-4 text-lg font-black">Riwayat Perjalanan</h3>
                {state.data.timeline && state.data.timeline.length > 0 ? (
                  <ol className="space-y-4">
                    {[...state.data.timeline].reverse().map((entry, index) => {
                      const isFirst = index === 0;
                      return (
                        <li key={`${entry.status}-${index}`} className="flex gap-3">
                          <span
                            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                              isFirst ? 'bg-success ring-4 ring-focus-ring' : 'bg-surface-subtle'
                            }`}
                          />
                          <div>
                            <p className={`text-sm ${isFirst ? 'font-bold text-success' : 'font-semibold text-foreground-muted'}`}>
                              {entry.label || entry.status}
                            </p>
                            <p className="text-xs text-foreground-muted">{formatTime(entry.at)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-foreground-muted">Belum ada riwayat perjalanan.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* CTA login */}
        <div className="mt-10 rounded-3xl border border-success/20 bg-gradient-to-br from-primary/10 via-foreground/20/[0.02] to-transparent p-6 text-center">
          <p className="text-sm text-foreground-muted">Ingin melihat detail order lengkap?</p>
          <Link
            href="/login"
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-success px-6 py-3 text-sm font-black text-on-success transition-all hover:bg-success active:scale-[0.98]"
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
      <main className="min-h-screen bg-background px-5 py-8" aria-hidden="true">
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <Skeleton className="h-16 w-full bg-surface-subtle" />
          <Skeleton className="h-24 w-full bg-surface-subtle" />
          <ResiSkeleton />
        </div>
      </main>
    }>
      <CekResiContent />
    </Suspense>
  );
}
