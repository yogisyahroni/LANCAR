import { useState } from 'react'
import {
  Settings as SettingsIcon,
  User,
  Shield,
  Users,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Plus,
  History,
  Smartphone,
  Flag,
  Umbrella,
  Sliders,
  Zap,
  Cpu,
  Activity,
  DollarSign,
  Timer,
  Clock,
  ShieldAlert,
  Target,
  Loader2,
  Mail,
  X,
  Map,
  Truck,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Ban,
  ShieldCheck,
  AlertTriangle,
  FileSearch,
  RefreshCw,
  Wifi,
  WifiOff,
  RotateCcw,
  KeyRound,
  Bell,
  CreditCard,
  Wallet,
  Building2,
  Banknote,
  TrendingUp,
  LineChart,
  PieChart,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import type { SettingsData } from '../useSettingsData'

export function InsurancePanel({ data }: { data: SettingsData }) {
  const {
    queryClient,
    activeTab,
    setActiveTab,
    showApiKey,
    setShowApiKey,
    activeModel,
    setActiveModel,
    isInviteModalOpen,
    setIsInviteModalOpen,
    inviteForm,
    setInviteForm,
    isFlagModalOpen,
    setIsFlagModalOpen,
    selectedFlag,
    setSelectedFlag,
    flagReason,
    setFlagReason,
    isRegisterModalOpen,
    setIsRegisterModalOpen,
    registerFlagForm,
    setRegisterFlagForm,
    tabs,
    flags,
    isLoadingFlags,
    configs,
    isLoadingConfigs,
    admins,
    isLoadingAdmins,
    healthData,
    isLoadingHealth,
    mapsProviderConfig,
    isLoadingMapsProvider,
    auditLogs,
    isLoadingLogs,
    updateFlagMutation,
    createFlagMutation,
    updateConfigMutation,
    updateMapsProviderMutation,
    emergencyDisableMaps,
    restoreOsmMaps,
    deleteAdminMutation,
    inviteAdminMutation,
    getConfig,
    visibleFlags,
    slaData,
  } = data;

  return (
    <>              <motion.div 
                key="insurance"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-10"
              >
                <div className="space-y-8">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Umbrella className="text-primary-light" size={24} />
                    Insurance Policy Settings
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Premium Rate (%)</label>
                      <div className="relative">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">%</span>
                        <input 
                          type="number" 
                          step="0.001"
                          defaultValue={getConfig('insurance_premium_rate', 0.002)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'insurance_premium_rate', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 font-bold italic">Percentage of declared value per order.</p>
                    </div>

                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Minimum Premium (IDR)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                        <input 
                          type="number" 
                          defaultValue={getConfig('insurance_min_premium', 1000)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'insurance_min_premium', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 font-bold italic">Minimum fee if rate calculation is lower.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Maximum Coverage (IDR)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                        <input 
                          type="number" 
                          defaultValue={getConfig('insurance_max_coverage_idr', 10000000)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'insurance_max_coverage_idr', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 font-bold italic">Maximum replacement value per order.</p>
                    </div>

                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Fixed Ins. Fee (IDR)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                        <input 
                          type="number" 
                          defaultValue={getConfig('insurance_fee_idr', 5000)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'insurance_fee_idr', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 font-bold italic">Flat fee added to delivery (if dynamic premium not used).</p>
                    </div>

                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Insurance Provider</label>
                      <select 
                        defaultValue={getConfig('insurance_provider', 'Internal / Managed')}
                        onChange={(e) => updateConfigMutation.mutate({ key: 'insurance_provider', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
                      >
                        <option>Internal / Managed</option>
                      </select>
                      <p className="text-[10px] text-zinc-600 font-bold italic">Active partner for claim settlements.</p>
                    </div>
                  </div>

                  <div className="pt-12 border-t border-white/5 space-y-8">
                    <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                      <Umbrella className="text-primary-light" size={24} />
                      BPJSTK Integration Config
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                      <div className="space-y-3">
                        <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Coverage (IDR)</label>
                        <input 
                          type="number" 
                          defaultValue={getConfig('bpjstk_coverage_idr', 50000000)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'bpjstk_coverage_idr', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Monthly Premium (IDR)</label>
                        <input 
                          type="number" 
                          defaultValue={getConfig('bpjstk_premium_monthly_idr', 16800)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'bpjstk_premium_monthly_idr', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Company Share (IDR)</label>
                        <input 
                          type="number" 
                          defaultValue={getConfig('bpjstk_company_share_idr', 10000)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'bpjstk_company_share_idr', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Courier Share (IDR)</label>
                        <input 
                          type="number" 
                          defaultValue={getConfig('bpjstk_courier_share_idr', 6800)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'bpjstk_courier_share_idr', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
    </>
  );
}