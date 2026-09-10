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
import { StatusBadge } from '../../components/StatusBadge'
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

  const [complianceMarket, setComplianceMarket] = useState('id-jk');
  const { data: compliancePolicy, isLoading: isLoadingCompliancePolicy } = useQuery({
    queryKey: ['admin-compliance-policy', complianceMarket],
    queryFn: async () => (await api.get('/admin/compliance/policy', { params: { market_code: complianceMarket } })).data?.data,
    enabled: complianceMarket.trim().length > 0,
  });

  const complianceRequirements = Array.isArray(compliancePolicy?.requirements) ? compliancePolicy.requirements : [];
  const complianceDataPolicies = Array.isArray(compliancePolicy?.data_policies) ? compliancePolicy.data_policies : [];
  const complianceArtifactPolicies = Array.isArray(compliancePolicy?.artifact_policies) ? compliancePolicy.artifact_policies : [];
  const complianceServiceCategories = Array.isArray(compliancePolicy?.service_categories) ? compliancePolicy.service_categories : [];

  return (
    <>              <motion.div 
                key="security"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-border space-y-10"
              >
                <div className="space-y-6">
                  <h3 className="text-xl font-black text-foreground-muted flex items-center gap-3 tracking-tight">
                    <Lock className="text-primary-light" size={24} aria-hidden="true" />
                    API Keys & Access
                  </h3>
                  
                  <div className="space-y-4">
                    <label className="text-xs font-black text-foreground-muted uppercase tracking-widest">Public API Key</label>
                    <div className="relative">
                      <input 
                        type={showApiKey ? "text" : "password"} 
                        readOnly
                        value={getConfig('security_public_api_key', '[not configured]')}
                        className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-5 text-foreground-muted font-mono text-sm focus:outline-none"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        role="switch"
                        aria-checked={showApiKey}
                        aria-label={showApiKey ? 'Hide public API key' : 'Show public API key'}
                        title={showApiKey ? 'Hide public API key' : 'Show public API key'}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                      >
                        {showApiKey ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
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
                        <div key={rule.key} className="flex items-center justify-between p-6 rounded-3xl bg-surface/[0.02] border border-border">
                          <span className="text-sm font-black text-foreground-muted">{rule.label}</span>
                          {isToggle ? (
                            <button 
                              type="button"
                              onClick={() => updateConfigMutation.mutate({ key: rule.key, value: !value })}
                              role="switch"
                              aria-checked={value}
                              aria-label={rule.label}
                              title={rule.label}
                              className={cn(
                                "w-12 h-6 rounded-full relative transition-all duration-300",
                                value ? "bg-primary" : "bg-surface-raised"
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-4 h-4 rounded-full bg-surface transition-all duration-300",
                                value ? "right-1" : "left-1"
                              )} />
                            </button>
                          ) : (
                          <div className="flex items-center gap-2 bg-surface-subtle border border-border rounded-xl px-4 py-2">
                                <input 
                                  type="number" 
                                  defaultValue={value as number || 0}
                                  onBlur={(e) => {
                                    const val = Number(e.target.value);
                                    if (!isNaN(val)) updateConfigMutation.mutate({ key: rule.key, value: val });
                                  }}
                                  className="bg-transparent w-8 text-xs font-bold text-foreground-muted focus:outline-none"
                                />
                                <Clock size={12} className="text-foreground-muted" aria-hidden="true" />
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>

              <motion.div
                key="compliance-boundary"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-border space-y-8"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-xl font-black text-foreground-muted flex items-center gap-3 tracking-tight">
                      <ShieldCheck className="text-primary-light" size={24} aria-hidden="true" />
                      Market Compliance Boundary
                    </h3>
                    <p className="mt-2 text-sm text-foreground-muted">Role verification, consent, retention, artifact access, and service availability are resolved per market.</p>
                  </div>
                  <label className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-foreground-muted">
                    Market
                    <input
                      value={complianceMarket}
                      onChange={(event) => setComplianceMarket(event.target.value.toLowerCase())}
                      className="w-32 rounded-xl border border-border bg-surface-subtle px-3 py-2 text-sm normal-case tracking-normal text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                      aria-label="Compliance market code"
                    />
                  </label>
                </div>

                {isLoadingCompliancePolicy ? (
                  <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface/[0.02] p-6 text-sm text-foreground-muted">
                    <Loader2 className="animate-spin" size={18} aria-hidden="true" /> Loading market policy…
                  </div>
                ) : compliancePolicy ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-3xl border border-border bg-surface/[0.02] p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Launch readiness</p>
                        <p className={cn('mt-2 flex items-center gap-2 text-lg font-black', compliancePolicy.readiness?.is_ready ? 'text-success' : 'text-warning')}>
                          {compliancePolicy.readiness?.is_ready ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
                          {compliancePolicy.readiness?.is_ready ? 'Ready' : 'Not ready'}
                        </p>
                        <p className="mt-2 text-xs text-foreground-muted">{(compliancePolicy.readiness?.reason_codes || []).join(', ') || 'No readiness exceptions'}</p>
                      </div>
                      <div className="rounded-3xl border border-border bg-surface/[0.02] p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Policy version</p>
                        <p className="mt-2 text-lg font-black text-foreground-muted">v{compliancePolicy.config_version || '—'}</p>
                        <p className="mt-2 text-xs text-foreground-muted">Locale: {compliancePolicy.default_locale || '—'}</p>
                      </div>
                      <div className="rounded-3xl border border-border bg-surface/[0.02] p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Consent records</p>
                        <p className="mt-2 text-lg font-black text-foreground-muted">{complianceRequirements.filter((item: any) => item.requirement_kind === 'consent').length}</p>
                        <p className="mt-2 text-xs text-foreground-muted">Versioned by locale, purpose, actor, and timestamp</p>
                      </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                      <div className="space-y-4">
                        <h4 className="text-sm font-black uppercase tracking-widest text-foreground-muted">Role requirements</h4>
                        {['customer', 'courier', 'merchant'].map((role) => {
                          const roleItems = complianceRequirements.filter((item: any) => item.role_code === role);
                          return (
                            <div key={role} className="rounded-3xl border border-border bg-surface/[0.02] p-5">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-black capitalize text-foreground-muted">{role}</span>
                                <span className="text-xs text-foreground-muted">{roleItems.length} requirements</span>
                              </div>
                              <div className="mt-3 space-y-2">
                                {roleItems.map((item: any) => (
                                  <div key={`${role}-${item.requirement_code}`} className="flex items-center justify-between gap-4 text-xs text-foreground-muted">
                                    <span>{item.requirement_code}</span>
                                    <span className="text-right text-foreground-muted">{item.requirement_kind} · {item.locale}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-sm font-black uppercase tracking-widest text-foreground-muted">Retention & artifact access</h4>
                        {[...complianceDataPolicies, ...complianceArtifactPolicies].map((item: any, index: number) => (
                          <div key={`${item.data_class || item.artifact_type}-${index}`} className="flex items-center justify-between gap-4 rounded-3xl border border-border bg-surface/[0.02] p-5">
                            <div>
                              <p className="text-sm font-black text-foreground-muted">{item.data_class || item.artifact_type}</p>
                              <p className="mt-1 text-xs text-foreground-muted">{item.role_code ? `${item.role_code} · ` : ''}{item.storage_access_class || item.legal_basis || 'market policy'}</p>
                            </div>
                            <div className="text-right text-xs text-foreground-muted">
                              <p>{item.retention_days} days</p>
                              <p className="mt-1">{item.export_mode} · {item.deletion_mode}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black uppercase tracking-widest text-foreground-muted">Service categories by market</h4>
                        <span className="text-xs text-foreground-muted">Managed in Market Configuration</span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {complianceServiceCategories.map((item: any) => (
                          <div key={`${item.city_code}-${item.service_code}`} className="flex items-center justify-between rounded-2xl border border-border bg-surface/[0.02] px-4 py-3">
                            <div>
                              <p className="text-sm font-bold text-foreground-muted">{item.service_code}</p>
                              <p className="text-xs text-foreground-muted">{item.city_code}</p>
                            </div>
                            <StatusBadge status={item.is_enabled ? 'enabled' : 'disabled'} label={item.is_enabled ? 'Aktif' : 'Nonaktif'} labelPrefix="Compliance service status" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-3xl border border-warning bg-warning-surface p-6 text-sm text-warning">No compliance policy is available for this market.</div>
                )}
              </motion.div>
    </>
  );
}
