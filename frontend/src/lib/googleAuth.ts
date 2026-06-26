/**
 * googleAuth.ts
 * Client-side helpers for the Google Auth flow (Customer Web).
 * Never stores sensitive data (ID tokens, access tokens) in localStorage.
 */

import { api } from './api';

// ── Types ────────────────────────────────────────────────────

export type GoogleAuthPlatform = 'web' | 'android_customer';

export interface GoogleAuthStartRequest {
  platform: GoogleAuthPlatform;
  device_id: string;
  redirect_uri?: string;
}

export interface GoogleAuthStartResponse {
  transaction_id: string;
  state: string;
  nonce: string;
  authorization_url: string;
}

export interface GoogleAuthCompleteRequest {
  platform: GoogleAuthPlatform;
  id_token: string;
  nonce?: string;
  transaction_id?: string;
  device_id: string;
  device_info?: {
    model: string;
    os: string;
    app_version: string;
  };
}

export type GoogleAuthStatus =
  | 'authenticated'
  | 'requires_phone'
  | 'requires_step_up_otp'
  | 'requires_link_confirmation'
  | 'blocked';

export interface GoogleAuthCompleteResponse {
  status: GoogleAuthStatus;
  // Populated when status == 'authenticated'
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  trusted_device?: boolean;
  user?: {
    id: string;
    email?: string;
    phone_number?: string;
    full_name: string;
  };
  // Populated when status == 'requires_step_up_otp' or 'requires_phone'
  transaction_id?: string;
  masked_recipient?: string;
  preferred_channel?: string;
  fallback_channel?: string;
  expires_in_seconds?: number;
  // Populated when status == 'requires_phone'
  email?: string;
  full_name?: string;
  otp_required?: boolean;
}

// ── Session key constants ─────────────────────────────────────

const GOOGLE_TRANSACTION_KEY = 'tembus_google_tx';
const GOOGLE_NONCE_KEY = 'tembus_google_nonce';
const GOOGLE_STATE_KEY = 'tembus_google_state';
const GOOGLE_CHALLENGE_KEY = 'tembus_google_challenge';

// ── sessionStorage helpers (cleared when tab closes) ──────────

function saveGoogleSession(txId: string, state: string, nonce: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(GOOGLE_TRANSACTION_KEY, txId);
  sessionStorage.setItem(GOOGLE_STATE_KEY, state);
  sessionStorage.setItem(GOOGLE_NONCE_KEY, nonce);
}

export function restoreGoogleSession(): { txId: string; state: string; nonce: string } | null {
  if (typeof window === 'undefined') return null;
  const txId = sessionStorage.getItem(GOOGLE_TRANSACTION_KEY);
  const state = sessionStorage.getItem(GOOGLE_STATE_KEY);
  const nonce = sessionStorage.getItem(GOOGLE_NONCE_KEY);
  if (!txId || !state || !nonce) return null;
  return { txId, state, nonce };
}

export function clearGoogleSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(GOOGLE_TRANSACTION_KEY);
  sessionStorage.removeItem(GOOGLE_STATE_KEY);
  sessionStorage.removeItem(GOOGLE_NONCE_KEY);
}

export function saveChallengeId(challengeId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(GOOGLE_CHALLENGE_KEY, challengeId);
}

export function restoreChallengeId(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(GOOGLE_CHALLENGE_KEY);
}

export function clearChallengeId() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(GOOGLE_CHALLENGE_KEY);
}

// ── API calls ─────────────────────────────────────────────────

/**
 * startGoogleAuth — calls the backend to create a transaction and
 * returns the Authorization URL + state/nonce for CSRF/replay protection.
 * Saves state and nonce to sessionStorage before redirecting.
 */
export async function startGoogleAuth(
  deviceId: string,
  redirectUri?: string
): Promise<GoogleAuthStartResponse> {
  const response = await api.post<GoogleAuthStartResponse>('/auth/customer/google/start', {
    platform: 'web' as GoogleAuthPlatform,
    device_id: deviceId,
    redirect_uri: redirectUri,
  } satisfies GoogleAuthStartRequest);

  const data = response.data;
  // Persist state + nonce before redirecting so we can validate on return
  saveGoogleSession(data.transaction_id, data.state, data.nonce);
  return data;
}

/**
 * completeGoogleAuth — submits the ID token (from Google One Tap or redirect flow)
 * to the backend and returns the polymorphic response.
 */
export async function completeGoogleAuth(
  req: GoogleAuthCompleteRequest
): Promise<GoogleAuthCompleteResponse> {
  const response = await api.post<GoogleAuthCompleteResponse>(
    '/auth/customer/google/complete',
    req
  );
  return response.data;
}

/**
 * validateStateParam — compares the `state` from the OAuth callback URL
 * to the one we stored in sessionStorage. Prevents CSRF attacks.
 * Returns true if valid.
 */
export function validateStateParam(returnedState: string): boolean {
  const session = restoreGoogleSession();
  if (!session) return false;
  return session.state === returnedState;
}
