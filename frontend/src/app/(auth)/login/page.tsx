'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Package, Mail, KeyRound, Phone, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
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

  return (
    <main className="min-h-screen bg-background flex flex-col justify-center items-center p-4 sm:p-8">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-primary/10 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="bg-card/40 backdrop-blur-xl border border-border/40 rounded-2xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center mb-6">
            <img src="/tembusweb.svg" alt="Tembus Logo" className="h-12 object-contain mb-4 drop-shadow-md" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('auth.loginTitle')}</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {t('auth.loginSubtitle')}
            </p>
          </div>

          {/* Login method is determined automatically. Password is the default, OTP is a fallback challenge. */}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {apiError && (
              <motion.div
                data-testid="customer-login-error"
                id="customer-login-error"
                role="alert"
                aria-live="polite"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg p-3"
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
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <label htmlFor="customer-login-email" className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {t('auth.email')}
                    </label>
                    <input
                      {...register('email')}
                      id="customer-login-email"
                      aria-invalid={errors.email ? 'true' : 'false'}
                      aria-describedby={errors.email ? 'customer-login-email-error' : apiError ? 'customer-login-error' : undefined}
                      type="email"
                      className="w-full px-4 py-2 bg-background/50 border border-border/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground placeholder:text-muted-foreground"
                      placeholder="name@company.com"
                    />
                    {errors.email && (
                      <p id="customer-login-email-error" className="text-sm text-destructive mt-1" role="alert">{errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="customer-login-password" className="text-sm font-medium text-foreground flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        {t('auth.password')}
                      </label>
                      <a href="/forgot-pin" className="auth-link text-sm hover:underline">
                        {t('auth.forgotPassword')}
                      </a>
                    </div>
                    <input
                      {...register('password')}
                      id="customer-login-password"
                      aria-invalid={errors.password ? 'true' : 'false'}
                      aria-describedby={errors.password ? 'customer-login-password-error' : apiError ? 'customer-login-error' : undefined}
                      type="password"
                      className="w-full px-4 py-2 bg-background/50 border border-border/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground placeholder:text-muted-foreground"
                      placeholder="••••••••"
                    />
                    {errors.password && (
                      <p id="customer-login-password-error" className="text-sm text-destructive mt-1" role="alert">{errors.password.message}</p>
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
                    <label htmlFor="customer-login-phone" className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
                      className={`w-full px-4 py-2.5 bg-background/50 border border-border/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground placeholder:text-muted-foreground ${otpSent || pendingOtpIdentifier ? 'opacity-60 cursor-not-allowed' : ''}`}
                      placeholder="customer@tembus.id or +62812345678"
                    />
                    {errors.phone && (
                      <p id="customer-login-phone-error" className="text-sm text-destructive mt-1" role="alert">{errors.phone.message}</p>
                    )}
                  </div>

                  {otpSent && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <label htmlFor="customer-login-otp" className="text-sm font-medium text-foreground">{t('auth.otpLabel')}</label>
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={countdown > 0 || isSendingOtp}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-60 disabled:no-underline transition-all"
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
                        className="w-full px-4 py-3 bg-background/50 border border-border/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground text-center tracking-[0.75em] font-mono text-2xl placeholder:text-muted-foreground/30 shadow-inner"
                        placeholder="••••••"
                      />
                      {errors.otp && (
                        <p id="customer-login-otp-error" className="text-sm text-destructive mt-1" role="alert">{errors.otp.message}</p>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  id="customer-login-remember"
                  aria-label={t('auth.rememberMe')}
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded bg-background/60 border border-border/40 text-primary focus:ring-primary/50 transition-all cursor-pointer"
                />
                <span className="text-sm text-foreground">{t('auth.rememberMe')}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || (loginMethod === 'otp' && !otpSent && isSendingOtp)}
              className="w-full bg-primary text-on-primary font-medium py-2.5 px-4 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-primary/20"
            >
              {isSubmitting || (loginMethod === 'otp' && !otpSent && isSendingOtp) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin"  aria-hidden="true"/>
                  {loginMethod === 'otp' && !otpSent ? t('auth.sendingOtp') : t('auth.signingIn')}
                </>
              ) : loginMethod === 'otp' && !otpSent ? (
                t('auth.sendOtp')
              ) : (
                t('auth.submit')
              )}
            </button>
          </form>

          {/* Social Sign-In */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/40"></div>
            </div>
            <div className="relative flex justify-center text-xs text-muted-foreground uppercase">
              <span className="bg-background/40 backdrop-blur-xl px-2">{t('auth.orContinue')}</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="w-full border border-border/40 bg-background/40 hover:bg-muted/30 active:scale-[0.98] text-foreground font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-3 transition-all duration-200"
          >
            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {t('auth.google')}
          </button>

          <button
            onClick={handleAppleSignIn}
            className="mt-3 w-full border border-border/40 bg-foreground text-background hover:opacity-90 active:scale-[0.98] font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-3 transition-all duration-200"
          >
            <span className="text-xl leading-none" aria-hidden="true">●</span>
            {t('auth.apple')}
          </button>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {t('auth.noAccount')}{' '}
            <a href="/daftar" className="auth-link hover:underline font-medium">
              {t('auth.createAccount')}
            </a>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
