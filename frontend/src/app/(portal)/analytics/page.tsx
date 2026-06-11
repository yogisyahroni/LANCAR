/**
 * SECURITY NOTICE (S3-CW-06):
 * This page has been removed from the customer portal.
 *
 * Analytics data (revenue, CAC, LTV, unit economics) contains sensitive
 * business-confidential information and must only be accessible through
 * the admin dashboard, never the customer portal.
 *
 * Access to /analytics from the customer portal is redirected to /dashboard
 * via Next.js middleware (src/middleware.ts).
 *
 * If you are looking to add customer-facing analytics (e.g. their own order
 * statistics), please create a new page at /laporan instead.
 */

import { redirect } from 'next/navigation';

export default function AnalyticsRemovedPage() {
  // Belt-and-suspenders: middleware handles this first, but redirect here too
  redirect('/dashboard');
}
