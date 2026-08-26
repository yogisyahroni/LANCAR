'use client';

import { useEffect } from 'react';

// Provisions the CSRF double-submit cookie on first client load so that
// src/lib/api.ts can send X-CSRF-Token on later mutations. Idempotent and
// best-effort: a failure here must never block the app from rendering.
export default function CsrfBootstrap() {
  useEffect(() => {
    // Only mint if absent — avoids clobbering a still-valid token.
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith('csrf_token='));
    if (hasCookie) return;
    void fetch('/api/csrf', { method: 'GET', credentials: 'same-origin' }).catch(() => {});
  }, []);

  return null;
}
