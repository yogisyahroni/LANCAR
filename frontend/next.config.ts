import type { NextConfig } from "next";
import withBundleAnalyzer from '@next/bundle-analyzer';

const nextConfig: any = {
  output: 'standalone',
  turbopack: {},

  // ─── SECURITY HEADERS ──────────────────────────────────────────────
  // These are static headers added by Next.js at the edge/CDN layer.
  // They complement (not replace) the middleware security headers.
  // CSP connect-src MUST include the API origin — the backend is a
  // separate subdomain (api.bawain.my.id) so 'self' alone blocks it.
  async headers() {
    // Build-time: NEXT_PUBLIC_API_URL is available at build time.
    // Extract the origin (e.g. https://api.bawain.my.id) for connect-src.
    const apiOrigin = (() => {
      try {
        const raw = process.env.NEXT_PUBLIC_API_URL || 'https://api.bawain.my.id';
        return new URL(raw).origin;
      } catch {
        return 'https://api.bawain.my.id';
      }
    })();

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data: https:",
              `connect-src 'self' ${apiOrigin} https://www.google-analytics.com https://analytics.google.com wss:`,
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withAnalyzer(nextConfig);
