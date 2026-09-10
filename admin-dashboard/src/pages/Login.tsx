import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../components/Button'
import { Lock, Mail, ChevronRight, Package, Zap, Shield, CheckCircle, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '../store/useAuthStore'

export default function Login() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const formData = new FormData(e.target as HTMLFormElement)
    const email = (formData.get('email') as string) ?? ''
    const password = (formData.get('password') as string) ?? ''

    try {
      await login({ email, password })
      // On success: navigate immediately — component unmounts so no need to reset isLoading
      navigate('/dashboard')
    } catch (err: any) {
      // S3-AD-02 Fix: Only show message if it's a short safe string; avoid leaking internal details
      const msg = err.response?.data?.message
      setError(
        typeof msg === 'string' && msg.length < 200
          ? msg
          : 'Kredensial tidak valid. Silakan coba lagi.'
      )
    } finally {
      // S3-AD-02 Fix: Was `setIsLoading(true)` which permanently locked the button on error.
      // Must always reset to false so the user can retry after a failed login.
      setIsLoading(false)
    }
  }

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
                className="mb-6 p-4 rounded-xl bg-error-surface border border-error flex items-center gap-3 text-error text-xs font-bold"
              >
                <AlertCircle aria-hidden="true" size={16} />
                {error}
              </motion.div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="admin-login-email" className="text-sm font-medium text-foreground-muted ml-1">Email Address</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-foreground-muted group-focus-within:text-primary-light transition-colors">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <input 
                    id="admin-login-email"
                    type="email" 
                    name="email"
                    required
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={error ? 'admin-login-error' : undefined}
                    autoComplete="email"
                    placeholder="admin@tembus.id"
                    className="w-full bg-surface-subtle border border-border rounded-xl py-3 pl-12 pr-4 text-foreground-muted placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="admin-login-password" className="text-sm font-medium text-foreground-muted ml-1">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-foreground-muted group-focus-within:text-primary-light transition-colors">
                    <Lock className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <input 
                    id="admin-login-password"
                    type="password" 
                    name="password"
                    required
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={error ? 'admin-login-error' : undefined}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full bg-surface-subtle border border-border rounded-xl py-3 pl-12 pr-4 text-foreground-muted placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
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
              >
                Sign In to Console
                <ChevronRight className="ml-2 h-5 w-5" aria-hidden="true" />
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
