'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  CarFront,
  CircleHelp,
  Eye,
  EyeOff,
  Headset,
  KeyRound,
  Loader2,
  Mail,
  Package,
  Phone,
  ShieldCheck,
  Utensils,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { clientLog } from '@/lib/clientLogger';
import { customerGoogleAuthUrl } from '@/lib/runtimeConfig';
import { useAuthStore } from '@/store/authStore';
import { startGoogleAuth } from '@/lib/googleAuth';
import { startAppleAuth } from '@/lib/appleAuth';
import { getCustomerWebDeviceId, buildCustomerWebDeviceInfo } from '@/lib/customerDevice';
import { exchangeSession } from '@/lib/customerSession';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/messages';

const createLoginSchema = (t: (key: MessageKey) => string) => z.object({
  // LGN-03: Email max length prevents oversized payload; format enforced by Zod
  email: z
    .string()
    .email(t('auth.emailInvalid'))
    .max(255, t('auth.emailTooLong'))
    .optional()
    .or(z.literal('')),
  // LGN-03: Password constraints — min 8 already enforced by backend
  password: z
    .string()
    .min(1, t('auth.passwordRequired'))
    .max(128, t('auth.passwordTooLong'))
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .min(8, t('auth.phoneMinimum'))
    .max(20, t('auth.phoneTooLong'))
    .optional()
    .or(z.literal('')),
  // LGN-03: OTP must be EXACTLY 6 numeric digits — blocks non-digit injection
  otp: z
    .string()
    .length(6, t('auth.otpExact'))
    .regex(/^\d{6}$/, t('auth.otpNumeric'))
    .optional()
    .or(z.literal('')),
});

type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>;

const getApiErrorMessage = (error: any, fallback: string) => {
  const data = error.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  return data?.message || data?.error || fallback;
};

