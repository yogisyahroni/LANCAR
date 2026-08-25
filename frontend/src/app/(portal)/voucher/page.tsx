'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BadgePercent,
  CalendarClock,
  Loader2,
  RefreshCw,
  Ticket,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clientLog } from '@/lib/clientLogger';
import { Skeleton } from '@/components/ui/Skeleton';

interface EligiblePromo {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  expires_at?: string | null;
  valid_until?: string | null;
  min_spend_idr?: number | null;
  min_amount_idr?: number | null;
}

interface PromoQuote {
  eligible?: boolean;
  reason?: string | null;
  discount_idr?: number | null;
}

const CODE_PATTERN = /^[A-Z0-9_-]{1,40}$/;

const formatIdDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(parsed);
};

const extractArray = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    const inner = (payload as Record<string, unknown>).data;
    if (Array.isArray(inner)) return inner;
  }
  return [];
};

// The eligible-promos endpoint is service-scoped in the order flow; try a
// service-agnostic call first, then fan out over available services as fallback.
async function loadEligiblePromos(): Promise<{ promos: EligiblePromo[]; failed: boolean }> {
  let collected: EligiblePromo[] = [];
  let firstCallFailed = false;

  try {
    const direct = await api.get('/customer/promos/eligible', { params: { limit: 24 } });
    collected = extractArray(direct.data) as EligiblePromo[];
  } catch (error) {
    firstCallFailed = true;
    clientLog.warn('Direct eligible promo fetch failed, will try per-service', { error });
  }

  if (collected.length > 0 || (!firstCallFailed && collected.length === 0)) {
    // Service-agnostic call answered — trust its result either way.
    return { promos: dedupe(collected), failed: false };
  }

  try {
    const servicesRes = await api.get('/auth/web/delivery-services');
    const rawServices = extractArray(servicesRes.data);
    const serviceCodes = rawServices
      .map((s) => {
        const svc = s as Record<string, unknown>;
        return typeof svc.code === 'string' ? svc.code : typeof svc.service_code === 'string' ? svc.service_code : '';
      })
      .filter(Boolean)
      .slice(0, 8);

    if (serviceCodes.length === 0) {
      return { promos: [], failed: true };
    }

    const results = await Promise.allSettled(
      serviceCodes.map((code) =>
        api
          .get('/customer/promos/eligible', { params: { service_code: code, limit: 12 } })
          .then((res) => extractArray(res.data) as EligiblePromo[])
      )
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        collected = [...collected, ...result.value];
      }
    }
    return { promos: dedupe(collected), failed: false };
  } catch (error) {
    clientLog.warn('Per-service eligible promo fetch failed', { error });
    return { promos: dedupe(collected), failed: true };
  }
}

function dedupe(promos: EligiblePromo[]): EligiblePromo[] {
  const seen = new Set<string>();
  return promos.filter((promo) => {
    if (!promo?.code || seen.has(promo.code)) return false;
    seen.add(promo.code);
    return true;
  });
}

