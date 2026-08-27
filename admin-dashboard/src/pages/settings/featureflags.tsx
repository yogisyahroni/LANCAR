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

export function FeatureFlagsPanel({ data }: { data: SettingsData }) {
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
                key="flags"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                      <Flag className="text-primary-light" size={24} />
                      Feature Management
                    </h3>
                    <div className="flex gap-2">
                       <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest border border-amber-500/20">Super Admin Only</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {visibleFlags.map((flag: any) => (
                      <div key={flag.id} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all group relative overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                           <div className="flex items-center gap-3">
                              <div className={cn("p-2 rounded-xl", flag.is_enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500")}>
                                {flag.is_enabled ? <Zap size={18} /> : <Lock size={18} />}
                              </div>
                              <p className="text-sm font-black text-zinc-200">{flag.name || flag.key}</p>
                           </div>
                           <button 
                             onClick={() => {
                               setSelectedFlag(flag);
                               setFlagReason('');
                               setIsFlagModalOpen(true);
                             }}
                             className={cn(
                               "w-12 h-6 rounded-full relative transition-all duration-300",
                               flag.is_enabled ? "bg-primary" : "bg-zinc-800"
                             )}>
                               <div className={cn(
                                 "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                                 flag.is_enabled ? "right-1" : "left-1"
                               )} />
                             </button>
                        </div>
                        <p className="text-xs text-zinc-600 font-medium leading-relaxed">{flag.description}</p>
                        <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full blur-2xl -translate-y-8 translate-x-8 opacity-0 group-hover:opacity-100 transition-all" />
                      </div>
                    ))}
                  </div>
                  
                  <button 
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="w-full py-4 rounded-2xl border border-dashed border-white/10 text-zinc-600 hover:text-zinc-400 hover:border-white/20 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest"
                  >
                    <Plus size={16} />
                    Register New Feature Flag
                  </button>
                </div>
              </motion.div>
    </>
  );
}