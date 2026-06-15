"use client";

import Image from "next/image";
import { Menu } from "lucide-react";
import Link from "next/link";

const appUrl = "https://app.bawain.my.id";
const trackingUrl = `${appUrl}/track`;

export const navItems = [
  { label: "Beranda", href: "/" },
  { label: "Layanan", href: "/#layanan" },
  { label: "Untuk Bisnis", href: "/#kolaborasi" },
  { label: "Mitra Kurir", href: "/#kolaborasi" },
  { label: "Tentang Kami", href: "/#tentang" },
  { label: "Bantuan", href: "/#bantuan" }
];

export function Header({ isTransparent = true }: { isTransparent?: boolean }) {
  return (
    <header className={`relative z-20 flex items-center px-6 py-4 sm:px-10 lg:px-16 xl:px-20 2xl:px-24 ${isTransparent ? 'bg-transparent text-white' : 'bg-[#001911] text-white'}`}>
      <Link href="/" aria-label="TEMBUS beranda" className="flex shrink-0 items-center">
        <Image
          src="/brand/tembusweb.svg"
          alt="TEMBUS"
          width={260}
          height={80}
          priority
          className="h-9 w-auto lg:h-11"
        />
      </Link>

      <nav aria-label="Navigasi utama" className="hidden items-center gap-5 text-[14px] font-semibold lg:flex xl:gap-7 lg:ml-12 xl:ml-16">
        {navItems.map((item, i) => (
          <Link
            key={item.label}
            href={item.href}
            className={`relative pb-1 transition-all duration-200 hover:text-[#9bd46f]${
              i === 0
                ? ' text-white after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-[#ff6908]'
                : ' text-white/85'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto hidden items-center gap-3 md:flex">
        <a
          href={trackingUrl}
          className="rounded-lg border border-white/30 px-5 py-2 text-[13px] font-bold text-white transition-all duration-200 hover:bg-white/10"
        >
          Lacak Paket
        </a>
        <a
          href={`${appUrl}/orders/new`}
          className="rounded-lg bg-[#ff6908] px-5 py-2 text-[13px] font-bold text-white transition-all duration-200 hover:brightness-110 active:scale-95"
        >
          Kirim Sekarang
        </a>
      </div>

      <button
        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/10 transition-all duration-200 active:scale-95 lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="h-4 w-4" />
      </button>
    </header>
  );
}
