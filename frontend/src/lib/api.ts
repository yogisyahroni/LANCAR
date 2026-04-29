import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptor for auth if needed (JWT from cookies/localstorage)
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface FeatureFlag {
  id: string;
  key: string;
  category: string;
  is_enabled: boolean;
  config: any;
  require_checklist: boolean;
  updated_at: string;
  last_updated_by?: string;
  description?: string;
}

export interface ReadinessData {
  overall_ready: boolean;
  estimated_ready_in_weeks: number;
  can_activate: boolean;
  last_updated: string;
  readiness_data: any;
}

export interface AuditLog {
  id: string;
  flag_key: string;
  action: 'create' | 'update' | 'delete' | 'toggle';
  old_value: any;
  new_value: any;
  justification: string;
  admin_id: string;
  created_at: string;
}

export const fetchFlags = async () => {
  const { data } = await api.get<FeatureFlag[]>('/admin/feature-flags');
  return data;
};

export const fetchReadiness = async () => {
  const { data } = await api.get<ReadinessData>('/admin/feature-flags/readiness/three-legs');
  return data;
};

export const toggleFlag = async (key: string, payload: { new_enabled: boolean; reason: string; totp_code: string; checklist_data?: any }) => {
  const { data } = await api.patch(`/admin/feature-flags/${key}/toggle`, payload);
  return data;
};

export const updateConfig = async (key: string, payload: { config: any; reason: string; totp_code: string }) => {
  const { data } = await api.patch(`/admin/feature-flags/${key}/config`, payload);
  return data;
};

export const fetchFlagLogs = async (key: string) => {
  const { data } = await api.get<AuditLog[]>(`/admin/feature-flags/${key}/logs`);
  return data;
};

export const createFlag = async (payload: Partial<FeatureFlag>) => {
  const { data } = await api.post('/admin/feature-flags', payload);
  return data;
};

export const fetchAllAuditLogs = async (): Promise<AuditLog[]> => {
  const { data } = await api.get('/admin/audit-logs');
  return data;
};
export const activateThreeLegs = async (payload: { totp_code: string; justification: string }) => {
  const { data } = await api.post('/admin/feature-flags/activate/three-legs', payload);
  return data;
};
