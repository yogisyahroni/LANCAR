/**
 * SECURITY NOTICE (S3-CW-07):
 * This page has been removed from the customer portal.
 *
 * Feature Flags management controls core platform behavior (routing model,
 * pricing logic, system toggles). It must only be accessible through the
 * admin dashboard by verified admin/super_admin accounts.
 *
 * The previous client-side role check (user?.role !== 'super_admin') was
 * insufficient because Zustand store state can be manipulated via browser
 * DevTools, bypassing the check entirely.
 *
 * Access to /feature-flags is redirected to /dashboard via Next.js
 * middleware (src/middleware.ts) which runs server-side on the Edge.
 */

import { redirect } from 'next/navigation';

export default function FeatureFlagsRemovedPage() {
  // Belt-and-suspenders: middleware handles this first, but redirect here too
  redirect('/dashboard');
}
