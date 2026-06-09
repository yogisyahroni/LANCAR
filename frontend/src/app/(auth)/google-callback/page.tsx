'use client';

/**
 * /google-callback/page.tsx
 * Handles the OAuth redirect from Google.
 * Validates state param → calls backend /google/complete → routes to next step.
 */

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, ShieldAlert } from 'lucide-react';
import {
  completeGoogleAuth,
  clearGoogleSession,
  restoreGoogleSession,
  validateStateParam,
  saveChallengeId,
} from '@/lib/googleAuth';
import { useAuthStore } from '@/store/authStore';
import { useGoogleAuthStore } from '@/store/googleAuthStore';
import { clientLog } from '@/lib/clientLogger';
import { api } from '@/lib/api';

const CUSTOMER_WEB_DEVICE_ID_KEY = 'tembus_customer_web_device_id';

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'customer-web-server';
  const existing = window.localStorage.getItem(CUSTOMER_WEB_DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `customer-web-${crypto.randomUUID()}`;
  window.localStorage.setItem(CUSTOMER_WEB_DEVICE_ID_KEY, id);
  return id;
}

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { setCompleting, setRequiresOtp, setRequiresPhone, setError, reset } = useGoogleAuthStore();

  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  // Guard: only run once
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const handleCallback = async () => {
      try {
        setCompleting();

        // ── 1. Extract callback params ──────────────────────────
        const idToken = searchParams.get('id_token') ?? searchParams.get('credential');
        const stateParam = searchParams.get('state');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          throw new Error(
            errorParam === 'access_denied'
              ? 'Akses ditolak. Kamu membatalkan proses login Google.'
              : 'Login Google gagal. Coba lagi.'
          );
        }

        if (!idToken) {
          throw new Error('Token Google tidak ditemukan dalam callback. Coba lagi dari halaman login.');
        }

        // ── 2. CSRF state validation — WAJIB, tidak boleh di-skip ──────────
        // S-CW-01 FIX: state param harus selalu ada dan valid.
        // Sebelumnya: `if (stateParam && ...)` — jika tidak ada state, validasi di-skip.
        // Setelah fix: state param tidak ada = request ditolak sepenuhnya.
        const session = restoreGoogleSession();
        if (!session) {
          throw new Error('Sesi login tidak ditemukan. Kembali ke halaman login dan coba lagi.');
        }

        if (!stateParam) {
          clientLog.error('Google callback: state param missing — possible attack or broken flow', {
            hasIdToken: Boolean(idToken),
            hasSession: Boolean(session),
          });
          throw new Error('Parameter keamanan tidak ditemukan. Mulai ulang proses login dari halaman awal.');
        }

        if (!validateStateParam(stateParam)) {
          clientLog.error('Google callback: state mismatch (possible CSRF)', {
            hasStateParam: true,
            hasSession: Boolean(session),
          });
          throw new Error('Permintaan tidak valid. Kembali ke halaman login dan coba lagi.');
        }

        // ── 3. Complete auth with backend ─────────────────────
        const deviceId = getDeviceId();
        const result = await completeGoogleAuth({
          platform: 'web',
          id_token: idToken,
          nonce: session.nonce,
          transaction_id: session.txId,
          device_id: deviceId,
          device_info: {
            model: 'Browser',
            os: navigator.platform ?? 'web',
            app_version: '1.0.0',
          },
        });

        clearGoogleSession();

        // ── 4. Route based on status ──────────────────────────
        switch (result.status) {
          case 'authenticated': {
            // Exchange access token for web session cookie
            const user = await api
              .post('/auth/web/session/exchange', { access_token: result.access_token })
              .then((r) => r.data.user);
            setAuth(true, user);
            router.replace('/dashboard');
            break;
          }

          case 'requires_step_up_otp': {
            // Need phone OTP before completing login
            const txId = result.transaction_id ?? session.txId;
            if (result.transaction_id) {
              saveChallengeId(result.transaction_id);
            }
            setRequiresOtp(
              result.transaction_id ?? '',
              result.masked_recipient ?? '',
              result.preferred_channel ?? 'whatsapp',
              txId
            );
            router.replace('/otp-verify?flow=google');
            break;
          }

          case 'requires_phone': {
            // New Google user — need to collect phone number
            const txId = result.transaction_id ?? session.txId;
            setRequiresPhone(result.email ?? '', result.full_name ?? '', txId);
            router.replace('/daftar?flow=google');
            break;
          }

          case 'blocked':
            throw new Error('Akun kamu sementara tidak dapat diakses. Hubungi dukungan pelanggan.');

          default:
            throw new Error('Respons tidak dikenal dari server. Coba lagi.');
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Terjadi kesalahan saat memproses login Google. Coba lagi.';
        clientLog.error('Google callback error', { err });
        clearGoogleSession();
        reset();
        setError(message);
        setStatus('error');
        setErrorMessage(message);
      }
    };

    handleCallback();
  }, [searchParams, setAuth, setCompleting, setRequiresOtp, setRequiresPhone, setError, reset, router]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      {/* Background decorative blurs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl p-10 shadow-2xl max-w-sm w-full text-center relative z-10"
      >
        {status === 'processing' ? (
          <>
            <div className="h-14 w-14 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground mb-2">
              Memverifikasi akun Google...
            </h1>
            <p className="text-sm text-muted-foreground">
              Harap tunggu. Jangan tutup halaman ini.
            </p>
          </>
        ) : (
          <>
            <div className="h-14 w-14 bg-destructive/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="h-7 w-7 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground mb-2">
              Login Gagal
            </h1>
            <p className="text-sm text-muted-foreground mb-6">{errorMessage}</p>
            <button
              onClick={() => router.replace('/login')}
              className="w-full bg-primary text-primary-foreground font-medium py-2.5 px-4 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all duration-200"
            >
              Kembali ke Login
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <GoogleCallbackContent />
    </Suspense>
  );
}
