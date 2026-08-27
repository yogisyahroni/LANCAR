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

export function GeneralPanel({ data }: { data: SettingsData }) {
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
                key="general"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-10"
              >
                <div className="space-y-6">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Globe className="text-primary-light" size={24} />
                    Platform Information
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Platform Name</label>
                      <input 
                        type="text" 
                        defaultValue={getConfig('platform_name', 'TEMBUS Logistics Hub')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'platform_name', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Support Email</label>
                      <input 
                        type="email" 
                        defaultValue={getConfig('support_email', 'ops@tembus.id')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'support_email', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t border-white/5 space-y-6">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Smartphone className="text-primary-light" size={24} />
                    System Health
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {(Array.isArray(healthData) ? healthData : []).map((app: any) => (
                      <div key={app.label} className="p-6 rounded-[32px] bg-white/[0.02] border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{app.label}</p>
                          <span className={cn(
                            "w-2 h-2 rounded-full",
                            app.status === 'Stable' || app.status === 'Healthy' || app.status === 'Live' || app.status === 'Optimal' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" : "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                          )} />
                        </div>
                        <p className="text-lg font-black text-zinc-100">{app.version}</p>
                        <div className="flex items-center justify-between pt-2">
                           <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{app.status}</p>
                           <p className="text-[10px] text-primary-light font-black tracking-tight">{app.metrics}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
    </>
  );
}