import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../components/Button'
import { Lock, Mail, ChevronRight, Package, Zap, Shield, CheckCircle, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials. Please try again.')
    } finally {
      setIsLoading(true) // Keep loading until navigate
      setTimeout(() => setIsLoading(false), 2000)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-zinc-950">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
      
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
              <Package className="text-white h-7 w-7" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">
              TEM<span className="text-primary-light">BUS</span>
            </h1>
          </div>

          <h2 className="text-5xl font-extrabold leading-tight mb-6">
            Admin <span className="text-gradient">Control Center</span>
          </h2>
          <p className="text-zinc-400 text-lg mb-10 max-w-md leading-relaxed">
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
                <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-5 w-5 text-primary-light" />
                </div>
                <div>
                  <h4 className="font-semibold text-zinc-200">{item.title}</h4>
                  <p className="text-sm text-zinc-500">{item.desc}</p>
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
              <Package className="h-24 w-24 text-white" />
            </div>

            <div className="mb-8">
              <h3 className="text-2xl font-bold text-zinc-100 mb-2">Welcome Back</h3>
              <p className="text-zinc-400 text-sm">Enter your credentials to access the console</p>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400 text-xs font-bold"
              >
                <AlertCircle size={16} />
                {error}
              </motion.div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 ml-1">Email Address</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-primary-light transition-colors">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input 
                    type="email" 
                    name="email"
                    required
                    placeholder="admin@tembus.id"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 ml-1">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-primary-light transition-colors">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input 
                    type="password" 
                    name="password"
                    required
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm px-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="rounded border-white/10 bg-white/5 text-primary focus:ring-primary/40" />
                  <span className="text-zinc-500 group-hover:text-zinc-400 transition-colors">Remember me</span>
                </label>
                <a href="#" className="text-primary-light hover:text-emerald-400 font-medium transition-colors">Forgot Password?</a>
              </div>

              <Button 
                type="submit" 
                variant="primary" 
                className="w-full h-14 text-lg"
                isLoading={isLoading}
              >
                Sign In to Console
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </form>

            <div className="mt-8 pt-8 border-t border-white/5 flex flex-col items-center gap-4">
              <p className="text-zinc-500 text-xs">Protected by TEMBUS Security Systems</p>
              <div className="flex gap-4 opacity-40">
                <Shield className="h-5 w-5" />
                <Zap className="h-5 w-5" />
                <Lock className="h-5 w-5" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
