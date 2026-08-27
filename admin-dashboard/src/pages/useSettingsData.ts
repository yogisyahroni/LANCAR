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
  Truck
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toast } from 'sonner'

const PREDEFINED_FLAGS = [
  { key: 'custom', name: '-- Custom / Other --', description: 'Create a brand new feature flag', category: 'Experimental' },
  { key: 'customer_auth_otp_required', name: 'Customer Auth OTP', description: 'Require OTP for customer registration and login', category: 'System' },
  { key: 'require_payment_gateway', name: 'Require Payment Gateway', description: 'Enable or bypass the payment gateway for orders', category: 'System' },
  { key: 'payment_provider_xendit', name: 'Xendit Payment Provider', description: 'Enable Xendit as a payment provider', category: 'System' },
  { key: 'payment_provider_midtrans', name: 'Midtrans Payment Provider', description: 'Enable Midtrans as a payment provider', category: 'System' },
];

export function useSettingsData() {
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
    { id: 'Logistics AWB', icon: Truck },
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

  return {
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
  };
}

export type SettingsData = ReturnType<typeof useSettingsData>;
