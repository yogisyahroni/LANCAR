/**
 * customerSession.ts
 * Customer-web session exchange helper. Consolidates the repeated
 * `api.post('/auth/web/session/exchange', ...)` call used across
 * login / otp-verify / daftar / google-callback.
 */

import { api } from './api';

export interface SessionExchangeRequest {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  device_id?: string;
  device_info?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SessionExchangeResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: {
    id: string;
    email?: string;
    phone_number?: string;
    full_name: string;
  };
  [key: string]: unknown;
}

export async function exchangeSession(
  payload: SessionExchangeRequest
): Promise<SessionExchangeResponse> {
  const response = await api.post<SessionExchangeResponse>('/auth/web/session/exchange', payload);
  return response.data;
}
