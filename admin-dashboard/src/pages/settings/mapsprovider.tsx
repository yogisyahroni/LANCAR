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

export function MapsProviderPanel({ data }: { data: SettingsData }) {
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
                key="maps-provider"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-border space-y-8"
              >
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                  <div>
                    <h3 className="text-xl font-black text-foreground-muted flex items-center gap-3 tracking-tight">
                      <Map className="text-primary-light" size={24} aria-hidden="true" />
                      Runtime Maps Provider
                    </h3>
                    <p className="text-foreground-muted mt-2 max-w-2xl">
                      Switch TomTom Maps, OpenStreetMap, or text-only fallback for customer mobile, courier mobile, and web without rebuilding apps.
                    </p>
                  </div>
                  <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })}
                    className="px-5 py-3 rounded-2xl bg-surface-subtle border border-border text-foreground-muted font-black text-xs uppercase tracking-widest hover:bg-surface-subtle transition-all"
                  >
                    Refresh Runtime
                  </button>
                </div>

                {isLoadingMapsProvider ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1, 2, 3, 4].map((item) => (
                      <div key={item} className="h-40 rounded-[32px] bg-surface/[0.03] animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
                      <div className={cn(
                        "p-6 rounded-[32px] border space-y-5",
                        mapsProviderConfig?.ops?.status === 'critical'
                          ? "bg-error-surface border-error"
                          : mapsProviderConfig?.ops?.status === 'degraded'
                            ? "bg-warning-surface border-warning"
                            : mapsProviderConfig?.ops?.status === 'disabled'
                              ? "bg-surface-subtle border-border"
                              : "bg-success-surface border-success"
                      )}>
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-foreground-muted">Ops safety status</p>
                            <StatusBadge status={mapsProviderConfig?.ops?.status || 'operational'} labelPrefix="Maps operations status" className="mt-2 text-sm uppercase" />
                            <p className="text-sm text-foreground-muted mt-2">
                              Active provider: <span className="text-foreground-muted font-black">{mapsProviderConfig?.ops?.active_config?.active_provider || mapsProviderConfig?.value?.active_provider}</span>
                              {' '}with fallback <span className="text-foreground-muted font-black">{mapsProviderConfig?.ops?.active_config?.fallback_provider || mapsProviderConfig?.value?.fallback_provider}</span>
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={restoreOsmMaps}
                              className="px-5 py-3 rounded-2xl bg-success-surface border border-success text-success font-black text-xs uppercase tracking-widest hover:bg-success-surface transition-all active:scale-[0.98]"
                            >
                              Restore OSM
                            </button>
                            <button
                              onClick={emergencyDisableMaps}
                              className="px-5 py-3 rounded-2xl bg-error-surface border border-error text-error font-black text-xs uppercase tracking-widest hover:bg-error-surface transition-all active:scale-[0.98]"
                            >
                              Emergency Disable
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {[
                            { label: 'Avg latency', value: `${mapsProviderConfig?.ops?.latency?.average_ms || 0}ms` },
                            { label: 'P95 latency', value: `${mapsProviderConfig?.ops?.latency?.p95_ms || 0}ms` },
                            { label: 'Cache hit', value: mapsProviderConfig?.ops?.cache?.hits || 0 },
                            { label: 'Fallback', value: mapsProviderConfig?.ops?.fallback?.total || 0 },
                            { label: 'Route OK', value: `${mapsProviderConfig?.ops?.route_quality?.road_route_successes || 0}/${mapsProviderConfig?.ops?.route_quality?.route_events || 0}` },
                            { label: 'Anomaly', value: mapsProviderConfig?.ops?.route_quality?.distance_anomalies || 0 },
                          ].map((metric) => (
                            <div key={metric.label} className="rounded-2xl bg-surface-subtle border border-border px-4 py-3">
                              <p className="text-[10px] text-foreground-muted font-black uppercase tracking-widest">{metric.label}</p>
                              <p className="text-lg text-foreground-muted font-black mt-1">{metric.value}</p>
                            </div>
                          ))}
                        </div>
                        {mapsProviderConfig?.ops?.last_error && (
                          <div className="rounded-2xl bg-surface-subtle border border-border px-4 py-3">
                            <p className="text-[10px] text-error font-black uppercase tracking-widest">Last provider issue</p>
                            <p className="text-sm text-foreground-muted mt-2">
                              {mapsProviderConfig.ops.last_error.provider} - {mapsProviderConfig.ops.last_error.error_message || mapsProviderConfig.ops.last_error.fallback_reason}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="p-6 rounded-[32px] bg-surface/[0.03] border border-border space-y-4">
                        <div className="flex items-center gap-3">
                          <ShieldAlert className="text-warning" size={20} aria-hidden="true" />
                          <div>
                            <p className="text-foreground-muted font-black">Provider Alerts</p>
                            <p className="text-xs text-foreground-muted">Quota, latency, fallback, and disabled-mode signals.</p>
                          </div>
                        </div>
                        {(mapsProviderConfig?.ops?.active_alerts || []).length === 0 ? (
                          <div className="rounded-2xl bg-success-surface border border-success px-4 py-3 text-sm text-success font-bold">
                            Tidak ada alert aktif.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {mapsProviderConfig.ops.active_alerts.map((alert: any) => (
                              <div key={alert.code} className={cn(
                                "rounded-2xl border px-4 py-3",
                                alert.severity === 'critical'
                                  ? "bg-error-surface border-error"
                                  : alert.severity === 'warning'
                                    ? "bg-warning-surface border-warning"
                                    : "bg-info-surface border-info"
                              )}>
                                <p className="text-xs text-foreground-muted font-black uppercase tracking-widest">{alert.code.replaceAll('_', ' ')}</p>
                                <p className="text-sm text-foreground-muted mt-1">{alert.message}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                        { id: 'openstreetmap', label: 'OpenStreetMap', hint: 'No API key required; safe fallback for staging.' },
                        { id: 'tomtom_maps', label: 'TomTom Maps', hint: 'Uses restricted server, Android, and browser keys per surface.' },
                        { id: 'disabled', label: 'Text Only', hint: 'No tiles. Coordinates, ETA fallback, and status still work.' },
                      ].map((provider) => {
                        const active = mapsProviderConfig?.value?.active_provider === provider.id
                        return (
                          <button
                            key={provider.id}
                            onClick={() => updateMapsProviderMutation.mutate({ active_provider: provider.id })}
                            className={cn(
                              "p-6 rounded-[32px] border text-left transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]",
                              active ? "bg-primary/15 border-primary/50 shadow-lg shadow-primary/10" : "bg-surface/[0.03] border-border hover:bg-surface/[0.06]"
                            )}
                          >
                            <p className="text-foreground-muted font-black text-lg">{provider.label}</p>
                            <p className="text-foreground-muted text-sm mt-2 leading-relaxed">{provider.hint}</p>
                            <span className={cn(
                              "inline-flex mt-5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                              active ? "bg-primary text-on-primary" : "bg-surface-subtle text-foreground-muted"
                            )}>
                              {active ? 'Active' : 'Available'}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-foreground-muted font-black tracking-tight">Client Scope Policy</h4>
                        <p className="text-foreground-muted text-sm">Each client resolves its own provider and falls back safely if a key/provider is unavailable.</p>
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                        {[
                          { id: 'global', label: 'Global Default' },
                          { id: 'customer_mobile', label: 'Customer Mobile' },
                          { id: 'courier_mobile', label: 'Courier Mobile' },
                          { id: 'web_customer', label: 'Customer Web' },
                          { id: 'web_admin', label: 'Admin Web' },
                        ].map((scope) => {
                          const scopeConfig = mapsProviderConfig?.value?.scopes?.[scope.id] || { provider: mapsProviderConfig?.value?.active_provider || 'openstreetmap', enabled: true }
                          const resolved = mapsProviderConfig?.resolved?.[scope.id]
                          return (
                            <div key={scope.id} className="p-6 rounded-[32px] bg-surface/[0.03] border border-border space-y-5">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-foreground-muted font-black">{scope.label}</p>
                                  <p className="text-xs text-foreground-muted mt-1">
                                    Runtime active: <span className="text-primary-light font-black">{resolved?.active_provider || scopeConfig.provider}</span>
                                  </p>
                                </div>
                                <button
                                  onClick={() => updateMapsProviderMutation.mutate({
                                    scopes: {
                                      [scope.id]: {
                                        ...scopeConfig,
                                        enabled: !scopeConfig.enabled,
                                      }
                                    }
                                  })}
                                  className={cn(
                                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    scopeConfig.enabled ? "bg-success-surface text-success" : "bg-error-surface text-error"
                                  )}
                                >
                                  {scopeConfig.enabled ? 'Enabled' : 'Disabled'}
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                {['openstreetmap', 'tomtom_maps', 'disabled'].map((provider) => (
                                  <button
                                    key={provider}
                                    onClick={() => updateMapsProviderMutation.mutate({
                                      scopes: {
                                        [scope.id]: {
                                          ...scopeConfig,
                                          provider,
                                        }
                                      }
                                    })}
                                    className={cn(
                                      "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                      scopeConfig.provider === provider
                                        ? "bg-primary text-on-primary"
                                        : "bg-surface-subtle text-foreground-muted hover:text-foreground-muted"
                                    )}
                                  >
                                    {provider === 'openstreetmap' ? 'OSM' : provider === 'tomtom_maps' ? 'TomTom' : 'Text'}
                                  </button>
                                ))}
                              </div>
                              {resolved?.reason && (
                                <p className="text-xs text-warning bg-warning-surface border border-warning rounded-2xl px-4 py-3">
                                  Fallback active: {resolved.reason.replaceAll('_', ' ')}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-border">
                      <label className="space-y-3">
                        <span className="text-xs font-black text-foreground-muted uppercase tracking-widest">Runtime config TTL seconds</span>
                        <input
                          type="number"
                          min={30}
                          max={3600}
                          defaultValue={mapsProviderConfig?.value?.config_ttl_seconds || 300}
                          onBlur={(event) => updateMapsProviderMutation.mutate({ config_ttl_seconds: Number(event.target.value) })}
                          className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-5 text-foreground-muted font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </label>
                      <label className="space-y-3">
                        <span className="text-xs font-black text-foreground-muted uppercase tracking-widest">OSM tile template</span>
                        <input
                          type="text"
                          defaultValue={mapsProviderConfig?.value?.providers?.openstreetmap?.tile_url_template || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
                          onBlur={(event) => updateMapsProviderMutation.mutate({
                            providers: {
                              openstreetmap: {
                                ...(mapsProviderConfig?.value?.providers?.openstreetmap || {}),
                                tile_url_template: event.target.value,
                              }
                            }
                          })}
                          className="w-full bg-surface-subtle border border-border rounded-2xl py-4 px-5 text-foreground-muted font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </label>
                    </div>
                  </>
                )}
              </motion.div>
    </>
  );
}
