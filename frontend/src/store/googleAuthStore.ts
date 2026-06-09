/**
 * googleAuthStore.ts
 * Zustand store for managing the Google OAuth flow state machine.
 * Handles all intermediate states between clicking "Sign in with Google"
 * and landing on the dashboard.
 */

import { create } from 'zustand';
import type { GoogleAuthCompleteResponse } from '@/lib/googleAuth';

// ── Step enum ─────────────────────────────────────────────────

export type GoogleAuthStep =
  | 'idle'
  | 'starting'       // calling backend /google/start
  | 'redirecting'    // about to redirect user to Google
  | 'completing'     // processing callback from Google
  | 'requires_otp'   // step-up OTP required after Google login
  | 'requires_phone' // new Google user needs to supply phone number
  | 'done'           // authentication complete
  | 'error';

// ── State shape ───────────────────────────────────────────────

export interface GoogleAuthState {
  step: GoogleAuthStep;
  error: string | null;

  // Active transaction (from /google/start)
  transactionId: string | null;
  nonce: string | null;

  // Pending data between steps
  pendingResponse: GoogleAuthCompleteResponse | null;

  // OTP sub-flow
  otpChallengeId: string | null;
  maskedRecipient: string | null;
  preferredChannel: string | null;

  // Phone-collection sub-flow (new Google users)
  pendingEmail: string | null;
  pendingFullName: string | null;

  // Actions
  setStarting: () => void;
  setRedirecting: (txId: string, nonce: string) => void;
  setCompleting: () => void;
  setRequiresOtp: (challengeId: string, masked: string, channel: string, txId: string) => void;
  setRequiresPhone: (email: string, fullName: string, txId: string) => void;
  setDone: () => void;
  setError: (message: string) => void;
  reset: () => void;
}

// ── Store ─────────────────────────────────────────────────────

export const useGoogleAuthStore = create<GoogleAuthState>((set) => ({
  step: 'idle',
  error: null,
  transactionId: null,
  nonce: null,
  pendingResponse: null,
  otpChallengeId: null,
  maskedRecipient: null,
  preferredChannel: null,
  pendingEmail: null,
  pendingFullName: null,

  setStarting: () =>
    set({ step: 'starting', error: null }),

  setRedirecting: (txId, nonce) =>
    set({ step: 'redirecting', transactionId: txId, nonce, error: null }),

  setCompleting: () =>
    set({ step: 'completing', error: null }),

  setRequiresOtp: (challengeId, masked, channel, txId) =>
    set({
      step: 'requires_otp',
      otpChallengeId: challengeId,
      maskedRecipient: masked,
      preferredChannel: channel,
      transactionId: txId,
      error: null,
    }),

  setRequiresPhone: (email, fullName, txId) =>
    set({
      step: 'requires_phone',
      pendingEmail: email,
      pendingFullName: fullName,
      transactionId: txId,
      error: null,
    }),

  setDone: () =>
    set({ step: 'done', error: null }),

  setError: (message) =>
    set({ step: 'error', error: message }),

  reset: () =>
    set({
      step: 'idle',
      error: null,
      transactionId: null,
      nonce: null,
      pendingResponse: null,
      otpChallengeId: null,
      maskedRecipient: null,
      preferredChannel: null,
      pendingEmail: null,
      pendingFullName: null,
    }),
}));
