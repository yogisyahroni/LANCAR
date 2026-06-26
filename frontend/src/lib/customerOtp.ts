/**
 * customerOtp.ts
 * Client-side helpers for the Customer OTP flow (Zenziva-backed).
 * Used for Google Auth step-up OTP and standalone OTP login.
 */

import { api } from './api';

// ── Types ─────────────────────────────────────────────────────

export type OTPChannel = 'whatsapp' | 'sms';

export interface SendCustomerOTPRequest {
  phone_number: string;
  channel?: OTPChannel;
  /** Transaction ID from Google auth flow (for step-up OTP) */
  transaction_id?: string;
  device_id: string;
}

export interface SendCustomerOTPResponse {
  status: string;
  challenge_id: string;
  masked_recipient: string;
  channel: OTPChannel;
  expires_in_seconds: number;
  resend_cooldown_seconds: number;
}

export interface VerifyCustomerOTPRequest {
  transaction_id?: string;
  challenge_id: string;
  code: string;
  phone_number: string;
  device_id: string;
  device_info?: {
    platform: string;
    app: string;
    remember_me: boolean;
    user_agent: string;
    timezone: string;
    language: string;
  };
}

export interface VerifyCustomerOTPResponse {
  status: 'authenticated' | 'step_up_complete' | 'phone_verified';
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: {
    id: string;
    email?: string;
    phone_number?: string;
    full_name: string;
  };
  /** Populated when step_up_complete — the original Google auth response */
  google_auth_result?: object;
}

// ── API calls ─────────────────────────────────────────────────

/**
 * sendCustomerOTP — sends an OTP to a phone number via Zenziva.
 * Optionally tied to a Google auth transaction for step-up verification.
 */
export async function sendCustomerOTP(
  req: SendCustomerOTPRequest
): Promise<SendCustomerOTPResponse> {
  const response = await api.post<SendCustomerOTPResponse>('/auth/customer/otp/send', req);
  return response.data;
}

/**
 * verifyCustomerOTP — verifies the OTP code.
 * On success, may return auth tokens directly or signal completion of a step-up flow.
 */
export async function verifyCustomerOTP(
  req: VerifyCustomerOTPRequest
): Promise<VerifyCustomerOTPResponse> {
  // Map 'code' to 'otp_code' which is what the backend expects
  const payload = {
    ...req,
    otp_code: req.code,
  };
  const response = await api.post<VerifyCustomerOTPResponse>('/auth/customer/otp/verify', payload);
  return response.data;
}
