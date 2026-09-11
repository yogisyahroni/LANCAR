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
import { StatusBadge } from '../../components/StatusBadge'
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
                className="glass-card p-10 rounded-[48px] border-border space-y-10"
              >
                <div className="space-y-6">
                  <h2 className="text-xl font-black text-foreground-muted flex items-center gap-3 tracking-tight">
                    <Globe className="text-primary-light" size={24} aria-hidden="true" />
                    Platform Information
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-foreground-muted tracking-wide">Platform Name</label>
                      <input aria-label="Platform name"
                        type="text" 
                        defaultValue={getConfig('platform_name', 'TEMBUS Logistics Hub')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'platform_name', value: e.target.value })}
                        className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-5 text-foreground-muted font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-foreground-muted tracking-wide">Support Email</label>
                      <input aria-label="Support email"
                        type="email" 
                        defaultValue={getConfig('support_email', 'ops@tembus.id')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'support_email', value: e.target.value })}
                        className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-5 text-foreground-muted font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t border-border space-y-6">
                  <h2 className="text-xl font-black text-foreground-muted flex items-center gap-3 tracking-tight">
                    <Smartphone className="text-primary-light" size={24} aria-hidden="true" />
                    System Health
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {(Array.isArray(healthData) ? healthData : []).map((app: any) => (
                      <div key={app.label} className="p-6 rounded-[32px] bg-surface/[0.02] border border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">{app.label}</p>
                          <span className={cn(
                            "w-2 h-2 rounded-full",
                            app.status === 'Stable' || app.status === 'Healthy' || app.status === 'Live' || app.status === 'Optimal' ? "bg-success shadow-[0_0_10px_rgba(16,185,129,0.4)]" : "bg-warning shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                          )} />
                        </div>
                        <p className="text-lg font-black text-foreground-muted">{app.version}</p>
                        <div className="flex items-center justify-between pt-2">
                           <StatusBadge status={app.status} labelPrefix={`${app.label} status`} />
                           <p className="text-xs text-primary-light font-black tracking-tight">{app.metrics}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
    </>
  );
}
