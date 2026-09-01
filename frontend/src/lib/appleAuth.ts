import { api } from './api';

export type AppleAuthPlatform = 'web' | 'android_customer';

export interface AppleAuthStartResponse {
  transaction_id: string;
  state: string;
  nonce: string;
  authorization_url: string;
}

export interface AppleAuthCompleteRequest {
  platform: AppleAuthPlatform;
  id_token: string;
  nonce?: string;
  transaction_id?: string;
  device_id: string;
  device_info?: { model: string; os: string; app_version: string };
}

export interface AppleAuthCompleteResponse {
  status: 'authenticated' | 'requires_phone' | 'requires_step_up_otp' | 'requires_link_confirmation' | 'blocked';
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  trusted_device?: boolean;
  user?: { id: string; email?: string; phone_number?: string; full_name: string };
  transaction_id?: string;
  masked_recipient?: string;
  preferred_channel?: string;
  fallback_channel?: string;
  expires_in_seconds?: number;
  email?: string;
  full_name?: string;
  otp_required?: boolean;
}

const APPLE_TRANSACTION_KEY = 'tembus_apple_tx';
const APPLE_NONCE_KEY = 'tembus_apple_nonce';
const APPLE_STATE_KEY = 'tembus_apple_state';

export function saveAppleSession(txId: string, state: string, nonce: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(APPLE_TRANSACTION_KEY, txId);
  sessionStorage.setItem(APPLE_STATE_KEY, state);
  sessionStorage.setItem(APPLE_NONCE_KEY, nonce);
}

export function restoreAppleSession() {
  if (typeof window === 'undefined') return null;
  const txId = sessionStorage.getItem(APPLE_TRANSACTION_KEY);
  const state = sessionStorage.getItem(APPLE_STATE_KEY);
  const nonce = sessionStorage.getItem(APPLE_NONCE_KEY);
  return txId && state && nonce ? { txId, state, nonce } : null;
}

export function clearAppleSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(APPLE_TRANSACTION_KEY);
  sessionStorage.removeItem(APPLE_STATE_KEY);
  sessionStorage.removeItem(APPLE_NONCE_KEY);
}

export async function startAppleAuth(deviceId: string, redirectUri?: string) {
  const response = await api.post<AppleAuthStartResponse>('/auth/customer/apple/start', {
    platform: 'web' as AppleAuthPlatform,
    device_id: deviceId,
    redirect_uri: redirectUri,
  });
  saveAppleSession(response.data.transaction_id, response.data.state, response.data.nonce);
  return response.data;
}

export async function completeAppleAuth(req: AppleAuthCompleteRequest) {
  const response = await api.post<AppleAuthCompleteResponse>('/auth/customer/apple/complete', req);
  return response.data;
}

export function validateAppleState(returnedState: string) {
  return restoreAppleSession()?.state === returnedState;
}
