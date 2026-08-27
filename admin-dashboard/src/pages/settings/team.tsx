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

export function TeamPanel({ data }: { data: SettingsData }) {
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
                key="team"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Users className="text-primary-light" size={24} />
                    Admin Team
                  </h3>
                  <button 
                    onClick={() => setIsInviteModalOpen(true)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary/10 text-primary-light border border-primary/20 font-black text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all"
                  >
                    <Plus size={14} />
                    Invite Admin
                  </button>
                </div>

                <div className="space-y-4">
                  {admins.length > 0 ? admins.map((member: any) => (
                    <div key={member.id} className="flex items-center justify-between p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-emerald-500/20 flex items-center justify-center text-primary-light font-black overflow-hidden text-sm">
                          {member.photo_url ? (
                            <img src={member.photo_url} alt={member.full_name} className="w-full h-full object-cover" />
                          ) : (
                            member.full_name?.substring(0, 2).toUpperCase() || 'AD'
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-black text-zinc-200">{member.full_name}</p>
                          <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">{member.role.replaceAll('_', ' ')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                         <button 
                           onClick={() => toast.info('Member permissions can be tuned in IAM section.')}
                           className="p-2 text-zinc-500 hover:text-white transition-colors"
                         >
                            <SettingsIcon size={18} />
                         </button>
                         <button 
                           onClick={() => {
                             if (confirm(`Remove ${member.full_name} from Admin team?`)) {
                               deleteAdminMutation.mutate(member.id)
                             }
                           }}
                           className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                         >
                            <Trash2 size={18} />
                         </button>
                      </div>
                    </div>
                  )) : (
                    <div className="p-12 text-center text-zinc-500 font-bold uppercase tracking-widest text-xs">
                      No admins found
                    </div>
                  )}
                </div>
              </motion.div>
    </>
  );
}