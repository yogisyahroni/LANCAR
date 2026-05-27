'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Loader2, Mail, Package, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

type RegisterStep = 'identity' | 'otp';

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [step, setStep] = useState<RegisterStep>('identity');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const validateIdentity = () => {
    if (fullName.trim().length < 2) {
      return 'Nama lengkap wajib diisi.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Alamat email tidak valid.';
    }
    if (phoneNumber.replace(/\D/g, '').length < 9) {
      return 'Nomor handphone tidak valid.';
    }
    if (password.length < 8) {
      return 'Password minimal 8 karakter.';
    }
    if (password !== confirmPassword) {
      return 'Konfirmasi password tidak sama.';
    }
    return null;
  };

  const startRegistration = async () => {
    const validationError = validateIdentity();
    if (validationError) {
      setApiError(validationError);
      return;
    }

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

  const resendOtp = async () => {
    if (countdown > 0) {
      return;
    }
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

  const verifyAndCreateSession = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setApiError('Masukkan 6 digit OTP.');
      return;
    }

    setApiError(null);
    setIsSubmitting(true);
    try {
      const otpResponse = await api.post('/auth/otp/verify', {
        phone_number: email.trim().toLowerCase(),
        code: otp,
        device_id: 'customer-web',
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-lg"
      >
        <div className="rounded-3xl border border-border/50 bg-card shadow-2xl p-8">
          <div className="mb-8 flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Package className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Daftar Customer TEMBUS</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Satu akun untuk customer web dan mobile app. OTP dipakai sebagai verifikasi akhir sebelum sesi dibuat.
              </p>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3">
            <div className={`rounded-2xl border p-4 ${step === 'identity' ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'}`}>
              <UserRound className="mb-2 h-5 w-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">Identitas</p>
              <p className="text-xs text-muted-foreground">Email, nomor, password</p>
            </div>
            <div className={`rounded-2xl border p-4 ${step === 'otp' ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'}`}>
              <ShieldCheck className="mb-2 h-5 w-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">OTP</p>
              <p className="text-xs text-muted-foreground">Aktivasi sesi aman</p>
            </div>
          </div>

          {apiError && (
            <div className="mb-6 rounded-2xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
              {apiError}
            </div>
          )}

          {step === 'identity' ? (
            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UserRound className="h-4 w-4 text-muted-foreground" /> Nama lengkap
                </span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15"
                  placeholder="Yogi Customer"
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Mail className="h-4 w-4 text-muted-foreground" /> Email
                </span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15"
                  placeholder="customer@tembus.id"
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Phone className="h-4 w-4 text-muted-foreground" /> Nomor handphone
                </span>
                <input
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  type="tel"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15"
                  placeholder="+628123456789"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15"
                  placeholder="Password"
                />
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15"
                  placeholder="Ulangi password"
                />
              </div>

              <button
                type="button"
                onClick={startRegistration}
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                Daftar dan kirim OTP
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-muted/20 p-5">
                <div className="mb-3 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <p className="font-semibold text-foreground">OTP dikirim ke {email}</p>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Masukkan kode 6 digit untuk mengaktifkan akun dan membuat sesi customer web.
                </p>
              </div>

              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                className="w-full rounded-2xl border border-border bg-background px-4 py-4 text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15"
                placeholder="000000"
              />

              <button
                type="button"
                onClick={verifyAndCreateSession}
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 py-4 font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                Verifikasi dan masuk
              </button>

              <button
                type="button"
                onClick={resendOtp}
                disabled={countdown > 0 || isSubmitting}
                className="w-full rounded-2xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted/40 active:scale-[0.98] disabled:opacity-50"
              >
                {countdown > 0 ? `Kirim ulang OTP (${countdown})` : 'Kirim ulang OTP'}
              </button>
            </div>
          )}

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Sudah punya akun?{' '}
            <a href="/login" className="font-semibold text-primary hover:underline">
              Masuk
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
