/**
 * customerDevice.ts
 * Single source of truth for the customer-web device identifier + device info.
 * Previously duplicated across login / otp-verify / daftar / google-callback.
 */

import { api } from './api';

export const CUSTOMER_WEB_DEVICE_ID_KEY = 'tembus_customer_web_device_id';

function createBrowserUUID(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

/** Returns a stable per-browser device id, persisted in localStorage. */
export function getCustomerWebDeviceId(): string {
  if (typeof window === 'undefined') return 'customer-web-server';

  const existing = window.localStorage.getItem(CUSTOMER_WEB_DEVICE_ID_KEY);
  if (existing) return existing;

  const deviceId = `customer-web-${createBrowserUUID()}`;
  window.localStorage.setItem(CUSTOMER_WEB_DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export interface CustomerWebDeviceInfo {
  platform: string;
  app: string;
  remember_me: boolean;
  user_agent: string;
  timezone: string;
  language: string;
}

export function buildCustomerWebDeviceInfo(rememberMe = false): CustomerWebDeviceInfo {
  return {
    platform: 'web',
    app: 'customer-portal',
    remember_me: rememberMe,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
  };
}

export { api };