export default function LoginPage() {
  const { t } = useI18n();
  const loginSchema = useMemo(() => createLoginSchema(t), [t]);
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');

  // OTP-specific states
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [pendingOtpIdentifier, setPendingOtpIdentifier] = useState<string | null>(null);

  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reason') === 'session-expired') {
      setApiError(t('auth.sessionExpired'));
    }
  }, [t]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  });

  const emailValue = watch('email');
  const passwordValue = watch('password');
  const phoneValue = watch('phone');
  const otpValue = watch('otp');

  // Countdown timer for Resend OTP
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendOtp = async () => {
    const identifier = pendingOtpIdentifier || phoneValue;
    if (!identifier || identifier.length < 8) {
      setApiError(t('auth.identifierRequired'));
      return;
    }
    setApiError(null);
    setIsSendingOtp(true);
    try {
      await api.post('/auth/otp/send', { phone_number: identifier });
      setOtpSent(true);
      setCountdown(60);
    } catch (error: any) {
      clientLog.error('OTP send error', { error });
      setApiError(getApiErrorMessage(error, t('auth.sendOtpFailed')));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const createWebSessionFromCustomerToken = async (accessToken: string) => {
    const data = await exchangeSession({ access_token: accessToken });
    return data.user ?? null;
  };

  const onSubmit = async (data: LoginFormValues) => {
    setApiError(null);
    try {
      if (loginMethod === 'password') {
        if (!data.email || !data.password) {
          setApiError(t('auth.emailPasswordRequired'));
          return;
        }
        const deviceId = getCustomerWebDeviceId();
        const response = await api.post('/auth/customer/login/start', {
          email: data.email,
          password: data.password,
          device_id: deviceId,
          device_info: buildCustomerWebDeviceInfo(rememberMe),
        });

        if (response.data?.require_otp) {
          setPendingOtpIdentifier(data.email);
          setOtpSent(true);
          setCountdown(60);
          setLoginMethod('otp');
          const reason = response.data?.otp_reason === 'new_device' ? t('auth.newDevice') : t('auth.registration');
          setApiError(t('auth.otpVerificationRequired', { reason }));
          return;
        }

        const accessToken = response.data?.access_token;
        if (!accessToken) {
          setApiError(t('auth.sessionTokenUnavailable'));
          return;
        }

        const user = await createWebSessionFromCustomerToken(accessToken);
        setAuth(true, user);
        router.push('/dashboard');
      } else {
        if (!otpSent) {
          await handleSendOtp();
          return;
        }

        const identifier = pendingOtpIdentifier || data.phone;
        if (!identifier || !data.otp) {
          setApiError(t('auth.otpLoginRequired'));
          return;
        }
        const deviceId = getCustomerWebDeviceId();
        const response = await api.post('/auth/otp/verify', {
          phone_number: identifier,
          code: data.otp,
          device_id: deviceId,
          device_info: buildCustomerWebDeviceInfo(rememberMe),
        });
        const user = await createWebSessionFromCustomerToken(response.data.access_token);
        setAuth(true, user);
        router.push('/dashboard');
      }
    } catch (error: any) {
      clientLog.error('Login error', { error });
      setApiError(getApiErrorMessage(error, t('auth.unexpectedError')));
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setApiError(null);
      const deviceId = getCustomerWebDeviceId();
      const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/google-callback` : undefined;
      const response = await startGoogleAuth(deviceId, redirectUri);
      
      if (response.authorization_url) {
        window.location.href = response.authorization_url;
      } else {
        setApiError(t('auth.googleLinkFailed'));
      }
    } catch (error: any) {
      clientLog.error('Google Auth Start Error', { error });
      setApiError(getApiErrorMessage(error, t('auth.googleStartFailed')));
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setApiError(null);
      const deviceId = getCustomerWebDeviceId();
      const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/apple-callback` : undefined;
      const response = await startAppleAuth(deviceId, redirectUri);
      if (response.authorization_url) {
        window.location.href = response.authorization_url;
      } else {
        setApiError(t('auth.appleLinkFailed'));
      }
    } catch (error: any) {
      clientLog.error('Apple Auth Start Error', { error });
      setApiError(getApiErrorMessage(error, t('auth.appleStartFailed')));
    }
  };

  const serviceCards = [
    { title: 'Paket', description: 'Kirim barang lebih mudah', icon: Package },
    { title: 'Food', description: 'Pesan makanan favoritmu', icon: Utensils },
    { title: 'Tambal Ban', description: 'Solusi ban bocor di jalan', icon: Wrench },
    { title: 'Towing', description: 'Bantuan darurat kapan saja', icon: CarFront },
  ];

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#001d15] text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/login-tembus-futuristic-city.png')" }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,31,22,0.72)_0%,rgba(0,48,34,0.53)_45%,rgba(0,25,18,0.92)_100%)]" />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,20,15,0.26)_0%,rgba(0,28,20,0.12)_46%,rgba(0,15,11,0.72)_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1720px] flex-col px-5 py-5 sm:px-8 sm:py-7 lg:px-12 xl:px-16">
        <header className="flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-4" aria-label="TEMBUS beranda">
            <img src="/tembus-logo-dark.svg" alt="TEMBUS" className="h-10 w-auto object-contain sm:h-12" />
            <span className="hidden h-7 w-px bg-emerald-100/25 sm:block" />
            <span className="hidden text-sm text-emerald-50/70 sm:block">Kirim Aman, Sampai Tujuan.</span>
          </Link>

          <div className="flex items-center gap-3 text-sm text-emerald-50/85 sm:gap-5">
            <a href="#bantuan" className="hidden items-center gap-2 hover:text-white sm:flex">
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
              <span>Butuh bantuan?</span>
            </a>
            <a
              href="#bantuan"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 px-4 py-2 font-medium transition hover:bg-emerald-300/10 hover:text-white"
            >
              <Headset className="h-4 w-4" aria-hidden="true" />
              <span>Hubungi Kami</span>
            </a>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(490px,0.92fr)] lg:gap-16 lg:py-12">
          <motion.section
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="flex min-h-[590px] flex-col justify-between lg:py-12"
          >
            <div className="max-w-2xl pt-4 lg:pt-10">
              <p className="mb-3 text-lg font-medium text-emerald-200/80 sm:text-xl">Solusi mobilitas untuk kebutuhan harianmu</p>
              <h2 className="text-5xl font-extrabold leading-[0.98] tracking-[-0.04em] text-white sm:text-6xl lg:text-[4.25rem]">
                Selamat Datang di
                <span className="block text-emerald-400">TEMBUS</span>
              </h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-emerald-50/85 sm:text-lg sm:leading-8">
                Solusi pengiriman dan layanan on-demand untuk kebutuhan harian Anda.
              </p>
            </div>

            <div className="mt-12">
              <div className="grid max-w-[620px] grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                {serviceCards.map(({ title, description, icon: Icon }) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-emerald-300/25 bg-[#003d2b]/40 p-3.5 backdrop-blur-sm transition hover:-translate-y-1 hover:border-emerald-300/60 hover:bg-[#00553c]/55 sm:p-4"
                  >
                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100/15 text-emerald-300">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-emerald-50/70">{description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex items-center gap-4 text-xs text-emerald-50/65">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                <span>Transaksi aman &amp; terpercaya</span>
                <span className="h-4 w-px bg-emerald-100/25" />
                <span>Powered by TEMBUS</span>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08, ease: 'easeOut' }}
            className="w-full max-w-[590px] justify-self-center lg:justify-self-end"
          >
            <div className="rounded-[22px] border border-emerald-300/55 bg-[#001f17]/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-8 lg:p-10">
              <div className="mb-7 flex flex-col items-center text-center">
                <img
                  data-testid="tembus-login-logo"
                  src="/tembus-logo-dark.svg"
                  alt="TEMBUS"
                  className="mb-5 h-12 w-auto object-contain sm:h-14"
                />
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t('auth.loginTitle')}</h1>
                <p className="mt-2 text-sm text-emerald-50/70 sm:text-base">Akses akun Anda untuk melanjutkan perjalanan.</p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {apiError && (
                  <motion.div
                    data-testid="customer-login-error"
                    id="customer-login-error"
                    role="alert"
                    aria-live="polite"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="rounded-xl border border-red-300/35 bg-red-950/35 p-3 text-sm text-red-100"
                  >
                    {apiError}
                  </motion.div>
                )}

                <AnimatePresence mode="wait">
                  {loginMethod === 'password' ? (
                    <motion.div
                      key="password-fields"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5"
                    >
                      <div className="space-y-2">
                        <label htmlFor="customer-login-email" className="flex items-center gap-2 text-sm font-semibold text-white">
                          <Mail className="h-4 w-4 text-emerald-200" aria-hidden="true" />
                          {t('auth.email')}
                        </label>
                        <input
                          {...register('email')}
                          id="customer-login-email"
                          aria-invalid={errors.email ? 'true' : 'false'}
                          aria-describedby={errors.email ? 'customer-login-email-error' : apiError ? 'customer-login-error' : undefined}
                          type="email"
                          autoComplete="email"
                          className="h-12 w-full rounded-xl border border-emerald-100/25 bg-black/10 px-4 text-base text-white outline-none transition placeholder:text-emerald-50/40 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/25"
                          placeholder="contoh@email.com"
                        />
                        {errors.email && (
                          <p id="customer-login-email-error" className="mt-1 text-sm text-red-200" role="alert">{errors.email.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="customer-login-password" className="flex items-center gap-2 text-sm font-semibold text-white">
                            <KeyRound className="h-4 w-4 text-emerald-200" aria-hidden="true" />
                            {t('auth.password')}
                          </label>
                          <a href="/forgot-pin" className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200 hover:underline">
                            {t('auth.forgotPassword')}
                          </a>
                        </div>
                        <div className="relative">
                          <input
                            {...register('password')}
                            id="customer-login-password"
                            aria-invalid={errors.password ? 'true' : 'false'}
                            aria-describedby={errors.password ? 'customer-login-password-error' : apiError ? 'customer-login-error' : undefined}
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            className="h-12 w-full rounded-xl border border-emerald-100/25 bg-black/10 px-4 pr-12 text-base text-white outline-none transition placeholder:text-emerald-50/40 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/25"
                            placeholder="Masukkan password Anda"
                          />
                          <button
                            type="button"
                            aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                            onClick={() => setShowPassword((visible) => !visible)}
                            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-emerald-100/65 transition hover:text-white"
                          >
                            {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                          </button>
                        </div>
                        {errors.password && (
                          <p id="customer-login-password-error" className="mt-1 text-sm text-red-200" role="alert">{errors.password.message}</p>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="otp-fields"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <label htmlFor="customer-login-phone" className="flex items-center gap-2 text-sm font-semibold text-white">
                          <Phone className="h-4 w-4 text-emerald-200" aria-hidden="true" />
                          {pendingOtpIdentifier ? t('auth.validatedAccount') : t('auth.emailOrPhone')}
                        </label>
                        <input
                          {...register('phone')}
                          id="customer-login-phone"
                          aria-invalid={errors.phone ? 'true' : 'false'}
                          aria-describedby={errors.phone ? 'customer-login-phone-error' : apiError ? 'customer-login-error' : undefined}
                          type="text"
                          value={pendingOtpIdentifier || phoneValue || ''}
                          readOnly={!!pendingOtpIdentifier || otpSent}
                          className={`h-12 w-full rounded-xl border border-emerald-100/25 bg-black/10 px-4 text-base text-white outline-none transition placeholder:text-emerald-50/40 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/25 ${otpSent || pendingOtpIdentifier ? 'cursor-not-allowed opacity-60' : ''}`}
                          placeholder="customer@tembus.id atau +62812345678"
                        />
                        {errors.phone && (
                          <p id="customer-login-phone-error" className="mt-1 text-sm text-red-200" role="alert">{errors.phone.message}</p>
                        )}
                      </div>

                      {otpSent && (
                        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label htmlFor="customer-login-otp" className="text-sm font-semibold text-white">{t('auth.otpLabel')}</label>
                            <button
                              type="button"
                              onClick={handleSendOtp}
                              disabled={countdown > 0 || isSendingOtp}
                              className="text-xs font-medium text-emerald-300 transition hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
                            >
                              {isSendingOtp ? t('auth.sending') : countdown > 0 ? t('auth.resendIn', { seconds: countdown }) : t('auth.resend')}
                            </button>
                          </div>
                          <input
                            {...register('otp')}
                            id="customer-login-otp"
                            aria-invalid={errors.otp ? 'true' : 'false'}
                            aria-describedby={errors.otp ? 'customer-login-otp-error' : apiError ? 'customer-login-error' : undefined}
                            type="text"
                            inputMode="numeric"
                            pattern="\d{6}"
                            maxLength={6}
                            autoComplete="one-time-code"
                            className="h-14 w-full rounded-xl border border-emerald-100/25 bg-black/10 px-4 text-center font-mono text-2xl tracking-[0.75em] text-white outline-none transition placeholder:text-emerald-50/30 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/25"
                            placeholder="••••••"
                          />
                          {errors.otp && (
                            <p id="customer-login-otp-error" className="mt-1 text-sm text-red-200" role="alert">{errors.otp.message}</p>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-emerald-50/85">
                  <input
                    id="customer-login-remember"
                    aria-label={t('auth.rememberMe')}
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-emerald-100/35 bg-transparent accent-emerald-400 focus:ring-emerald-300"
                  />
                  <span>{t('auth.rememberMe')}</span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting || (loginMethod === 'otp' && !otpSent && isSendingOtp)}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-emerald-400 px-4 font-semibold text-[#00271b] shadow-[0_10px_30px_rgba(52,211,153,0.2)] transition hover:bg-emerald-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting || (loginMethod === 'otp' && !otpSent && isSendingOtp) ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {loginMethod === 'otp' && !otpSent ? t('auth.sendingOtp') : t('auth.signingIn')}
                    </>
                  ) : loginMethod === 'otp' && !otpSent ? (
                    t('auth.sendOtp')
                  ) : (
                    <>
                      <ArrowRight className="h-5 w-5" aria-hidden="true" />
                      {t('auth.submit')}
                    </>
                  )}
                </button>
              </form>

              <div className="relative my-7">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-emerald-100/15" /></div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider text-emerald-50/55">
                  <span className="bg-[#00251a] px-4">{t('auth.orContinue')}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-emerald-100/25 bg-transparent px-4 font-medium text-white transition hover:border-emerald-300/60 hover:bg-emerald-300/10 active:scale-[0.99]"
              >
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {t('auth.google')}
              </button>

              <button
                type="button"
                onClick={handleAppleSignIn}
                className="mt-3 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/80 bg-white px-4 font-medium text-[#10231b] transition hover:bg-emerald-50 active:scale-[0.99]"
              >
                <svg aria-hidden="true" className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.09.8 1.04-.21 2.04-.9 3.15-.84 1.34.11 2.35.64 3.03 1.6-2.77 1.67-2.11 5.35.43 6.37-.51 1.34-1.17 2.67-2.7 5.04zM12.03 7.25C11.86 5.27 13.5 3.63 15.34 3.5c.25 2.28-2.07 4-3.31 3.75z" />
                </svg>
                {t('auth.apple')}
              </button>

              <div className="mt-7 text-center text-sm text-emerald-50/70">
                {t('auth.noAccount')}{' '}
                <a href="/daftar" className="font-semibold text-emerald-300 transition hover:text-emerald-200 hover:underline">
                  {t('auth.createAccount')}
                </a>
              </div>
            </div>
          </motion.section>
        </div>
      </div>
    </main>
  );
}
