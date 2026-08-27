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
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-8"
              >
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                  <div>
                    <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                      <Map className="text-primary-light" size={24} />
                      Runtime Maps Provider
                    </h3>
                    <p className="text-zinc-500 mt-2 max-w-2xl">
                      Switch TomTom Maps, OpenStreetMap, or text-only fallback for customer mobile, courier mobile, and web without rebuilding apps.
                    </p>
                  </div>
                  <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })}
                    className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-zinc-200 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Refresh Runtime
                  </button>
                </div>

                {isLoadingMapsProvider ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1, 2, 3, 4].map((item) => (
                      <div key={item} className="h-40 rounded-[32px] bg-white/[0.03] animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
                      <div className={cn(
                        "p-6 rounded-[32px] border space-y-5",
                        mapsProviderConfig?.ops?.status === 'critical'
                          ? "bg-red-500/10 border-red-500/30"
                          : mapsProviderConfig?.ops?.status === 'degraded'
                            ? "bg-amber-500/10 border-amber-500/30"
                            : mapsProviderConfig?.ops?.status === 'disabled'
                              ? "bg-zinc-500/10 border-zinc-500/30"
                              : "bg-emerald-500/10 border-emerald-500/25"
                      )}>
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-zinc-500">Ops safety status</p>
                            <h4 className="text-2xl font-black text-zinc-100 mt-2 capitalize">{mapsProviderConfig?.ops?.status || 'operational'}</h4>
                            <p className="text-sm text-zinc-400 mt-2">
                              Active provider: <span className="text-zinc-100 font-black">{mapsProviderConfig?.ops?.active_config?.active_provider || mapsProviderConfig?.value?.active_provider}</span>
                              {' '}with fallback <span className="text-zinc-100 font-black">{mapsProviderConfig?.ops?.active_config?.fallback_provider || mapsProviderConfig?.value?.fallback_provider}</span>
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={restoreOsmMaps}
                              className="px-5 py-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 font-black text-xs uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-[0.98]"
                            >
                              Restore OSM
                            </button>
                            <button
                              onClick={emergencyDisableMaps}
                              className="px-5 py-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-200 font-black text-xs uppercase tracking-widest hover:bg-red-500/20 transition-all active:scale-[0.98]"
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
                            <div key={metric.label} className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3">
                              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">{metric.label}</p>
                              <p className="text-lg text-zinc-100 font-black mt-1">{metric.value}</p>
                            </div>
                          ))}
                        </div>
                        {mapsProviderConfig?.ops?.last_error && (
                          <div className="rounded-2xl bg-black/20 border border-white/10 px-4 py-3">
                            <p className="text-[10px] text-red-300 font-black uppercase tracking-widest">Last provider issue</p>
                            <p className="text-sm text-zinc-300 mt-2">
                              {mapsProviderConfig.ops.last_error.provider} - {mapsProviderConfig.ops.last_error.error_message || mapsProviderConfig.ops.last_error.fallback_reason}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="p-6 rounded-[32px] bg-white/[0.03] border border-white/10 space-y-4">
                        <div className="flex items-center gap-3">
                          <ShieldAlert className="text-amber-300" size={20} />
                          <div>
                            <p className="text-zinc-100 font-black">Provider Alerts</p>
                            <p className="text-xs text-zinc-500">Quota, latency, fallback, and disabled-mode signals.</p>
                          </div>
                        </div>
                        {(mapsProviderConfig?.ops?.active_alerts || []).length === 0 ? (
                          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-200 font-bold">
                            Tidak ada alert aktif.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {mapsProviderConfig.ops.active_alerts.map((alert: any) => (
                              <div key={alert.code} className={cn(
                                "rounded-2xl border px-4 py-3",
                                alert.severity === 'critical'
                                  ? "bg-red-500/10 border-red-500/25"
                                  : alert.severity === 'warning'
                                    ? "bg-amber-500/10 border-amber-500/25"
                                    : "bg-blue-500/10 border-blue-500/25"
                              )}>
                                <p className="text-xs text-zinc-100 font-black uppercase tracking-widest">{alert.code.replaceAll('_', ' ')}</p>
                                <p className="text-sm text-zinc-400 mt-1">{alert.message}</p>
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
                              active ? "bg-primary/15 border-primary/50 shadow-lg shadow-primary/10" : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06]"
                            )}
                          >
                            <p className="text-zinc-100 font-black text-lg">{provider.label}</p>
                            <p className="text-zinc-500 text-sm mt-2 leading-relaxed">{provider.hint}</p>
                            <span className={cn(
                              "inline-flex mt-5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                              active ? "bg-primary text-white" : "bg-white/5 text-zinc-500"
                            )}>
                              {active ? 'Active' : 'Available'}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-zinc-100 font-black tracking-tight">Client Scope Policy</h4>
                        <p className="text-zinc-500 text-sm">Each client resolves its own provider and falls back safely if a key/provider is unavailable.</p>
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
                            <div key={scope.id} className="p-6 rounded-[32px] bg-white/[0.03] border border-white/10 space-y-5">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-zinc-100 font-black">{scope.label}</p>
                                  <p className="text-xs text-zinc-500 mt-1">
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
                                    scopeConfig.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
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
                                        ? "bg-primary text-white"
                                        : "bg-white/5 text-zinc-500 hover:text-zinc-200"
                                    )}
                                  >
                                    {provider === 'openstreetmap' ? 'OSM' : provider === 'tomtom_maps' ? 'TomTom' : 'Text'}
                                  </button>
                                ))}
                              </div>
                              {resolved?.reason && (
                                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
                                  Fallback active: {resolved.reason.replaceAll('_', ' ')}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/5">
                      <label className="space-y-3">
                        <span className="text-xs font-black text-zinc-600 uppercase tracking-widest">Runtime config TTL seconds</span>
                        <input
                          type="number"
                          min={30}
                          max={3600}
                          defaultValue={mapsProviderConfig?.value?.config_ttl_seconds || 300}
                          onBlur={(event) => updateMapsProviderMutation.mutate({ config_ttl_seconds: Number(event.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </label>
                      <label className="space-y-3">
                        <span className="text-xs font-black text-zinc-600 uppercase tracking-widest">OSM tile template</span>
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
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </label>
                    </div>
                  </>
                )}
              </motion.div>
    </>
  );
}