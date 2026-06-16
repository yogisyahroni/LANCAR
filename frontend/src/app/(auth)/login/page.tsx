'use client';

import { useState, useEffect } from 'react';
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

const loginSchema = z.object({
  // LGN-03: Email max length prevents oversized payload; format enforced by Zod
  email: z
    .string()
    .email('Format email tidak valid')
    .max(255, 'Email terlalu panjang')
    .optional()
    .or(z.literal('')),
  // LGN-03: Password constraints — min 8 already enforced by backend
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password terlalu panjang')
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .min(8, 'Phone number must be at least 8 digits')
    .max(20, 'Nomor telepon terlalu panjang')
    .optional()
    .or(z.literal('')),
  // LGN-03: OTP must be EXACTLY 6 numeric digits — blocks non-digit injection
  otp: z
    .string()
    .length(6, 'OTP harus tepat 6 digit')
    .regex(/^\d{6}$/, 'OTP hanya boleh berisi angka 0-9')
    .optional()
    .or(z.literal('')),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const CUSTOMER_WEB_DEVICE_ID_KEY = 'tembus_customer_web_device_id';

const createBrowserUUID = () => {
  if (typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
};

const getOrCreateCustomerWebDeviceId = () => {
  if (typeof window === 'undefined') return 'customer-web-server';

  const existing = window.localStorage.getItem(CUSTOMER_WEB_DEVICE_ID_KEY);
  if (existing) return existing;

  const randomId = createBrowserUUID();
  const deviceId = `customer-web-${randomId}`;
  window.localStorage.setItem(CUSTOMER_WEB_DEVICE_ID_KEY, deviceId);
  return deviceId;
};

const buildCustomerWebDeviceInfo = (rememberMe: boolean) => ({
  platform: 'web',
  app: 'customer-portal',
  remember_me: rememberMe,
  user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
});

const getApiErrorMessage = (error: any, fallback: string) => {
  const data = error.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  return data?.message || data?.error || fallback;
};

export default function LoginPage() {
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
      setApiError('Please enter a valid email or phone number before sending OTP.');
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
      setApiError(getApiErrorMessage(error, 'Unable to send OTP. Please try again.'));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const createWebSessionFromCustomerToken = async (accessToken: string) => {
    const response = await api.post('/auth/web/session/exchange', {
      access_token: accessToken,
    });
    return response.data.user;
  };

  const onSubmit = async (data: LoginFormValues) => {
    setApiError(null);
    try {
      if (loginMethod === 'password') {
        if (!data.email || !data.password) {
          setApiError('Email and Password are required for password login');
          return;
        }
        const deviceId = getOrCreateCustomerWebDeviceId();
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
          const reason = response.data?.otp_reason === 'new_device' ? 'perangkat baru' : 'registrasi';
          setApiError(`Verifikasi OTP diperlukan untuk ${reason}. Masukkan kode yang dikirim ke email kamu.`);
          return;
        }

        const accessToken = response.data?.access_token;
        if (!accessToken) {
          setApiError('Login berhasil diverifikasi, tetapi token sesi tidak tersedia. Silakan coba lagi.');
          return;
        }

        const user = await createWebSessionFromCustomerToken(accessToken);
        setAuth(true, user);
        router.push('/dashboard');
      } else {
        const identifier = pendingOtpIdentifier || data.phone;
        if (!identifier || !data.otp) {
          setApiError('Email/phone and OTP are required for OTP login');
          return;
        }
        const deviceId = getOrCreateCustomerWebDeviceId();
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
      setApiError(getApiErrorMessage(error, 'An unexpected error occurred. Please try again.'));
    }
  };

  const handleGoogleSignIn = () => {
    window.location.href = customerGoogleAuthUrl;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 sm:p-8">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-blue-500/10 blur-[120px] rounded-full" />
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to TEMBUS</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Sign in to manage your logistics and deliveries
            </p>
          </div>

          {/* Toggle Login Method */}
          <div className="flex bg-background/60 p-1 rounded-xl border border-border/40 mb-6">
            <button
              onClick={() => setLoginMethod('password')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                loginMethod === 'password'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <KeyRound className="h-4 w-4" />
              Password
            </button>
            <button
              onClick={() => setLoginMethod('otp')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                loginMethod === 'otp'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              OTP Login
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {apiError && (
              <motion.div
                data-testid="customer-login-error"
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
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Email
                    </label>
                    <input
                      {...register('email')}
                      type="email"
                      className="w-full px-4 py-2 bg-background/50 border border-border/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground placeholder:text-muted-foreground"
                      placeholder="name@company.com"
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-foreground flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        Password
                      </label>
                      <a href="/forgot-pin" className="text-sm text-primary hover:underline">
                        Forgot password?
                      </a>
                    </div>
                    <input
                      {...register('password')}
                      type="password"
                      className="w-full px-4 py-2 bg-background/50 border border-border/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground placeholder:text-muted-foreground"
                      placeholder="••••••••"
                    />
                    {errors.password && (
                      <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
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
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {pendingOtpIdentifier ? 'Verified account' : 'Email or Phone Number'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        {...register('phone')}
                        type="text"
                        value={pendingOtpIdentifier || phoneValue || ''}
                        readOnly={!!pendingOtpIdentifier}
                        className="flex-1 px-4 py-2 bg-background/50 border border-border/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground placeholder:text-muted-foreground"
                        placeholder="customer@tembus.id or +62812345678"
                      />
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={countdown > 0 || isSendingOtp}
                        className="px-3 bg-secondary text-secondary-foreground text-xs font-medium rounded-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {isSendingOtp ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : countdown > 0 ? (
                          `Resend (${countdown}s)`
                        ) : (
                          'Send OTP'
                        )}
                      </button>
                    </div>
                    {errors.phone && (
                      <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>
                    )}
                  </div>

                    {otpSent && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2"
                      >
                        <label className="text-sm font-medium text-foreground">6-Digit OTP</label>
                        <input
                          {...register('otp')}
                          type="text"
                          inputMode="numeric"  
                          pattern="\d{6}"
                          maxLength={6}
                          autoComplete="one-time-code"
                          className="w-full px-4 py-2 bg-background/50 border border-border/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground text-center tracking-[0.5em] font-mono text-xl placeholder:text-muted-foreground"
                          placeholder="••••••"
                        />
                        {errors.otp && (
                          <p className="text-sm text-destructive mt-1">{errors.otp.message}</p>
                        )}
                      </motion.div>
                    )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded bg-background/60 border border-border/40 text-primary focus:ring-primary/50 transition-all cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">Remember me (30 days)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-primary-foreground font-medium py-2 px-4 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Social Sign-In */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/40"></div>
            </div>
            <div className="relative flex justify-center text-xs text-muted-foreground uppercase">
              <span className="bg-background/40 backdrop-blur-xl px-2">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="w-full border border-border/40 bg-background/40 hover:bg-muted/30 active:scale-[0.98] text-foreground font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-3 transition-all duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            Sign in with Google
          </button>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <a href="/daftar" className="text-primary hover:underline font-medium">
              Sign up here
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
