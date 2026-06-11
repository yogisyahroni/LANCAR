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
  Map
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'

export default function Settings() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('General')
  const [showApiKey, setShowApiKey] = useState(false)
  const [activeModel, setActiveModel] = useState('P2P')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    name: '',
    role: 'ops_admin',
    phoneNumber: ''
  })
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false)
  const [selectedFlag, setSelectedFlag] = useState<any>(null)
  const [flagReason, setFlagReason] = useState('')

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [registerFlagForm, setRegisterFlagForm] = useState({
    key: '',
    name: '',
    category: 'System',
    description: '',
    is_enabled: false,
    reason: ''
  })

  const tabs = [
    { id: 'General', icon: Globe },
    { id: 'Maps Provider', icon: Map },
    { id: 'Feature Flags', icon: Flag },
    { id: 'SLA Config', icon: Timer },
    { id: 'Insurance', icon: Umbrella },
    { id: 'Wallet & Fees', icon: DollarSign },
    { id: 'Parameters', icon: Sliders },
    { id: 'Security', icon: Shield },
    { id: 'Team', icon: Users },
    { id: 'Audit Logs', icon: History },
  ]

  // Fetch Feature Flags
  const { data: flags = [], isLoading: isLoadingFlags } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const res = await api.get('/admin/feature-flags')
      return res.data
    }
  })

  // Fetch System Configs
  const { data: configs = [], isLoading: isLoadingConfigs } = useQuery({
    queryKey: ['system-configs'],
    queryFn: async () => {
      const res = await api.get('/admin/settings')
      return res.data
    }
  })

  // Fetch Admin Team
  const { data: admins = [], isLoading: isLoadingAdmins } = useQuery({
    queryKey: ['admin-team'],
    queryFn: async () => {
      const res = await api.get('/admin/admins')
      return res.data
    }
  })

  // Fetch System Health
  const { data: healthData = [], isLoading: isLoadingHealth } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await api.get('/admin/health')
      // Normalize: backend lama return object, backend baru return array
      const raw = res.data
      if (Array.isArray(raw)) return raw
      if (raw.components && Array.isArray(raw.components)) return raw.components
      
      return []
    }
  })

  const { data: mapsProviderConfig, isLoading: isLoadingMapsProvider } = useQuery({
    queryKey: ['maps-provider-config'],
    queryFn: async () => {
      const res = await api.get('/admin/maps-provider-config')
      return res.data
    }
  })

  // Fetch Audit Logs
  const { data: auditLogs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const res = await api.get('/admin/audit-logs')
      return res.data
    }
  })

  // Mutations
  const updateFlagMutation = useMutation({
    mutationFn: async ({ key, is_enabled, reason }: { key: string, is_enabled: boolean, reason: string }) => {
      return api.patch(`/admin/feature-flags/${key}/toggle`, { new_enabled: is_enabled, reason })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] })
      toast.success('Feature flag updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update flag')
    }
  })

  const createFlagMutation = useMutation({
    mutationFn: async (data: typeof registerFlagForm) => {
      return api.post('/admin/feature-flags', {
        key: data.key,
        category: data.category,
        description: data.description,
        is_enabled: data.is_enabled,
        reason: data.reason,
        name: data.name
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] })
      setIsRegisterModalOpen(false)
      setRegisterFlagForm({
        key: '',
        name: '',
        category: 'System',
        description: '',
        is_enabled: false,
        reason: ''
      })
      toast.success('New feature flag registered')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to register flag')
    }
  })

  const updateConfigMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string, value: any }) => {
      return api.patch(`/admin/settings/${key}`, { value })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-configs'] })
      toast.success('System configuration updated')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update configuration')
    }
  })

  const updateMapsProviderMutation = useMutation({
    mutationFn: async (value: any) => {
      return api.patch('/admin/maps-provider-config', value)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps-provider-config'] })
      queryClient.invalidateQueries({ queryKey: ['system-configs'] })
      toast.success('Maps provider runtime config updated')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update maps provider')
    }
  })

  const emergencyDisableMaps = () => {
    updateMapsProviderMutation.mutate({
      enabled: false,
      active_provider: 'disabled',
      fallback_provider: 'disabled',
      disabled_mode_enabled: true,
      scopes: {
        global: { enabled: false, provider: 'disabled' },
        customer_mobile: { enabled: false, provider: 'disabled' },
        courier_mobile: { enabled: false, provider: 'disabled' },
        web_customer: { enabled: false, provider: 'disabled' },
        tracking: { enabled: false, provider: 'disabled' },
      },
    })
  }

  const restoreOsmMaps = () => {
    updateMapsProviderMutation.mutate({
      enabled: true,
      active_provider: 'openstreetmap',
      fallback_provider: 'openstreetmap',
      openstreetmap_enabled: true,
      disabled_mode_enabled: true,
      scopes: {
        global: { enabled: true, provider: 'openstreetmap' },
        customer_mobile: { enabled: true, provider: 'openstreetmap' },
        courier_mobile: { enabled: true, provider: 'openstreetmap' },
        web_customer: { enabled: true, provider: 'openstreetmap' },
        tracking: { enabled: true, provider: 'openstreetmap' },
      },
    })
  }

  const deleteAdminMutation = useMutation({
    mutationFn: async (adminId: string) => {
      return api.delete(`/admin/admins/${adminId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-team'] })
      toast.success('Admin removed from team')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to remove admin')
    }
  })

  const inviteAdminMutation = useMutation({
    mutationFn: async (data: typeof inviteForm) => {
      return api.post('/admin/admins', {
        email: data.email,
        full_name: data.name,
        role: data.role,
        phone_number: data.phoneNumber
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-team'] })
      setIsInviteModalOpen(false)
      setInviteForm({ email: '', name: '', role: 'ops_admin', phoneNumber: '' })
      toast.success('Invitation sent to new admin')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to send invitation')
    }
  })

  // Helper to get config value
  const getConfig = (key: string, defaultValue: any) => {
    const item = configs.find((c: any) => c.key === key)
    if (!item) return defaultValue
    
    // Handle JSON string or raw value
    if (typeof item.value === 'string') {
      try {
        return JSON.parse(item.value)
      } catch (e) {
        return item.value
      }
    }
    return item.value
  }
  const visibleFlags = flags.filter((flag: any) => !['model_two_legs', 'model_three_legs', 'three_legs_relay'].includes(flag.key))

  // SLA mapping (Dynamic from backend)
  const slaData = getConfig('sla_config', {
    'P2P': [
      { stage: 'Pickup Window', target: '10m', critical: '15m' },
      { stage: 'Direct Delivery', target: '30m', critical: '45m' }
    ]
  })

  // Hanya block di loading awal pertama kali — flags adalah data paling critical
  // Query lain (configs, admins, health, logs) punya default `[]` sehingga aman dirender
  if (isLoadingFlags && isLoadingConfigs) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-zinc-500 font-black uppercase tracking-widest text-xs">Synchronizing Hub...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">System Settings</h1>
          <p className="text-zinc-500 mt-1">Manage platform configuration, feature flags, and dynamic parameters.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              queryClient.invalidateQueries()
              toast.info('Syncing latest configuration...')
            }}
            className="px-8 py-3 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <Save size={18} />
            Sync Now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-200 group text-left",
                activeTab === tab.id 
                  ? "bg-primary text-white shadow-lg shadow-primary/10" 
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              )}
            >
              <tab.icon size={20} className={cn(activeTab === tab.id ? "text-white" : "group-hover:text-primary-light")} />
              <span className="font-bold text-sm uppercase tracking-widest">{tab.id}</span>
            </button>
          ))}
          

        </div>

        {/* Content Area */}
        <div className="lg:col-span-3 space-y-8">
          <AnimatePresence mode="wait">
            {activeTab === 'General' && (
              <motion.div 
                key="general"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-10"
              >
                <div className="space-y-6">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Globe className="text-primary-light" size={24} />
                    Platform Information
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Platform Name</label>
                      <input 
                        type="text" 
                        defaultValue={getConfig('platform_name', 'TEMBUS Logistics Hub')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'platform_name', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Support Email</label>
                      <input 
                        type="email" 
                        defaultValue={getConfig('support_email', 'ops@tembus.id')}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'support_email', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t border-white/5 space-y-6">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Smartphone className="text-primary-light" size={24} />
                    System Health
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {(Array.isArray(healthData) ? healthData : []).map((app: any) => (
                      <div key={app.label} className="p-6 rounded-[32px] bg-white/[0.02] border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{app.label}</p>
                          <span className={cn(
                            "w-2 h-2 rounded-full",
                            app.status === 'Stable' || app.status === 'Healthy' || app.status === 'Live' || app.status === 'Optimal' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" : "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                          )} />
                        </div>
                        <p className="text-lg font-black text-zinc-100">{app.version}</p>
                        <div className="flex items-center justify-between pt-2">
                           <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{app.status}</p>
                           <p className="text-[10px] text-primary-light font-black tracking-tight">{app.metrics}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Maps Provider' && (
              <motion.div
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
            )}

            {activeTab === 'Feature Flags' && (
              <motion.div 
                key="flags"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                      <Flag className="text-primary-light" size={24} />
                      Feature Management
                    </h3>
                    <div className="flex gap-2">
                       <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest border border-amber-500/20">Super Admin Only</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {visibleFlags.map((flag: any) => (
                      <div key={flag.id} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-primary/20 transition-all group relative overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                           <div className="flex items-center gap-3">
                              <div className={cn("p-2 rounded-xl", flag.is_enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500")}>
                                {flag.is_enabled ? <Zap size={18} /> : <Lock size={18} />}
                              </div>
                              <p className="text-sm font-black text-zinc-200">{flag.name || flag.key}</p>
                           </div>
                           <button 
                             onClick={() => {
                               setSelectedFlag(flag);
                               setFlagReason('');
                               setIsFlagModalOpen(true);
                             }}
                             className={cn(
                               "w-12 h-6 rounded-full relative transition-all duration-300",
                               flag.is_enabled ? "bg-primary" : "bg-zinc-800"
                             )}>
                               <div className={cn(
                                 "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                                 flag.is_enabled ? "right-1" : "left-1"
                               )} />
                             </button>
                        </div>
                        <p className="text-xs text-zinc-600 font-medium leading-relaxed">{flag.description}</p>
                        <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full blur-2xl -translate-y-8 translate-x-8 opacity-0 group-hover:opacity-100 transition-all" />
                      </div>
                    ))}
                  </div>
                  
                  <button 
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="w-full py-4 rounded-2xl border border-dashed border-white/10 text-zinc-600 hover:text-zinc-400 hover:border-white/20 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest"
                  >
                    <Plus size={16} />
                    Register New Feature Flag
                  </button>
                </div>
              </motion.div>
            )}

            {activeTab === 'SLA Config' && (
              <motion.div 
                key="sla"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="glass-card p-10 rounded-[48px] border-white/5 space-y-10">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                      <Timer className="text-primary-light" size={24} />
                      SLA Thresholds
                    </h3>
                    <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 w-fit">
                      {['P2P'].map(model => (
                        <button 
                          key={model}
                          onClick={() => setActiveModel(model)}
                          className={cn(
                            "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            activeModel === model ? "bg-primary text-white shadow-lg" : "text-zinc-600 hover:text-zinc-300"
                          )}
                        >
                          {model}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    {slaData[activeModel as keyof typeof slaData]?.map((item: any, i: number) => (
                      <div key={i} className="p-6 rounded-[32px] bg-white/[0.02] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <p className="text-sm font-black text-zinc-200 uppercase tracking-widest">{item.stage}</p>
                        <div className="flex items-center gap-4">
                           <div className="space-y-1">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block">Target</label>
                              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                                <input 
                                  type="text" 
                                  defaultValue={item.target} 
                                  onBlur={(e) => {
                                    const newSlaData = { ...slaData };
                                    newSlaData[activeModel as keyof typeof slaData][i].target = e.target.value;
                                    updateConfigMutation.mutate({ key: 'sla_config', value: newSlaData });
                                  }}
                                  className="bg-transparent w-10 text-xs font-bold text-zinc-100 focus:outline-none" 
                                />
                                <Clock size={12} className="text-zinc-600" />
                              </div>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block">Critical</label>
                              <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-2">
                                <input 
                                  type="text" 
                                  defaultValue={item.critical} 
                                  onBlur={(e) => {
                                    const newSlaData = { ...slaData };
                                    newSlaData[activeModel as keyof typeof slaData][i].critical = e.target.value;
                                    updateConfigMutation.mutate({ key: 'sla_config', value: newSlaData });
                                  }}
                                  className="bg-transparent w-10 text-xs font-bold text-red-400 focus:outline-none" 
                                />
                                <ShieldAlert size={12} className="text-red-500/40" />
                              </div>
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-6 border-t border-white/5 flex items-center gap-3">
                     <Target size={18} className="text-amber-500" />
                     <p className="text-[10px] text-zinc-500 italic font-medium">SLA targets are dynamically adjusted during peak hours and weather surges.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Insurance' && (
              <motion.div 
                key="insurance"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-10"
              >
                <div className="space-y-8">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Umbrella className="text-primary-light" size={24} />
                    Insurance Policy Settings
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Premium Rate (%)</label>
                      <div className="relative">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">%</span>
                        <input 
                          type="number" 
                          step="0.01"
                          defaultValue={getConfig('insurance_premium_rate', 0.1)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'insurance_premium_rate', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 font-bold italic">Percentage of declared value per order.</p>
                    </div>

                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Minimum Premium (IDR)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                        <input 
                          type="number" 
                          defaultValue={getConfig('insurance_min_premium', 2000)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'insurance_min_premium', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 font-bold italic">Minimum fee if rate calculation is lower.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Maximum Coverage (IDR)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">Rp</span>
                        <input 
                          type="number" 
                          defaultValue={getConfig('insurance_max_coverage', 25000000)}
                          onBlur={(e) => updateConfigMutation.mutate({ key: 'insurance_max_coverage', value: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600 font-bold italic">Maximum replacement value per order.</p>
                    </div>

                    <div className="space-y-4">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Insurance Provider</label>
                      <select 
                        defaultValue={getConfig('insurance_provider', 'Internal / Managed')}
                        onChange={(e) => updateConfigMutation.mutate({ key: 'insurance_provider', value: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
                      >
                        <option>Internal / Managed</option>
                        <option>PasarPolis Integration</option>
                        <option>AXA Mandiri</option>
                      </select>
                      <p className="text-[10px] text-zinc-600 font-bold italic">Active partner for claim settlements.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Wallet & Fees' && (
              <motion.div 
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
                    <div className="space-y-3">
                      <label className="text-xs font-black text-zinc-600 uppercase tracking-widest group relative">
                        Platform Fee (IDR)
                        <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-zinc-800 text-[10px] text-zinc-300 rounded-lg shadow-xl z-10 normal-case tracking-normal">
                          Biaya operasional tersembunyi (seperti OTP/Infra) yang dibebankan ke dalam total harga secara dinamis.
                        </div>
                      </label>
                      <input 
                        type="number" 
                        defaultValue={getConfig('platform_fee_idr', 1000)}
                        onBlur={(e) => updateConfigMutation.mutate({ key: 'platform_fee_idr', value: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-black focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
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
            )}

            {activeTab === 'Parameters' && (
              <motion.div 
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
                </div>
              </motion.div>
            )}

            {activeTab === 'Security' && (
              <motion.div 
                key="security"
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-10 rounded-[48px] border-white/5 space-y-10"
              >
                <div className="space-y-6">
                  <h3 className="text-xl font-black text-zinc-100 flex items-center gap-3 tracking-tight">
                    <Lock className="text-primary-light" size={24} />
                    API Keys & Access
                  </h3>
                  
                  <div className="space-y-4">
                    <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Public API Key</label>
                    <div className="relative">
                      <input 
                        type={showApiKey ? "text" : "password"} 
                        readOnly
                        value={getConfig('security_public_api_key', 'pk_live_*************************')}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-zinc-100 font-mono text-sm focus:outline-none"
                      />
                      <button 
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                      >
                        {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {[
                      { label: 'Force 2FA for Admins', key: 'security_force_2fa' },
                      { label: 'Session Timeout (h)', key: 'security_session_timeout_h' },
                      { label: 'IP Whitelisting', key: 'security_ip_whitelisting' },
                    ].map((rule) => {
                      const value = getConfig(rule.key, false);
                      const isToggle = typeof value === 'boolean' && rule.key !== 'security_session_timeout_h';
                      
                      return (
                        <div key={rule.key} className="flex items-center justify-between p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                          <span className="text-sm font-black text-zinc-200">{rule.label}</span>
                          {isToggle ? (
                            <button 
                              onClick={() => updateConfigMutation.mutate({ key: rule.key, value: !value })}
                              className={cn(
                                "w-12 h-6 rounded-full relative transition-all duration-300",
                                value ? "bg-primary" : "bg-zinc-800"
                              )}
                            >
                              <div className={cn(
                                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                                value ? "right-1" : "left-1"
                              )} />
                            </button>
                          ) : (
                          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                                <input 
                                  type="number" 
                                  defaultValue={value as number || 0}
                                  onBlur={(e) => {
                                    const val = Number(e.target.value);
                                    if (!isNaN(val)) updateConfigMutation.mutate({ key: rule.key, value: val });
                                  }}
                                  className="bg-transparent w-8 text-xs font-bold text-zinc-100 focus:outline-none" 
                                />
                                <Clock size={12} className="text-zinc-600" />
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Team' && (
              <motion.div 
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
            )}
            {activeTab === 'Audit Logs' && (
              <motion.div 
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
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Invite Admin Modal */}
      <AnimatePresence>
        {isInviteModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsInviteModalOpen(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-[40px] shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                  <Users className="text-primary-light" size={24} />
                  Invite New Admin
                </h3>
                <button 
                  onClick={() => setIsInviteModalOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-all text-zinc-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
                    <input 
                      type="text" 
                      placeholder="e.g. John Doe"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
                    <input 
                      type="email" 
                      placeholder="john@tembus.id"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Role</label>
                    <select 
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
                    >
                      <option value="ops_admin">Ops Admin</option>
                      <option value="finance_admin">Finance Admin</option>
                      <option value="cs_agent">CS Agent</option>
                      <option value="zone_manager">Zone Manager</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Phone Number</label>
                    <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
                      <input 
                        type="tel" 
                        placeholder="+62..."
                        value={inviteForm.phoneNumber}
                        onChange={(e) => setInviteForm({ ...inviteForm, phoneNumber: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 pt-4 bg-white/[0.02] border-t border-white/5 flex gap-4">
                <button 
                  onClick={() => setIsInviteModalOpen(false)}
                  className="flex-1 py-4 rounded-2xl bg-white/5 text-zinc-400 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => inviteAdminMutation.mutate(inviteForm)}
                  disabled={inviteAdminMutation.isPending || !inviteForm.email || !inviteForm.name}
                  className="flex-1 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary-light shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {inviteAdminMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Send Invitation
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {/* Register Flag Modal */}
        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRegisterModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-zinc-900 border border-white/10 rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                    <Plus size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white tracking-tight">Register Flag</h2>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Add new system feature control</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/5 text-zinc-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Flag Key (Unique ID)</label>
                    <input 
                      type="text"
                      placeholder="e.g. beta_checkout_flow"
                      value={registerFlagForm.key}
                      onChange={(e) => setRegisterFlagForm({...registerFlagForm, key: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Display Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. Beta Checkout"
                      value={registerFlagForm.name}
                      onChange={(e) => setRegisterFlagForm({...registerFlagForm, name: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {['System', 'UX', 'Pricing', 'Experimental', 'Beta'].map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setRegisterFlagForm({...registerFlagForm, category: cat})}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                          registerFlagForm.category === cat 
                            ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                            : "bg-white/5 text-zinc-500 border-white/5 hover:border-white/10"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Description</label>
                  <textarea 
                    placeholder="Describe what this feature flag controls..."
                    value={registerFlagForm.description}
                    onChange={(e) => setRegisterFlagForm({...registerFlagForm, description: e.target.value})}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex justify-between">
                    <span>Initial Audit Reason</span>
                    <span className={cn(registerFlagForm.reason.length >= 10 ? "text-emerald-500" : "text-amber-500")}>
                      {registerFlagForm.reason.length}/10 min chars
                    </span>
                  </label>
                  <textarea 
                    placeholder="Why is this flag being created?"
                    value={registerFlagForm.reason}
                    onChange={(e) => setRegisterFlagForm({...registerFlagForm, reason: e.target.value})}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                  />
                </div>

                <label className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5 cursor-pointer hover:bg-white/[0.05] transition-all">
                  <input 
                    type="checkbox"
                    checked={registerFlagForm.is_enabled}
                    onChange={(e) => setRegisterFlagForm({...registerFlagForm, is_enabled: e.target.checked})}
                    className="w-5 h-5 rounded border-white/10 bg-white/5 text-primary focus:ring-offset-0 focus:ring-0"
                  />
                  <div>
                    <p className="text-xs font-black text-zinc-200 uppercase tracking-tight">Enable by Default</p>
                    <p className="text-[10px] text-zinc-500 font-medium">Activate this feature immediately upon registration</p>
                  </div>
                </label>
              </div>

              <div className="p-8 pt-4 bg-white/[0.02] border-t border-white/5 flex gap-4">
                <button 
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="flex-1 py-4 rounded-2xl bg-white/5 text-zinc-400 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => createFlagMutation.mutate(registerFlagForm)}
                  disabled={
                    createFlagMutation.isPending || 
                    !registerFlagForm.key || 
                    !registerFlagForm.name || 
                    registerFlagForm.reason.length < 10
                  }
                  className="flex-1 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary-light transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createFlagMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Register Flag
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Toggle Flag Modal */}
        {isFlagModalOpen && selectedFlag && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFlagModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn("p-3 rounded-2xl", selectedFlag.is_enabled ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400")}>
                    {selectedFlag.is_enabled ? <Lock size={24} /> : <Zap size={24} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white tracking-tight">
                      {selectedFlag.is_enabled ? 'Disable' : 'Enable'} Feature
                    </h2>
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{selectedFlag.name || selectedFlag.key}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsFlagModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/5 text-zinc-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                  <p className="text-sm text-zinc-400 leading-relaxed italic">"{selectedFlag.description}"</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex justify-between">
                    <span>Reason for Change</span>
                    <span className={cn(flagReason.length >= 10 ? "text-emerald-500" : "text-amber-500")}>
                      {flagReason.length}/10 min chars
                    </span>
                  </label>
                  <textarea 
                    placeholder="Provide a detailed reason for this change (e.g., scheduled maintenance, performance testing...)"
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                  />
                </div>
              </div>

              <div className="p-8 pt-4 bg-white/[0.02] border-t border-white/5 flex gap-4">
                <button 
                  onClick={() => setIsFlagModalOpen(false)}
                  className="flex-1 py-4 rounded-2xl bg-white/5 text-zinc-400 font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    updateFlagMutation.mutate({ 
                      key: selectedFlag.key, 
                      is_enabled: !selectedFlag.is_enabled,
                      reason: flagReason,
                      checklist_data: undefined
                    } as any);
                    setIsFlagModalOpen(false);
                  }}
                  disabled={
                    updateFlagMutation.isPending || 
                    flagReason.length < 10 || 
                    false
                  }
                  className={cn(
                    "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2",
                    selectedFlag.is_enabled ? "bg-red-500 text-white hover:bg-red-600 shadow-red-500/20" : "bg-primary text-white hover:bg-primary-light shadow-primary/20"
                  )}
                >
                  {updateFlagMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : (selectedFlag.is_enabled ? <Lock size={16} /> : <Zap size={16} />)}
                  Confirm {selectedFlag.is_enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

      </AnimatePresence>
    </div>
  )
}
