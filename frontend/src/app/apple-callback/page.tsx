'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { completeAppleAuth, clearAppleSession, restoreAppleSession, validateAppleState } from '@/lib/appleAuth';
import { saveChallengeId } from '@/lib/googleAuth';
import { useAuthStore } from '@/store/authStore';
import { useGoogleAuthStore } from '@/store/googleAuthStore';
import { clientLog } from '@/lib/clientLogger';
import { getCustomerWebDeviceId } from '@/lib/customerDevice';
import { exchangeSession } from '@/lib/customerSession';

function AppleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { setCompleting, setRequiresOtp, setRequiresPhone, setError, reset } = useGoogleAuthStore();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    const handleCallback = async () => {
      try {
        setCompleting();
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const idToken = searchParams.get('id_token') ?? hashParams.get('id_token');
        const stateParam = searchParams.get('state') ?? hashParams.get('state');
        const errorParam = searchParams.get('error') ?? hashParams.get('error');
        if (errorParam) throw new Error(errorParam === 'access_denied' ? 'Akses login Apple dibatalkan.' : 'Login Apple gagal. Coba lagi.');
        if (!idToken) throw new Error('Token Apple tidak ditemukan dalam callback. Coba lagi dari halaman login.');
        const session = restoreAppleSession();
        if (!session || !stateParam || !validateAppleState(stateParam)) {
          throw new Error('Permintaan login Apple tidak valid. Mulai ulang dari halaman login.');
        }
        const result = await completeAppleAuth({
          platform: 'web',
          id_token: idToken,
          nonce: session.nonce,
          transaction_id: session.txId,
          device_id: getCustomerWebDeviceId(),
          device_info: { model: 'Browser', os: navigator.platform ?? 'web', app_version: '1.0.0' },
        });
        clearAppleSession();
        switch (result.status) {
          case 'authenticated': {
            const user = await exchangeSession({ access_token: result.access_token }).then((response) => response.user ?? null);
            setAuth(true, user);
            router.replace('/dashboard');
            return;
          }
          case 'requires_step_up_otp': {
            const txId = result.transaction_id ?? session.txId;
            if (result.transaction_id) saveChallengeId(result.transaction_id);
            setRequiresOtp(txId, result.masked_recipient ?? '', result.preferred_channel ?? 'whatsapp', txId);
            router.replace('/otp-verify?flow=google');
            return;
          }
          case 'requires_phone':
            setRequiresPhone(result.email ?? '', result.full_name ?? '', result.transaction_id ?? session.txId, result.otp_required ?? true);
            router.replace('/daftar?flow=google');
            return;
          default:
            throw new Error('Akun Apple belum dapat diproses. Hubungi dukungan pelanggan.');
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat memproses login Apple.';
        clientLog.error('Apple callback error', { error });
        clearAppleSession();
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
      <div className="bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl p-10 shadow-2xl max-w-sm w-full text-center">
        {status === 'processing' ? <><Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-5" /><h1 className="text-xl font-semibold">Memverifikasi akun Apple...</h1><p className="text-sm text-muted-foreground mt-2">Harap tunggu.</p></> : <><ShieldAlert className="h-8 w-8 text-destructive mx-auto mb-5" /><h1 className="text-xl font-semibold">Login Gagal</h1><p className="text-sm text-muted-foreground my-4">{errorMessage}</p><button onClick={() => router.replace('/login')} className="w-full bg-primary text-primary-foreground font-medium py-2.5 rounded-lg">Kembali ke Login</button></>}
      </div>
    </div>
  );
}

export default function AppleCallbackPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}><AppleCallbackContent /></Suspense>;
}
