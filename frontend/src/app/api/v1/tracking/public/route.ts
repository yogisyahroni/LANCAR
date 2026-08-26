import { NextRequest, NextResponse } from 'next/server';
import { customerApiRootUrl } from '@/lib/runtimeConfig';

// Public resi tracking proxy.
// The order-service exposes GetPublicTracking, but the route is not yet wired
// in its main.go — so we proxy defensively and degrade to a clean 404-style
// "not found" when the backend is unreachable or returns non-2xx.
// ponytail: when order-service registers /api/v1/tracking/public, this proxy
// becomes a transparent pass-through; drop the stub only if you also want CORS.

const RESI_PATTERN = /^[A-Za-z0-9-]{1,40}$/;

// In-memory per-IP rate limit: 20 lookups / 60s. Edge-light, no DB.
// ponytail: swap for Redis/Upstash when behind multiple frontend replicas.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { found: false, message: 'Terlalu banyak permintaan. Coba lagi dalam satu menit.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const resi = (req.nextUrl.searchParams.get('resi') || '').trim();
  if (!resi || !RESI_PATTERN.test(resi)) {
    return NextResponse.json(
      { found: false, message: 'Format resi tidak valid.' },
      { status: 400 }
    );
  }

  const target = `${customerApiRootUrl}/api/v1/tracking/public?resi=${encodeURIComponent(resi)}`;
  try {
    const upstream = await fetch(target, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { found: false, message: 'Resi tidak ditemukan.' },
        { status: 404 }
      );
    }
    // order-service returns { success: true, data: {...} }; normalize to the
    // frontend's expected { found, data, message } envelope.
    const raw = await upstream.json().catch(() => null) as
      | { success?: boolean; data?: Record<string, unknown> }
      | null;
    const payload = raw?.data ?? raw;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { found: false, message: 'Data resi tidak lengkap.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ found: true, data: payload }, { status: 200 });
  } catch {
    // Backend unreachable (route not deployed / service down).
    return NextResponse.json(
      { found: false, message: 'Layanan pelacakan sedang tidak tersedia.' },
      { status: 404 }
    );
  }
}
