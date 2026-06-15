"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  Link2,
  Mail,
  PackageCheck,
  Phone,
  Users
} from "lucide-react";

const appUrl = "https://app.bawain.my.id";

export function Footer() {
  return (
    <>
      {/* ========== MINI COLLAB BAR (above footer) ========== */}
      <section className="border-t border-[var(--line)] bg-white py-5">
        <div className="container">
          <p className="mb-4 text-center text-xs font-bold text-[var(--muted)] uppercase tracking-wide">
            Siap berkolaborasi (mitra kurir), B2B dan B2C
          </p>
          <div className="grid grid-cols-3 gap-4 lg:gap-8">
            {[
              { icon: Users, label: "Mitra Kurir", sub: "Bersama tumbuh & berpenghasilan" },
              { icon: Building2, label: "B2B / Untuk Bisnis", sub: "Solusi logistik untuk bisnis Anda" },
              { icon: PackageCheck, label: "B2C / Untuk Pribadi", sub: "Kirim mudah untuk semua" }
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex flex-col items-center gap-1.5 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef6ed]">
                  <Icon className="h-4 w-4 text-[#003d2b]" />
                </div>
                <p className="text-[12px] font-black text-[#071712]">{label}</p>
                <p className="text-[10px] text-[var(--muted)]">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer id="bantuan" className="bg-[#00281e] py-10 text-white">
        <div className="container grid gap-8 lg:grid-cols-[1.5fr_repeat(4,1fr)_1.2fr]">
          {/* Brand column */}
          <div>
            <Image src="/brand/tembusweb.svg" alt="TEMBUS" width={260} height={80} className="h-10 w-auto" />
            <p className="mt-4 max-w-[220px] text-[12px] leading-6 text-white/65">
              Solusi logistik modern dengan teknologi terdepan dan jaringan mitra profesional untuk pengiriman terbaik.
            </p>
            {/* Social icons */}
            <div className="mt-5 flex items-center gap-3">
              {[
                { label: "Instagram", path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" },
                { label: "Facebook", path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
                { label: "X / Twitter", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.736-8.851L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
                { label: "TikTok", path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" }
              ].map(({ label, path }) => (
                <a
                  key={label}
                  href={appUrl}
                  aria-label={label}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/8 text-white/70 transition-all duration-200 hover:bg-white/15 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d={path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          {[
            {
              title: "Layanan",
              links: [
                { name: "Same Day", href: "/layanan/same-day" },
                { name: "Instant", href: "/layanan/instant" },
                { name: "Reguler", href: "/layanan/reguler" },
                { name: "Cargo", href: "/layanan/cargo" },
                { name: "COD", href: "/layanan/cod" },
                { name: "Business", href: "/layanan/business" }
              ]
            },
            {
              title: "Untuk Bisnis",
              links: [
                { name: "Solusi Logistik", href: "/bisnis/solusi-logistik" },
                { name: "Integrasi API", href: "/bisnis/integrasi-api" },
                { name: "Minta Akses API", href: "/developer/keys" },
                { name: "Enterprise", href: "/bisnis/enterprise" },
                { name: "Case Study", href: "/bisnis/case-study" }
              ]
            },
            {
              title: "Mitra Kurir",
              links: [
                { name: "Daftar Mitra", href: appUrl },
                { name: "Keuntungan", href: appUrl },
                { name: "Cara Bergabung", href: appUrl },
                { name: "FAQ Mitra", href: appUrl }
              ]
            },
            {
              title: "Perusahaan",
              links: [
                { name: "Tentang Kami", href: appUrl },
                { name: "Karir", href: appUrl },
                { name: "Berita", href: appUrl },
                { name: "Kontak", href: appUrl }
              ]
            }
          ].map((col) => (
            <div key={col.title}>
              <h3 className="text-[13px] font-black">{col.title}</h3>
              <ul className="mt-4 space-y-2 text-[12px] text-white/65">
                {col.links.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="transition-all duration-200 hover:text-white">{link.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Hubungi Kami */}
          <div>
            <h3 className="text-[13px] font-black">Hubungi Kami</h3>
            <ul className="mt-4 space-y-3 text-[12px] text-white/65">
              <li>
                <a href="tel:+6281234567890" className="flex items-center gap-2 transition-all duration-200 hover:text-white">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  +62 012-3456-7890
                </a>
              </li>
              <li>
                <a href="mailto:hello@tembus.id" className="flex items-center gap-2 transition-all duration-200 hover:text-white">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  hello@tembus.id
                </a>
              </li>
              <li>
                <a href="https://www.tembus.id" className="flex items-center gap-2 transition-all duration-200 hover:text-white">
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  www.tembus.id
                </a>
              </li>
            </ul>
            <div className="mt-5">
              <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-wide mb-2">Bantuan</h4>
              <ul className="space-y-2 text-[12px] text-white/65">
                {["Pusat Bantuan", "Syarat & Ketentuan", "Kebijakan Privasi"].map(link => (
                  <li key={link}>
                    <Link href={appUrl} className="transition-all duration-200 hover:text-white">{link}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="container mt-8 border-t border-white/10 pt-6 text-center text-[11px] text-white/45">
          © 2024 Tembus. All rights reserved.
        </div>
      </footer>
    </>
  );
}
