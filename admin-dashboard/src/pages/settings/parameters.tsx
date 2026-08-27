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

export function ParametersPanel({ data }: { data: SettingsData }) {
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
                key="params"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-12"
              >
                {/* Logistics Params */}
                <div className="space-y-8">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Cpu className="text-primary-light" size={24} />
                    Logistics & Core Engine
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14} />
                        Max Courier Weight (KG)
                      </label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('max_weight_kg', 20)}
                        onBlur={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val)) updateConfigMutation.mutate({ key: 'max_weight_kg', value: val });
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14} />
                        Max Leg Distance (KM)
                      </label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('max_distance_km', 15)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'max_distance_km', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mt-4">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Relay Score Wt</label>
                      <input 
                        type="number" step="0.01"
                        defaultValue={getConfig('relay_score_weight', 0.4)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'relay_score_weight', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Proximity Score Wt</label>
                      <input 
                        type="number" step="0.01"
                        defaultValue={getConfig('proximity_score_weight', 0.25)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'proximity_score_weight', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Acceptance Score Wt</label>
                      <input 
                        type="number" step="0.01"
                        defaultValue={getConfig('acceptance_score_weight', 0.15)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'acceptance_score_weight', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Idle Time Wt</label>
                      <input 
                        type="number" step="0.01"
                        defaultValue={getConfig('idle_time_weight', 0.1)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'idle_time_weight', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black"
                      />
                    </div>
                  </div>
                </div>

                {/* Pricing & Surge Configs */}
                <div className="pt-12 border-t border-white/5 space-y-8">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Zap className="text-primary-light" size={24} />
                    Pricing & Surge Configs
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Tier 1 Weight (KG)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('weight_tier1_threshold_kg', 3)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'weight_tier1_threshold_kg', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Tier 1 Surcharge</label>
                      <input 
                        type="number" step="0.01"
                        defaultValue={getConfig('weight_surcharge_tier1', 0.15)}
                        onBlur={(e) => {
                          const cfgTier = 'weight_surcharge_tier1';
                          updateConfigMutation.mutate({ key: cfgTier, value: Number(e.target.value) });
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Peak Hour Surge (x)</label>
                      <input 
                        type="number" step="0.01"
                        defaultValue={getConfig('surge_peak_hour_multiplier', 0.2)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'surge_peak_hour_multiplier', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Tier 2 Weight (KG)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('weight_tier2_threshold_kg', 10)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'weight_tier2_threshold_kg', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Tier 2 Surcharge</label>
                      <input 
                        type="number" step="0.01"
                        defaultValue={getConfig('weight_surcharge_tier2', 0.3)}
                        onBlur={(e) => {
                          const cfgTier = 'weight_surcharge_tier2';
                          updateConfigMutation.mutate({ key: cfgTier, value: Number(e.target.value) });
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">High Demand Surge (x)</label>
                      <input 
                        type="number" step="0.01"
                        defaultValue={getConfig('surge_high_demand_multiplier', 0.15)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'surge_high_demand_multiplier', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Surge Step Incr.</label>
                      <input 
                        type="number" step="0.01"
                        defaultValue={getConfig('surge_demand_multiplier_step', 0.25)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'surge_demand_multiplier_step', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Demand Ratio Thr.</label>
                      <input 
                        type="number" step="0.1"
                        defaultValue={getConfig('surge_demand_ratio_threshold', 1.5)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'surge_demand_ratio_threshold', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Max Surge Mult.</label>
                      <input 
                        type="number" step="0.1"
                        defaultValue={getConfig('surge_max_multiplier', 2.5)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'surge_max_multiplier', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Safety & Finance Params */}
                <div className="pt-12 border-t border-white/5 space-y-8">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <DollarSign className="text-primary-light" size={24} />
                    Safety & Financial Thresholds
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Speed Alert (km/h)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('speed_threshold_kmh', 60)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'speed_threshold_kmh', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Battery Alert (%)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('battery_alert_pct', 20)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'battery_alert_pct', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Platform Fee (%)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('admin_fee_pct', 5)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'admin_fee_pct', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                        <Umbrella size={14} />
                        Weather Reserve Fund (IDR)
                      </label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('weather_reserve_idr', 0)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'weather_reserve_idr', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
    </>
  );
}