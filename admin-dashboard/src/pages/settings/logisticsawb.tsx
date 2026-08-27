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

export function LogisticsAWBPanel({ data }: { data: SettingsData }) {
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
                key="logistics-awb"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-10"
              >
                <div className="space-y-6">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Truck className="text-primary-light" size={24} />
                    Logistics & AWB Configuration
                  </h3>
                  <p className="text-sm text-zinc-400">Configure default sender information, payment link URLs, and origin/destination codes. These settings apply globally and are read dynamically.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Payment Link Base URL</label>
                      <input 
                        type="text" 
                        defaultValue={getConfig('payment_link_base_url', 'https://pay.tembus.my.id/inv')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'payment_link_base_url', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        placeholder="e.g. https://pay.tembus.my.id/inv"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Default Provider</label>
                      <input 
                        type="text" 
                        defaultValue={getConfig('awb_default_provider', 'jne')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'awb_default_provider', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        placeholder="e.g. jne, jnt"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Link Expiry (Minutes)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('payment_link_expiry_minutes', 10)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'payment_link_expiry_minutes', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Default Weight (KG)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        defaultValue={getConfig('payment_link_default_weight_kg', 1.0)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'payment_link_default_weight_kg', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Sender Name</label>
                      <input 
                        type="text" 
                        defaultValue={getConfig('awb_sender_name', 'Tembus Logistics')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'awb_sender_name', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Sender Phone</label>
                      <input 
                        type="text" 
                        defaultValue={getConfig('awb_sender_phone', '081234567890')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'awb_sender_phone', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Service Type</label>
                      <input 
                        type="text" 
                        defaultValue={getConfig('awb_service_type', 'REG')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'awb_service_type', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Sender Address</label>
                    <textarea 
                      defaultValue={getConfig('awb_sender_address', 'Jl. Contoh No 123, Jakarta')}
                      onBlur={(e) => updateConfigMutation.mutate({ key: 'awb_sender_address', value: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all min-h-[100px]"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Origin Code</label>
                      <input 
                        type="text" 
                        defaultValue={getConfig('awb_origin_code', 'CGK10000')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'awb_origin_code', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Destination Code</label>
                      <input 
                        type="text" 
                        defaultValue={getConfig('awb_destination_code', 'BDO10000')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'awb_destination_code', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 mt-8">
                    <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Tracking URL Template</label>
                    <input 
                      type="text" 
                      defaultValue={getConfig('awb_tracking_url_template', 'https://cekresi.com/?noresi=%s')}
                      onBlur={(e) => updateConfigMutation.mutate({ key: 'awb_tracking_url_template', value: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      placeholder="e.g. https://cekresi.com/?noresi=%s"
                    />
                  </div>
                </div>
              </motion.div>
    </>
  );
}