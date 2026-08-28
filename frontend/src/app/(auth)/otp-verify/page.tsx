'use client';

/**
 * /otp-verify/page.tsx
 * OTP verification page — handles both:
 *   - ?flow=google   : step-up OTP after Google sign-in
 *   - ?flow=login    : standalone OTP login
 */

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, ShieldCheck, RefreshCw } from 'lucide-react';
import { verifyCustomerOTP, sendCustomerOTP } from '@/lib/customerOtp';
import { useGoogleAuthStore } from '@/store/googleAuthStore';
import { useAuthStore } from '@/store/authStore';
import { clientLog } from '@/lib/clientLogger';
import { api } from '@/lib/api';

const DEVICE_ID_KEY = 'tembus_customer_web_device_id';

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'customer-web-server';
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `customer-web-${crypto.randomUUID()}`;
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function buildDeviceInfo() {
  return {
    platform: 'web',
    app: 'customer-portal',
    remember_me: false,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
  };
}

// ── 6-digit OTP input component ───────────────────────────────

interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

function OtpInput({ value, onChange, disabled }: OtpInputProps) {
  const digits = value.padEnd(6, '').split('').slice(0, 6);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKey = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const newDigits = [...digits];
      if (newDigits[index] !== '') {
        newDigits[index] = '';
        onChange(newDigits.join('').trimEnd());
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
      }
    }
  };

  const handleChange = (index: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    const newValue = newDigits.join('').trimEnd();
    onChange(newValue);
    if (digit && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, 5);
    refs.current[focusIndex]?.focus();
  };

  return (
    <div className="flex gap-3 justify-center" onPaste={handlePaste}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] === ' ' ? '' : digits[i]}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          className="w-12 h-14 text-center text-xl font-semibold font-mono bg-background/50 border border-border/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60 transition-all text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

function OtpVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const flow = searchParams.get('flow') ?? 'login';
  const setAuth = useAuthStore((s) => s.setAuth);
  const { otpChallengeId, maskedRecipient, preferredChannel, reset: resetGoogleAuth } = useGoogleAuthStore();

  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Guard: if Google flow but no challenge, bounce back
  useEffect(() => {
    if (flow === 'google' && !otpChallengeId) {
      router.replace('/login');
    }
  }, [flow, otpChallengeId, router]);

  // Auto-submit when 6 digits filled
  useEffect(() => {
    if (code.length === 6 && !isVerifying && !success) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleVerify = async () => {
    if (code.length !== 6 || isVerifying) return;
    setIsVerifying(true);
    setError(null);

    try {
      const deviceId = getDeviceId();
      const result = await verifyCustomerOTP({
        challenge_id: otpChallengeId ?? '',
        code,
        phone_number: maskedRecipient ?? '',
        device_id: deviceId,
        device_info: buildDeviceInfo(),
      });

      setSuccess(true);

      if (result.access_token) {
        const user = await api
          .post('/auth/web/session/exchange', { access_token: result.access_token })
          .then((r) => r.data.user);
        setAuth(true, user);
      } else if (result.user) {
        setAuth(true, result.user);
      }

      resetGoogleAuth();
      setTimeout(() => router.replace('/dashboard'), 400);
    } catch (err: unknown) {
      clientLog.error('OTP verify error', { err });
      const msg =
        err instanceof Error
          ? err.message
          : 'Kode OTP tidak valid atau sudah kedaluwarsa.';
      setError(msg);
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (isResending || countdown > 0) return;
    setIsResending(true);
    setError(null);

    try {
      const deviceId = getDeviceId();
      await sendCustomerOTP({
        phone_number: maskedRecipient ?? '',
        channel: (preferredChannel as 'whatsapp' | 'sms') ?? 'whatsapp',
        device_id: deviceId,
      });
      setCountdown(60);
      setCode('');
    } catch (err: unknown) {
      clientLog.error('OTP resend error', { err });
      setError('Gagal mengirim ulang kode. Coba beberapa saat lagi.');
    } finally {
      setIsResending(false);
    }
  };

  const channelLabel = preferredChannel === 'sms' ? 'SMS' : 'WhatsApp';

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 sm:p-8">
      {/* Background blurs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-primary/10 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl p-8 shadow-2xl relative z-10">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <motion.div
              animate={success ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.4 }}
              className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-5 transition-colors ${
                success ? 'bg-green-500/20' : 'bg-primary/20'
              }`}
            >
              <ShieldCheck
                className={`h-7 w-7 transition-colors ${success ? 'text-green-500' : 'text-primary'}`}
              />
            </motion.div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground text-center">
              Verifikasi Kode OTP
            </h1>
            <p className="text-sm text-muted-foreground mt-2 text-center leading-relaxed">
              Kode 6 digit telah dikirim melalui{' '}
              <span className="font-medium text-foreground">{channelLabel}</span> ke{' '}
              <span className="font-medium text-foreground">
                {maskedRecipient || 'nomor yang terdaftar'}
              </span>
            </p>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg p-3 mb-6 text-center"
              role="alert"
              aria-live="polite"
            >
              {error}
            </motion.div>
          )}

          {/* OTP Input */}
          <div className="mb-6">
            <OtpInput value={code} onChange={setCode} disabled={isVerifying || success} />
          </div>

          {/* Verify Button */}
          <button
            id="otp-verify-btn"
            onClick={handleVerify}
            disabled={code.length !== 6 || isVerifying || success}
            className="w-full bg-primary text-primary-foreground font-medium py-3 px-4 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed mb-4"
          >
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Memverifikasi...
              </>
            ) : success ? (
              'Berhasil ✓'
            ) : (
              'Verifikasi'
            )}
          </button>

          {/* Resend */}
          <div className="text-center">
            <button
               id="otp-resend-btn"
              onClick={handleResend}
              disabled={countdown > 0 || isResending}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 mx-auto"
            >
              {isResending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {countdown > 0
                ? `Kirim ulang dalam ${countdown}s`
                : isResending
                ? 'Mengirim...'
                : 'Kirim ulang kode'}
            </button>
          </div>

          {/* Back */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                resetGoogleAuth();
                router.replace('/login');
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Kembali ke Login
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function OtpVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <OtpVerifyContent />
    </Suspense>
  );
}
