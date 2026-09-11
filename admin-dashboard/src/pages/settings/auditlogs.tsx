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
                <div className="glass-card p-10 rounded-[48px] border-border space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-foreground-muted flex items-center gap-3 tracking-tight">
                      <History className="text-warning" size={24} aria-hidden="true" />
                      System Audit Logs
                    </h3>
                    <div className="flex gap-2">
                       <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-wide border border-primary/20">Last 100 Events</span>
                    </div>
                  </div>

                  <div role="region" aria-label="Settings audit logs table" tabIndex={0} className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-y-3">
                      <thead>
                        <tr className="text-left">
                          <th scope="col" className="px-6 py-2 text-xs font-black text-foreground-muted uppercase tracking-wide">Event</th>
                          <th scope="col" className="px-6 py-2 text-xs font-black text-foreground-muted uppercase tracking-wide">Modified By</th>
                          <th scope="col" className="px-6 py-2 text-xs font-black text-foreground-muted uppercase tracking-wide">Reason</th>
                          <th scope="col" className="px-6 py-2 text-xs font-black text-foreground-muted uppercase tracking-wide">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log: any) => (
                          <tr key={log.id} className="group">
                            <td className="px-6 py-4 bg-surface/[0.02] border-y border-l border-border rounded-l-2xl">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "p-2 rounded-lg",
                                  log.is_enabled ? "bg-success-surface text-success" : "bg-error-surface text-error"
                                )}>
                                  {log.is_enabled ? <Zap size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                                </div>
                                <div>
                                  <p className="text-xs font-black text-foreground-muted">{log.key}</p>
                                  <p className="text-xs text-foreground-muted font-medium">Flag status: {log.is_enabled ? 'Enabled' : 'Disabled'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 bg-surface/[0.02] border-y border-border">
                               <div className="flex items-center gap-2">
                                 <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-black text-primary uppercase">
                                   {log.updated_by?.substring(0, 2) || 'AD'}
                                 </div>
                                 <span className="text-xs font-bold text-foreground-muted tracking-tight">{log.updated_by || 'System'}</span>
                               </div>
                            </td>
                            <td className="px-6 py-4 bg-surface/[0.02] border-y border-border">
                               <p className="text-xs font-medium text-foreground-muted line-clamp-1 max-w-[200px]" title={log.change_reason}>{log.change_reason}</p>
                            </td>
                            <td className="px-6 py-4 bg-surface/[0.02] border-y border-r border-border rounded-r-2xl">
                               <div className="flex items-center gap-2 text-foreground-muted">
                                 <Clock size={12} aria-hidden="true" />
                                 <span className="text-xs font-bold uppercase tracking-tight">
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
                        <div className="w-16 h-16 rounded-full bg-surface-subtle flex items-center justify-center mx-auto text-foreground-muted">
                          <History size={32} aria-hidden="true" />
                        </div>
                        <p className="text-xs font-black text-foreground-muted uppercase tracking-wide">No audit events recorded</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
    </>
  );
}
