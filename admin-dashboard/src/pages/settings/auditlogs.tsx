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

export function AuditLogsPanel({ data }: { data: SettingsData }) {
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
                key="audit"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                      <History className="text-amber-400" size={24} />
                      System Audit Logs
                    </h3>
                    <div className="flex gap-2">
                       <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20">Last 100 Events</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-y-3">
                      <thead>
                        <tr className="text-left">
                          <th className="px-6 py-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Event</th>
                          <th className="px-6 py-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Modified By</th>
                          <th className="px-6 py-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Reason</th>
                          <th className="px-6 py-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log: any) => (
                          <tr key={log.id} className="group">
                            <td className="px-6 py-4 bg-white/[0.02] border-y border-l border-white/5 rounded-l-2xl">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "p-2 rounded-lg",
                                  log.is_enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                )}>
                                  {log.is_enabled ? <Zap size={14} /> : <Lock size={14} />}
                                </div>
                                <div>
                                  <p className="text-xs font-black text-zinc-200">{log.key}</p>
                                  <p className="text-[10px] text-zinc-500 font-medium">Flag status: {log.is_enabled ? 'Enabled' : 'Disabled'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 bg-white/[0.02] border-y border-white/5">
                               <div className="flex items-center gap-2">
                                 <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-black text-primary uppercase">
                                   {log.updated_by?.substring(0, 2) || 'AD'}
                                 </div>
                                 <span className="text-[10px] font-bold text-zinc-400 tracking-tight">{log.updated_by || 'System'}</span>
                               </div>
                            </td>
                            <td className="px-6 py-4 bg-white/[0.02] border-y border-white/5">
                               <p className="text-[10px] font-medium text-zinc-500 line-clamp-1 max-w-[200px]">{log.change_reason}</p>
                            </td>
                            <td className="px-6 py-4 bg-white/[0.02] border-y border-r border-white/5 rounded-r-2xl">
                               <div className="flex items-center gap-2 text-zinc-500">
                                 <Clock size={12} />
                                 <span className="text-[10px] font-bold uppercase tracking-tight">
                                   {new Date(log.created_at).toLocaleString('en-GB', { 
                                     day: '2-digit', 
                                     month: 'short', 
                                     hour: '2-digit', 
                                     minute: '2-digit' 
                                   })}
                                 </span>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {auditLogs.length === 0 && (
                      <div className="p-20 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto text-zinc-600">
                          <History size={32} />
                        </div>
                        <p className="text-xs font-black text-zinc-500 uppercase tracking-widest">No audit events recorded</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
    </>
  );
}