export default function VoucherPage() {
  const [promos, setPromos] = useState<EligiblePromo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [codeInput, setCodeInput] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchPromos = useCallback(async () => {
    setIsLoading(true);
    setLoadFailed(false);
    const { promos: list, failed } = await loadEligiblePromos();
    setPromos(list);
    setLoadFailed(failed && list.length === 0);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchPromos();
  }, [fetchPromos]);

  const handleCheckCode = async () => {
    const code = codeInput.trim().toUpperCase();
    setCheckMessage(null);
    if (!code) {
      setCheckMessage({ ok: false, text: 'Masukkan kode voucher terlebih dahulu.' });
      return;
    }
    if (!CODE_PATTERN.test(code)) {
      setCheckMessage({ ok: false, text: 'Kode hanya boleh huruf, angka, garis bawah, dan tanda hubung.' });
      return;
    }

    setIsChecking(true);
    try {
      const response = await api.post('/auth/web/promos/validate', { code });
      const quote = (response.data?.data ?? {}) as PromoQuote;
      if (quote.eligible) {
        setCheckMessage({
          ok: true,
          text: `Kode valid!${quote.discount_idr ? ` Kamu bisa hemat Rp ${quote.discount_idr.toLocaleString('id-ID')}.` : ''}`,
        });
      } else {
        setCheckMessage({ ok: false, text: quote.reason || 'Kode belum dapat digunakan saat ini.' });
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; error?: string } } };
      setCheckMessage({
        ok: false,
        text:
          err.response?.data?.message ||
          err.response?.data?.error ||
          'Kode belum bisa diverifikasi. Coba lagi nanti.',
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-foreground">
            <span className="rounded-2xl bg-primary-soft p-2.5 text-primary dark:bg-primary/20 dark:text-emerald-300">
              <Ticket className="h-6 w-6" />
            </span>
            Voucher &amp; Promo
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Kumpulan promo aktif yang bisa kamu pakai saat membuat order.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchPromos()}
          disabled={isLoading}
          aria-label="Muat ulang daftar promo"
          className="flex items-center gap-2 rounded-xl border border-black/10 bg-black/5 px-4 py-2.5 text-sm font-bold text-zinc-600 transition-all hover:bg-black/10 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      {/* Check code input */}
      <section className="glass-card rounded-2xl p-5" aria-labelledby="cek-kode-title">
        <h2 id="cek-kode-title" className="flex items-center gap-2 text-sm font-bold text-foreground">
          <BadgePercent className="h-4 w-4 text-emerald-500" />
          Punya kode voucher?
        </h2>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCheckCode();
          }}
          noValidate
        >
          <label htmlFor="voucher-code-input" className="sr-only">
            Kode voucher
          </label>
          <input
            id="voucher-code-input"
            type="text"
            autoComplete="off"
            maxLength={40}
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value.toUpperCase());
              if (checkMessage) setCheckMessage(null);
            }}
            placeholder="KETIK KODE DI SINI"
            aria-describedby="voucher-check-message"
            aria-invalid={checkMessage && !checkMessage.ok ? true : undefined}
            className="min-w-0 flex-1 rounded-xl border border-black/10 bg-background px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-foreground outline-none transition-all placeholder:normal-case placeholder:text-muted-foreground focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/20"
          />
          <button
            type="submit"
            disabled={isChecking}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-2.5 text-sm font-bold text-emerald-700 transition-all hover:bg-emerald-500/20 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 dark:text-emerald-200"
          >
            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cek Kode'}
          </button>
        </form>
        {checkMessage && (
          <p
            id="voucher-check-message"
            role={checkMessage.ok ? 'status' : 'alert'}
            className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
              checkMessage.ok
                ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                : 'border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200'
            }`}
          >
            {checkMessage.text}
          </p>
        )}
      </section>

      {/* Promo list */}
      <section aria-labelledby="daftar-promo-title" className="mt-8">
        <h2 id="daftar-promo-title" className="mb-4 text-lg font-black tracking-tight text-foreground">
          Promo Aktif Untukmu
        </h2>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : loadFailed ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Ticket className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">Gagal memuat promo</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Layanan promo sedang tidak tersedia. Coba muat ulang beberapa saat lagi.
            </p>
          </div>
        ) : promos.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Ticket className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">Belum ada promo aktif</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pantau halaman ini secara berkala untuk promo terbaru.
            </p>
          </div>
        ) : (
          <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {promos.map((promo, index) => {
              const expiry = formatIdDate(promo.expires_at || promo.valid_until);
              const minSpend =
                typeof promo.min_spend_idr === 'number'
                  ? promo.min_spend_idr
                  : typeof promo.min_amount_idr === 'number'
                    ? promo.min_amount_idr
                    : null;
              return (
                <motion.li
                  key={promo.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.3) }}
                >
                  <article className="glass-card relative h-full overflow-hidden rounded-2xl p-5">
                    <div
                      aria-hidden="true"
                      className="absolute right-0 top-0 h-16 w-16 translate-x-6 -translate-y-6 rounded-full bg-primary/10 dark:bg-emerald-500/10"
                    />
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
                        {promo.code}
                      </span>
                      <BadgePercent className="h-5 w-5 shrink-0 text-emerald-500" />
                    </div>
                    <h3 className="mt-3 line-clamp-2 text-sm font-bold text-foreground">{promo.name}</h3>
                    {promo.description && (
                      <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-muted-foreground">
                        {promo.description}
                      </p>
                    )}
                    <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {minSpend !== null && minSpend > 0 && (
                        <div className="flex items-center gap-1.5">
                          <dt className="sr-only">Minimum belanja</dt>
                          <Wallet className="h-3.5 w-3.5 shrink-0" />
                          <dd>Min. transaksi Rp {minSpend.toLocaleString('id-ID')}</dd>
                        </div>
                      )}
                      {expiry && (
                        <div className="flex items-center gap-1.5">
                          <dt className="sr-only">Berlaku sampai</dt>
                          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                          <dd>Berlaku s.d. {expiry}</dd>
                        </div>
                      )}
                    </dl>
                    <Link
                      href={`/orders/new?promo=${encodeURIComponent(promo.code)}`}
                      className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-white transition-all hover:bg-primary-light active:scale-[0.98]"
                    >
                      Pakai Sekarang
                    </Link>
                  </article>
                </motion.li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Note */}
      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        Catatan: kode promo diverifikasi ulang oleh server saat checkout beserta nominal
        transaksimu, sehingga kelayakan final bisa berbeda dari ringkasan di atas.
      </p>
    </div>
  );
}
