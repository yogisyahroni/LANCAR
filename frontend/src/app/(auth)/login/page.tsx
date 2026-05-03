'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { Loader2, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
  });

  const onSubmit = async (data: LoginFormValues) => {
    setApiError(null);
    try {
      const response = await api.post('/auth/web/login', data);
      setAuth(true, response.data.user);
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      setApiError(
        error.response?.data?.error || 'An unexpected error occurred. Please try again.'
      );
    }
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
          <div className="flex flex-col items-center mb-8">
            <div className="h-12 w-12 bg-primary/20 rounded-xl flex items-center justify-center mb-4">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to Lancar</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Sign in to manage your logistics and deliveries
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {apiError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg p-3"
              >
                {apiError}
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
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
                <label className="text-sm font-medium text-foreground">Password</label>
                <a href="#" className="text-sm text-primary hover:underline">
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

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <a href="#" className="text-primary hover:underline font-medium">
              Contact Sales
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
