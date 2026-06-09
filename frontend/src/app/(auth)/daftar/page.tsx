'use client';

/**
 * /daftar/page.tsx
 * Halaman registrasi customer.
 *
 * Mendukung 2 alur:
 *   A. Registrasi normal (email + phone + password)
 *   B. Google registration flow (?flow=google)
 *      → user baru dari Google, hanya perlu nomor HP
 *      → OTP dikirim via Zenziva ke HP tersebut
 *      → setelah verify → sesi dibuat
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  Package,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useGoogleAuthStore } from '@/store/googleAuthStore';
import { sendCustomerOTP, verifyCustomerOTP } from '@/lib/customerOtp';
import { clearGoogleSession } from '@/lib/googleAuth';
import { clientLog } from '@/lib/clientLogger';

const DEVICE_ID_KEY = 'tembus_customer_web_device_id';

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'customer-web-server';
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `customer-web-${crypto.randomUUID()}`;
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

type RegisterStep = 'identity' | 'otp';
type RegisterFlow = 'normal' | 'google';

// ── Reusable input field ──────────────────────────────────────

interface FieldProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  prefix?: string;
}

function Field({ label, icon, value, onChange, type = 'text', placeholder, readOnly, inputMode, prefix }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {label}
      </span>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-4 text-sm font-bold text-foreground/70 select-none pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          inputMode={inputMode}
          placeholder={placeholder}
          readOnly={readOnly}
          className={`w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15 ${
            prefix ? 'pl-12' : ''
          } ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
        />
      </div>
    </label>
  );
}

// ── 6-digit OTP input ─────────────────────────────────────────

interface OtpBoxesProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

function OtpBoxes({ value, onChange, disabled }: OtpBoxesProps) {
  const digits = value.padEnd(6, ' ').split('').slice(0, 6);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    onChange(next.join('').replace(/ /g, ''));
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const next = [...digits];
      if (next[i].trim()) {
        next[i] = ' ';
        onChange(next.join('').replace(/ /g, ''));
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    const focus = Math.min(pasted.length, 5);
    refs.current[focus]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i].trim()}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          aria-label={`Digit OTP ${i + 1}`}
          className="w-12 h-14 text-center text-xl font-bold font-mono rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary transition-all disabled:opacity-50"
        />
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const flow = (searchParams.get('flow') ?? 'normal') as RegisterFlow;

  const setAuth = useAuthStore((s) => s.setAuth);
  const {
    pendingEmail,
    pendingFullName,
    transactionId: googleTransactionId,
    reset: resetGoogleStore,
  } = useGoogleAuthStore();

  const [step, setStep] = useState<RegisterStep>('identity');

  // Normal flow fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // OTP fields (shared between both flows)
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [challengeId, setChallengeId] = useState('');
  const [maskedRecipient, setMaskedRecipient] = useState('');

  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Pre-fill from Google store (flow=google) ──────────────
  useEffect(() => {
    if (flow === 'google') {
      if (pendingEmail) setEmail(pendingEmail);
      if (pendingFullName) setFullName(pendingFullName);
      // If no Google data in store, bounce back to login
      if (!googleTransactionId) {
        router.replace('/login');
      }
    }
  }, [flow, pendingEmail, pendingFullName, googleTransactionId, router]);

  // ── Countdown timer ───────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  // ── Auto-submit OTP when 6 digits filled ─────────────────
  useEffect(() => {
    if (otp.length === 6 && !isSubmitting && step === 'otp') {
      verifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  // ═══════════════════════════════════════════════════════════
  // NORMAL FLOW
  // ═══════════════════════════════════════════════════════════

  const validateNormal = (): string | null => {
    if (fullName.trim().length < 2) return 'Nama lengkap wajib diisi.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Alamat email tidak valid.';
    if (phoneNumber.replace(/\D/g, '').length < 9) return 'Nomor handphone tidak valid.';
    if (password.length < 8) return 'Password minimal 8 karakter.';
    if (password !== confirmPassword) return 'Konfirmasi password tidak sama.';
    return null;
  };

  const startNormalRegistration = async () => {
    const err = validateNormal();
    if (err) { setApiError(err); return; }

    setApiError(null);
    setIsSubmitting(true);
    try {
      await api.post('/auth/customer/register/start', {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone_number: phoneNumber.trim(),
        password,
      });
      setStep('otp');
      setCountdown(60);
    } catch (error: any) {
      setApiError(error.response?.data?.message || error.response?.data?.error || 'Pendaftaran belum berhasil. Coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendNormalOtp = async () => {
    if (countdown > 0) return;
    setApiError(null);
    setIsSubmitting(true);
    try {
      await api.post('/auth/otp/send', { phone_number: email.trim().toLowerCase() });
      setCountdown(60);
    } catch (error: any) {
      setApiError(error.response?.data?.message || error.response?.data?.error || 'OTP belum bisa dikirim ulang.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyNormalOtp = async () => {
    if (!/^\d{6}$/.test(otp)) { setApiError('Masukkan 6 digit OTP.'); return; }

    setApiError(null);
    setIsSubmitting(true);
    try {
      const otpResponse = await api.post('/auth/otp/verify', {
        phone_number: email.trim().toLowerCase(),
        code: otp,
        device_id: getDeviceId(),
        device_info: {
          platform: 'web',
          flow: 'customer-registration',
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        },
      });
      const sessionResponse = await api.post('/auth/web/session/exchange', {
        access_token: otpResponse.data.access_token,
      });
      setAuth(true, sessionResponse.data.user);
      router.push('/dashboard');
    } catch (error: any) {
      setApiError(error.response?.data?.message || error.response?.data?.error || 'Verifikasi OTP gagal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // GOOGLE FLOW
  // ═══════════════════════════════════════════════════════════

  const validateGooglePhone = (): string | null => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 9) return 'Nomor handphone tidak valid (min 9 digit).';
    return null;
  };

  const startGoogleRegistration = async () => {
    const err = validateGooglePhone();
    if (err) { setApiError(err); return; }

    setApiError(null);
    setIsSubmitting(true);
    try {
      const normalized = phoneNumber.startsWith('+') ? phoneNumber : `+62${phoneNumber.replace(/^0/, '')}`;
      const result = await sendCustomerOTP({
        phone_number: normalized,
        channel: 'whatsapp',
        transaction_id: googleTransactionId ?? undefined,
        device_id: getDeviceId(),
      });
      setChallengeId(result.challenge_id);
      setMaskedRecipient(result.masked_recipient);
      setPhoneNumber(normalized);
      setStep('otp');
      setCountdown(result.resend_cooldown_seconds ?? 60);
    } catch (error: unknown) {
      clientLog.error('Google registration OTP send error', { error });
      const msg = error instanceof Error ? error.message : 'OTP belum bisa dikirim. Coba lagi.';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendGoogleOtp = async () => {
    if (countdown > 0) return;
    setApiError(null);
    setIsSubmitting(true);
    try {
      const result = await sendCustomerOTP({
        phone_number: phoneNumber,
        channel: 'whatsapp',
        transaction_id: googleTransactionId ?? undefined,
        device_id: getDeviceId(),
      });
      setChallengeId(result.challenge_id);
      setOtp('');
      setCountdown(result.resend_cooldown_seconds ?? 60);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'OTP belum bisa dikirim ulang.';
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyGoogleOtp = async () => {
    if (!/^\d{6}$/.test(otp)) { setApiError('Masukkan 6 digit OTP.'); return; }
    if (!challengeId) { setApiError('Sesi OTP tidak valid. Minta kode baru.'); return; }

    setApiError(null);
    setIsSubmitting(true);
    try {
      const result = await verifyCustomerOTP({
        challenge_id: challengeId,
        code: otp,
        phone_number: phoneNumber,
        device_id: getDeviceId(),
        device_info: {
          platform: 'web',
          app: 'customer-portal',
          remember_me: false,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: typeof navigator !== 'undefined' ? navigator.language : 'id',
        },
      });

      // Exchange token → web session cookie
      if (result.access_token) {
        const sessionResponse = await api.post('/auth/web/session/exchange', {
          access_token: result.access_token,
        });
        setAuth(true, sessionResponse.data.user);
      } else if (result.user) {
        setAuth(true, result.user);
      }

      clearGoogleSession();
      resetGoogleStore();
      router.push('/dashboard');
    } catch (error: unknown) {
      clientLog.error('Google registration OTP verify error', { error });
      const msg = error instanceof Error ? error.message : 'Verifikasi OTP gagal.';
      setApiError(msg);
      setOtp('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Route to correct handler ──────────────────────────────
  const handleIdentitySubmit = flow === 'google' ? startGoogleRegistration : startNormalRegistration;
  const handleOtpResend = flow === 'google' ? resendGoogleOtp : resendNormalOtp;
  const verifyOtp = flow === 'google' ? verifyGoogleOtp : verifyNormalOtp;

  // ── Steps indicator ───────────────────────────────────────
  const stepLabels =
    flow === 'google'
      ? ['Nomor HP', 'OTP']
      : ['Identitas', 'OTP'];

  const otpSentTo =
    flow === 'google'
      ? (maskedRecipient || phoneNumber)
      : email;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      {/* Background blurs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl shadow-2xl p-8">
          {/* Header */}
          <div className="mb-6 flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
              {flow === 'google' ? (
                <svg className="h-7 w-7" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              ) : (
                <Package className="h-7 w-7 text-primary" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {flow === 'google' ? 'Lengkapi Profil Google' : 'Daftar Customer TEMBUS'}
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {flow === 'google'
                  ? 'Akun Google terdeteksi. Masukkan nomor HP untuk verifikasi.'
                  : 'Satu akun untuk web dan mobile. OTP sebagai verifikasi akhir.'}
              </p>
            </div>
          </div>

          {/* Google account info banner */}
          {flow === 'google' && (fullName || email) && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3"
            >
              <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <UserRound className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                {fullName && <p className="text-sm font-semibold text-foreground truncate">{fullName}</p>}
                {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
              </div>
              <span className="ml-auto text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg shrink-0">
                Google
              </span>
            </motion.div>
          )}

          {/* Step indicator */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            {stepLabels.map((label, i) => {
              const isActive = (i === 0 && step === 'identity') || (i === 1 && step === 'otp');
              const isDone = i === 0 && step === 'otp';
              return (
                <div
                  key={label}
                  className={`rounded-2xl border p-3 transition-all ${
                    isActive
                      ? 'border-primary bg-primary/10'
                      : isDone
                      ? 'border-green-500/30 bg-green-500/5'
                      : 'border-border bg-muted/20'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="mb-1.5 h-4 w-4 text-green-500" />
                  ) : i === 0 ? (
                    <UserRound className="mb-1.5 h-4 w-4 text-primary" />
                  ) : (
                    <ShieldCheck className="mb-1.5 h-4 w-4 text-primary" />
                  )}
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                </div>
              );
            })}
          </div>

          {/* Error */}
          <AnimatePresence>
            {apiError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-5 rounded-2xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive"
                role="alert"
                aria-live="polite"
              >
                {apiError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── STEP: IDENTITY ───────────────────────────────── */}
          <AnimatePresence mode="wait">
            {step === 'identity' && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {flow === 'normal' && (
                  <>
                    <Field
                      label="Nama lengkap"
                      icon={<UserRound className="h-4 w-4 text-muted-foreground" />}
                      value={fullName}
                      onChange={setFullName}
                      placeholder="Yogi Customer"
                    />
                    <Field
                      label="Email"
                      icon={<Mail className="h-4 w-4 text-muted-foreground" />}
                      value={email}
                      onChange={setEmail}
                      type="email"
                      placeholder="customer@tembus.id"
                    />
                  </>
                )}

                <Field
                  label="Nomor handphone"
                  icon={<Phone className="h-4 w-4 text-muted-foreground" />}
                  value={phoneNumber}
                  onChange={(v) => {
                    if (/^[0-9+\-\s]*$/.test(v)) setPhoneNumber(v);
                  }}
                  type="tel"
                  inputMode="tel"
                  placeholder={flow === 'google' ? '812 3456 7890' : '+628123456789'}
                  prefix={flow === 'google' ? '+62' : undefined}
                />

                {flow === 'normal' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Password"
                      icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
                      value={password}
                      onChange={setPassword}
                      type="password"
                      placeholder="Min. 8 karakter"
                    />
                    <Field
                      label="Konfirmasi password"
                      icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      type="password"
                      placeholder="Ulangi password"
                    />
                  </div>
                )}

                {flow === 'google' && (
                  <p className="text-xs text-muted-foreground">
                    Kode OTP akan dikirim via <strong>WhatsApp</strong> ke nomor di atas.
                  </p>
                )}

                <button
                  id="register-submit-btn"
                  type="button"
                  onClick={handleIdentitySubmit}
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-5 w-5" />
                  )}
                  {flow === 'google' ? 'Kirim Kode OTP' : 'Daftar dan Kirim OTP'}
                </button>
              </motion.div>
            )}

            {/* ── STEP: OTP ──────────────────────────────────── */}
            {step === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* OTP sent notice */}
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <p className="font-semibold text-foreground text-sm">OTP terkirim</p>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Kode 6 digit dikirim via{' '}
                    <strong>{flow === 'google' ? 'WhatsApp' : 'email/WhatsApp'}</strong> ke{' '}
                    <strong className="text-foreground">{otpSentTo}</strong>.
                    Berlaku 5 menit.
                  </p>
                </div>

                {/* 6-digit OTP boxes */}
                <OtpBoxes value={otp} onChange={(v) => { setOtp(v); setApiError(null); }} disabled={isSubmitting} />

                {/* Verify button */}
                <button
                  id="otp-verify-btn"
                  type="button"
                  onClick={verifyOtp}
                  disabled={isSubmitting || otp.length < 6}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-5 w-5" />
                  )}
                  Verifikasi dan Masuk
                </button>

                {/* Resend */}
                <button
                  id="otp-resend-btn"
                  type="button"
                  onClick={handleOtpResend}
                  disabled={countdown > 0 || isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted/40 active:scale-[0.98] disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  {countdown > 0 ? `Kirim ulang dalam ${countdown}s` : 'Kirim ulang OTP'}
                </button>

                {/* Back */}
                <button
                  type="button"
                  onClick={() => {
                    setStep('identity');
                    setOtp('');
                    setApiError(null);
                  }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Kembali ubah nomor
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer link */}
          <div className="mt-8 text-center text-sm text-muted-foreground">
            Sudah punya akun?{' '}
            <a
              href="/login"
              onClick={() => { clearGoogleSession(); resetGoogleStore(); }}
              className="font-semibold text-primary hover:underline"
            >
              Masuk
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
