import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

// Issues a CSRF double-submit token: sets a readable `csrf_token` cookie that
// the browser also sends back as the `X-CSRF-Token` header on mutations
// (see src/lib/api.ts). The backend must validate header === cookie; until it
// does, this endpoint provisions the token the client pattern expects.
// ponytail: when order-service/identity adds server-side CSRF validation,
// keep this issuer and have the backend verify X-CSRF-Token against the cookie.

const CSRF_COOKIE_NAME = 'csrf_token';
const ONE_HOUR = 60 * 60;

export function GET(_req: NextRequest) {
  const token = randomBytes(32).toString('hex');
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // readable by JS for the double-submit header
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_HOUR,
  });
  return res;
}
