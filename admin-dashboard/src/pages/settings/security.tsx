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

export function SecurityPanel({ data }: { data: SettingsData }) {
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
                key="security"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-10"
              >
                <div className="space-y-6">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Lock className="text-primary-light" size={24} />
                    API Keys & Access
                  </h3>
                  
                  <div className="space-y-4">
                    <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Public API Key</label>
                    <div className="relative">
                      <input 
                        type={showApiKey ? "text" : "password"} 
                        readOnly
                        value={getConfig('security_public_api_key', '[not configured]')}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-mono text-sm focus:outline-none"
                      />
                      <button 
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                      >
                        {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {[
                      { label: 'Force 2FA for Admins', key: 'security_force_2fa' },
                      { label: 'Session Timeout (h)', key: 'security_session_timeout_h' },
                      { label: 'IP Whitelisting', key: 'security_ip_whitelisting' },
                      { label: 'Enable App Integrity (Fraud Check)', key: 'security_enable_play_integrity' },
                    ].map((rule) => {
                      const value = getConfig(rule.key, false);
                      const isToggle = typeof value === 'boolean' && rule.key !== 'security_session_timeout_h';
                      
                      return (
                        <div key={rule.key} className="flex items-center justify-between p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                          <span className="text-sm font-black text-zinc-200">{rule.label}</span>
                          {isToggle ? (
                            <button 
                              onClick={() => updateConfigMutation.mutate({ key: rule.key, value: !value })}
                              className={cn(
                                "w-12 h-6 rounded-full relative transition-all duration-300",
                                value ? "bg-primary" : "bg-zinc-800"
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                                value ? "right-1" : "left-1"
                              )} />
                            </button>
                          ) : (
                          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                                <input 
                                  type="number" 
                                  defaultValue={value as number || 0}
                                  onBlur={(e) => {
                                    const val = Number(e.target.value);
                                    if (!isNaN(val)) updateConfigMutation.mutate({ key: rule.key, value: val });
                                  }}
                                  className="bg-transparent w-8 text-xs font-bold text-zinc-100 focus:outline-none" 
                                />
                                <Clock size={12} className="text-zinc-600" />
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
    </>
  );
}
