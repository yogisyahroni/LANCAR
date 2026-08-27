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

export function SLAConfigPanel({ data }: { data: SettingsData }) {
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
                key="sla"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                      <Timer className="text-primary-light" size={24} />
                      SLA Thresholds
                    </h3>
                    <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 w-fit">
                      {['P2P'].map(model => (
                        <button 
                          key={model}
                          onClick={() => setActiveModel(model)}
                          className={cn(
                            "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            activeModel === model ? "bg-primary text-white shadow-lg" : "text-zinc-600 hover:text-zinc-300"
                          )}
                        >
                          {model}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    {slaData[activeModel as keyof typeof slaData]?.map((item: any, i: number) => (
                      <div key={i} className="p-6 rounded-[32px] bg-white/[0.02] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <p className="text-sm font-black text-zinc-200 uppercase tracking-widest">{item.stage}</p>
                        <div className="flex items-center gap-4">
                           <div className="space-y-1">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block">Target</label>
                              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                                <input 
                                  type="text" 
                                  defaultValue={item.target} 
                                  onBlur={(e) => {
                                    const newSlaData = { ...slaData };
                                    newSlaData[activeModel as keyof typeof slaData][i].target = e.target.value;
                                    updateConfigMutation.mutate({ key: 'sla_config', value: newSlaData });
                                  }}
                                  className="bg-transparent w-10 text-xs font-bold text-zinc-100 focus:outline-none" 
                                />
                                <Clock size={12} className="text-zinc-600" />
                              </div>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block">Critical</label>
                              <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-2">
                                <input 
                                  type="text" 
                                  defaultValue={item.critical} 
                                  onBlur={(e) => {
                                    const newSlaData = { ...slaData };
                                    newSlaData[activeModel as keyof typeof slaData][i].critical = e.target.value;
                                    updateConfigMutation.mutate({ key: 'sla_config', value: newSlaData });
                                  }}
                                  className="bg-transparent w-10 text-xs font-bold text-red-400 focus:outline-none" 
                                />
                                <ShieldAlert size={12} className="text-red-500/40" />
                              </div>
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-6 border-t border-white/5 flex items-center gap-3">
                     <Target size={18} className="text-amber-500" />
                     <p className="text-[10px] text-zinc-500 italic font-medium">SLA targets are dynamically adjusted during peak hours and weather surges.</p>
                  </div>
                </div>
              </motion.div>
    </>
  );
}