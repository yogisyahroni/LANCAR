import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../components/Button'
import { Lock, Mail, ChevronRight, Package, Zap, Shield, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '../store/useAuthStore'

export default function Login() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (lockoutSeconds === null || lockoutSeconds <= 0) return

    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev === null || prev <= 1) {
          setError('')
          return null
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [lockoutSeconds])

  const formatLockoutTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins} menit ${secs.toString().padStart(2, '0')} detik`
    }
    return `${secs} detik`
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lockoutSeconds && lockoutSeconds > 0) return

    setIsLoading(true)
    setError('')

    const formData = new FormData(e.target as HTMLFormElement)
    const email = (formData.get('email') as string) ?? ''
    const password = (formData.get('password') as string) ?? ''

    try {
      await login({ email, password })
      navigate('/dashboard')
    } catch (err: any) {
      if (err.response?.status === 429) {
        const rawRetry =
          err.response?.data?.retry_after_seconds ??
          err.response?.headers?.['retry-after'] ??
          err.response?.headers?.['ratelimit-reset']

        const seconds = typeof rawRetry === 'number'
          ? rawRetry
          : parseInt(String(rawRetry || '60'), 10) || 60

        setLockoutSeconds(seconds)
        const refId = err.referenceCode ? ` (${err.referenceCode})` : ''
        setError(`Terlalu banyak percobaan masuk. Mohon tunggu ${formatLockoutTime(seconds)} sebelum mencoba kembali${refId}.`)
      } else {
        const msg = err.response?.data?.message
        setError(
          typeof msg === 'string' && msg.length < 200
            ? msg
            : 'Kredensial tidak valid. Silakan coba lagi.'
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  const isLockedOut = Boolean(lockoutSeconds && lockoutSeconds > 0)

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-success-surface rounded-full blur-[120px] animate-pulse delay-700" />
      
      {/* Mesh Grid Pattern */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_1px_1px,#ffffff12_1px,transparent_0)] bg-[size:20px_20px] opacity-40" />
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="container max-w-6xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center relative z-10">
        
        {/* Left Side: Branding & Info */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden lg:block"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center shadow-xl shadow-primary/40">
              <Package className="text-foreground h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">
              TEM<span className="text-primary-light">BUS</span>
            </h1>
          </div>

          <h2 className="text-5xl font-extrabold leading-tight mb-6">
            Admin <span className="text-gradient">Control Center</span>
          </h2>
          <p className="text-foreground-muted text-lg mb-10 max-w-md leading-relaxed">
            Kelola operasi TEMBUS dengan insight real-time, matching otomatis, dan analitik operasional.
          </p>

          <div className="grid grid-cols-2 gap-6">
            {[
              { icon: Zap, title: "Cepat", desc: "Instant matching" },
              { icon: Shield, title: "Aman", desc: "Secured transit" },
              { icon: CheckCircle, title: "Terpercaya", desc: "SLA Guaranteed" },
              { icon: Package, title: "Tembus", desc: "End-to-end logistics" },
            ].map((item, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i }}
                className="flex items-start gap-3"
              >
                <div className="h-10 w-10 rounded-lg bg-surface-subtle border border-border flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-5 w-5 text-primary-light" aria-hidden="true" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground-muted">{item.title}</h4>
                  <p className="text-sm text-foreground-muted">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right Side: Login Form */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center lg:justify-end"
        >
          <div className="glass-card w-full max-w-md p-8 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Package className="h-24 w-24 text-foreground" aria-hidden="true" />
            </div>

            <div className="mb-8">
              <h3 className="text-2xl font-bold text-foreground-muted mb-2">Welcome Back</h3>
              <p className="text-foreground-muted text-sm">Enter your credentials to access the console</p>
            </div>

            {error && (
              <motion.div 
                id="admin-login-error"
                role="alert"
                aria-live="assertive"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 p-4 rounded-xl bg-error-surface border border-error flex items-start gap-3 text-error text-xs font-bold"
              >
                {isLockedOut ? (
                  <Clock className="h-4 w-4 mt-0.5 flex-shrink-0 text-error animate-pulse" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-error" aria-hidden="true" />
                )}
                <div className="flex-1">
                  <p>{error}</p>
                  {isLockedOut && lockoutSeconds && (
                    <p className="mt-1 text-xs font-extrabold text-error/90">
                      Coba lagi dalam: {Math.floor(lockoutSeconds / 60)}:{(lockoutSeconds % 60).toString().padStart(2, '0')}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="admin-login-email" className="text-sm font-medium text-foreground-muted ml-1">Email Address (wajib)</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-foreground-muted group-focus-within:text-primary-light transition-colors">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <input 
                    id="admin-login-email"
                    type="email" 
                    name="email"
                    required
                    disabled={isLockedOut}
                    aria-required="true"
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={error ? 'admin-login-error' : undefined}
                    autoComplete="email"
                    placeholder="admin@tembus.id"
                    className="w-full bg-surface-subtle border border-border rounded-xl py-3 pl-12 pr-4 text-foreground-muted placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="admin-login-password" className="text-sm font-medium text-foreground-muted ml-1">Password (wajib)</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-foreground-muted group-focus-within:text-primary-light transition-colors">
                    <Lock className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <input 
                    id="admin-login-password"
                    type="password" 
                    name="password"
                    required
                    disabled={isLockedOut}
                    aria-required="true"
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={error ? 'admin-login-error' : undefined}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full bg-surface-subtle border border-border rounded-xl py-3 pl-12 pr-4 text-foreground-muted placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm px-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input id="admin-login-remember" aria-label="Remember me" type="checkbox" className="rounded border-border bg-surface-subtle text-primary focus:ring-primary/40" />
                  <span className="text-foreground-muted group-hover:text-foreground-muted transition-colors">Remember me</span>
                </label>
                <a href="#" className="text-primary-light hover:text-success font-medium transition-colors">Forgot Password?</a>
              </div>

              <Button 
                type="submit" 
                variant="primary" 
                className="w-full h-14 text-lg"
                isLoading={isLoading}
                disabled={isLoading || isLockedOut}
              >
                {isLockedOut && lockoutSeconds ? (
                  <span className="flex items-center justify-center gap-2 font-mono">
                    <Clock className="h-5 w-5" />
                    Coba lagi dalam {Math.floor(lockoutSeconds / 60)}:{(lockoutSeconds % 60).toString().padStart(2, '0')}
                  </span>
                ) : (
                  <>
                    Sign In to Console
                    <ChevronRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-8 pt-8 border-t border-border flex flex-col items-center gap-4">
              <p className="text-foreground-muted text-xs">Protected by TEMBUS Security Systems</p>
              <div className="flex gap-4 opacity-40">
                <Shield className="h-5 w-5" aria-hidden="true" />
                <Zap className="h-5 w-5" aria-hidden="true" />
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
