import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Shield, 
  AlertTriangle,
  Lock,
  Unlock,
  History,
  Info
} from 'lucide-react'
import { cn } from '../lib/utils'
import { Link } from 'react-router-dom'

const flags = [
  { id: 'model_p2p', name: 'Model P2P', category: 'Model', status: 'ON', description: 'Point-to-point delivery model', updatedBy: 'Admin Andi', updatedAt: '2h ago' },
  { id: 'model_two_legs', name: 'Model 2-Kaki', category: 'Model', status: 'ON', description: 'Relay model with 2 legs', updatedBy: 'Admin Andi', updatedAt: '2h ago' },
  { id: 'model_three_legs', name: 'Model 3-Kaki', category: 'Model', status: 'OFF', description: 'Relay model with 3 legs (Multi-hop)', updatedBy: 'Super Admin', updatedAt: '1d ago', requireChecklist: true },
  { id: 'dynamic_pricing_weather', name: 'Weather Surge', category: 'Pricing', status: 'ON', description: 'Dynamic pricing based on BMKG weather data', updatedBy: 'Admin Budi', updatedAt: '5h ago' },
  { id: 'volumetric_scanning', name: 'Volumetric Scan', category: 'Feature', status: 'ON', description: 'AI package volume measurement', updatedBy: 'System', updatedAt: '3d ago' },
  { id: 'arcore_scanning', name: 'ARCore Precision', category: 'Feature', status: 'OFF', description: 'High-precision scanning with LiDAR', updatedBy: 'Admin Citra', updatedAt: '1w ago' },
]

export default function FeatureFlags() {
  const [activeTab, setActiveTab] = useState('All')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedFlag, setSelectedFlag] = useState<any>(null)

  const filteredFlags = activeTab === 'All' ? flags : flags.filter(f => f.category === activeTab)

  return (
    <div className="space-y-8 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Feature Management</h1>
          <p className="text-zinc-500 mt-1 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary-light" />
            Control center for system capabilities and rollouts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-card px-4 py-2 rounded-xl flex items-center gap-2 border-amber-500/20 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold text-amber-200">SUPER ADMIN MODE</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-px">
        {['All', 'Model', 'Pricing', 'Feature', 'System'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-6 py-3 text-sm font-medium transition-all relative",
              activeTab === tab ? "text-primary-light" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tab}
            {activeTab === tab && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-light" />
            )}
          </button>
        ))}
      </div>

      {/* Flags Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFlags.map((flag, i) => (
          <motion.div
            key={flag.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-6 rounded-3xl relative overflow-hidden group border-white/5 hover:border-primary/20 transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={cn(
                "p-3 rounded-2xl",
                flag.status === 'ON' ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
              )}>
                {flag.status === 'ON' ? <Unlock size={24} /> : <Lock size={24} />}
              </div>
              <div className={cn(
                "px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase",
                flag.status === 'ON' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-500 border border-white/5"
              )}>
                {flag.status}
              </div>
            </div>

            <h3 className="text-lg font-bold text-zinc-100 mb-1">{flag.name}</h3>
            <p className="text-sm text-zinc-500 mb-6 min-h-[40px]">{flag.description}</p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-600">Last updated by</span>
                <span className="text-zinc-300 font-medium">{flag.updatedBy}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-600">Timestamp</span>
                <span className="text-zinc-300 font-medium">{flag.updatedAt}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => {
                  setSelectedFlag(flag)
                  setIsModalOpen(true)
                }}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                  flag.status === 'ON' ? "bg-white/5 text-zinc-400 hover:bg-white/10" : "bg-primary text-white shadow-lg shadow-primary/20 hover:scale-[1.02]"
                )}
              >
                {flag.status === 'ON' ? 'Deactivate' : 'Activate'}
              </button>
              <button className="p-2.5 rounded-xl bg-white/5 text-zinc-500 hover:text-white transition-all">
                <History size={18} />
              </button>
            </div>

            {flag.requireChecklist && (
              <div className="absolute top-0 right-0 p-2">
                 <Link to="/three-legs-readiness">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-all cursor-pointer">
                    <Info size={14} />
                  </div>
                 </Link>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Modal Mockup */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card w-full max-w-lg p-8 rounded-[40px] relative z-10 border-white/10"
            >
              <h2 className="text-2xl font-bold text-zinc-100 mb-2">
                Confirm Change: <span className="text-primary-light">{selectedFlag?.name}</span>
              </h2>
              <p className="text-zinc-500 text-sm mb-8">This action will be logged in the immutable audit trail and broadcasted via WebSockets to all services.</p>

              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Reason for change</label>
                  <textarea 
                    placeholder="Describe why this change is necessary (min 50 chars)..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[120px] transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">TOTP Verification (Google Authenticator)</label>
                  <div className="flex gap-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <input 
                        key={i}
                        type="text"
                        maxLength={1}
                        className="w-full h-14 bg-white/5 border border-white/10 rounded-xl text-center text-xl font-bold focus:border-primary transition-all"
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 rounded-2xl text-zinc-400 font-bold hover:bg-white/5 transition-all">Cancel</button>
                  <button className="flex-1 py-4 rounded-2xl bg-primary text-white font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Confirm Change</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
