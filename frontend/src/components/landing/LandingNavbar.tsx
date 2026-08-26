'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { href: '#layanan', label: 'Layanan' },
  { href: '#harga', label: 'Harga' },
  { href: '#umkm', label: 'UMKM' },
  { href: '/cek-resi', label: 'Cek Resi' },
  { href: '/voucher', label: 'Voucher' },
];

export default function LandingNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <img src="/tembusweb.svg" alt="TEMBUS" className="h-8 object-contain" />
        </Link>

        <nav aria-label="Navigasi utama" className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-slate-300 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 transition-all hover:bg-white/5"
          >
            Masuk
          </Link>
          <Link
            href="/daftar"
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 transition-all hover:bg-emerald-400"
          >
            Daftar
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 p-2 text-slate-200 transition-all hover:bg-white/5 md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Navigasi mobile"
          className="border-t border-white/5 bg-slate-950 px-5 py-4 md:hidden"
        >
          <ul className="space-y-1">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-200 transition-all hover:bg-white/5"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex gap-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-center text-sm font-bold text-slate-200 transition-all hover:bg-white/5"
              >
                Masuk
              </Link>
              <Link
                href="/daftar"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-center text-sm font-black text-slate-950 transition-all hover:bg-emerald-400"
              >
                Daftar
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
