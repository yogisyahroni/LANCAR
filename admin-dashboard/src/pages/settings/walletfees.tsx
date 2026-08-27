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

export function WalletFeesPanel({ data }: { data: SettingsData }) {
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
                key="wallet"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-12"
              >
                {/* Withdrawal Fees */}
                <div className="space-y-8">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <DollarSign className="text-primary-light" size={24} />
                    Withdrawal Fees
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Customer Withdrawal Fee (IDR)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                        <input 
                          type="number" 
                          defaultValue={getConfig('withdrawal_fee_customer', 5000)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'withdrawal_fee_customer', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Courier Withdrawal Fee (IDR)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                        <input 
                          type="number" 
                          defaultValue={getConfig('withdrawal_fee_courier', 0)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'withdrawal_fee_courier', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Topup & Service Fees */}
                <div className="pt-12 border-t border-white/5 space-y-8">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Zap className="text-primary-light" size={24} />
                    Top-Up & Service Fees
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Top-Up Fixed Fee (IDR)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('topup_fee_fixed', 1000)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'topup_fee_fixed', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Top-Up Percentage (%)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        defaultValue={getConfig('topup_fee_percent', 0)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'topup_fee_percent', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Direct Service Fee (IDR)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('service_fee_fixed', 2000)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'service_fee_fixed', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-4">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Platform Fee (IDR)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('platform_fee_idr', 1500)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'platform_fee_idr', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Platform Fee Pct (%)</label>
                      <input 
                        type="number" 
                        step="0.001"
                        defaultValue={getConfig('platform_fee_pct', 0.015)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'platform_fee_pct', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Merchant Fee Pct (%)</label>
                      <input 
                        type="number" 
                        step="0.001"
                        defaultValue={getConfig('merchant_transaction_fee_pct', 0.025)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'merchant_transaction_fee_pct', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Gateway Fees */}
                <div className="pt-12 border-t border-white/5 space-y-8">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <DollarSign className="text-primary-light" size={24} />
                    Payment Gateway Fees
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">MDR Rate (%)</label>
                      <div className="relative">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">%</span>
                        <input 
                          type="number" 
                          step="0.001"
                          defaultValue={getConfig('payment_mdr_rate', 0.007)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'payment_mdr_rate', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">PPN Rate (%)</label>
                      <div className="relative">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">%</span>
                        <input 
                          type="number" 
                          step="0.001"
                          defaultValue={getConfig('payment_ppn_rate', 0.11)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'payment_ppn_rate', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Thresholds */}
                <div className="pt-12 border-t border-white/5 space-y-8">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Shield className="text-primary-light" size={24} />
                    Financial Thresholds
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Min. Top-Up (IDR)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('topup_min_amount', 10000)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'topup_min_amount', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Min. Withdrawal (IDR)</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('withdrawal_min_amount', 50000)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'withdrawal_min_amount', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Auto Disbursement Limit</label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('auto_disbursement_threshold', 1000000)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'auto_disbursement_threshold', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                      <p className="text-[10px] text-zinc-600 font-bold italic">Threshold for automated payouts.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
    </>
  );
}