"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Clock3, LucideIcon, MapPin, ShieldCheck, Smartphone } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const appUrl = "https://app.bawain.my.id";

export type RoadsideService = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  steps: string[];
};

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay }
  };
}

export function RoadsideServicePage({ service }: { service: RoadsideService }) {
  const ServiceIcon = service.icon;

  return (
    <main className="page-shell bg-[#f8fafc]">
      <section className="relative overflow-hidden bg-[#001911] text-white">
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/header landing page.svg"
            alt=""
            fill
            priority
            className="object-cover opacity-60"
            style={{ objectPosition: "center top" }}
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#001911]/25 via-[#001911]/85 to-[#001911]" />
        </div>

        <Header />

        <div className="container relative z-10 grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
          <motion.div {...fadeUp()} className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm font-semibold text-[#9bd46f] backdrop-blur-sm">
              <ServiceIcon className="h-4 w-4" />
              <span>{service.eyebrow}</span>
            </div>
            <h1 className="mb-6 text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              {service.title}
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-white/80 lg:text-lg">
              {service.description}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={appUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00ff88] px-6 py-3.5 text-sm font-black text-[#071712] shadow-lg shadow-[#00ff88]/20 transition-all hover:-translate-y-0.5 hover:bg-[#00e67a] active:scale-95"
              >
                <Smartphone className="h-4 w-4" />
                Download / Buka Aplikasi
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/#layanan"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                Lihat Layanan Lain
              </Link>
            </div>
            <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-white/60">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
              Fitur ini hanya dapat digunakan melalui aplikasi mobile TEMBUS.
            </p>
          </motion.div>

          <motion.div
            {...fadeUp(0.12)}
            className="relative mx-auto flex aspect-square w-full max-w-[480px] items-center justify-center overflow-hidden rounded-[2rem] border border-white/15 bg-[#eaf4ee]/95 p-8 shadow-2xl shadow-black/20 sm:p-12"
          >
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#9bd46f]/30 blur-3xl" />
            <div className="absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-[#00a86b]/20 blur-3xl" />
            <Image
              src={service.image}
              alt={service.imageAlt}
              width={560}
              height={560}
              className="relative z-10 h-full w-full object-contain drop-shadow-[0_20px_18px_rgba(0,55,39,0.2)]"
            />
          </motion.div>
        </div>
      </section>

      <section className="container py-20 lg:py-28">
        <motion.div {...fadeUp()} className="mx-auto mb-12 max-w-2xl text-center">
          <span className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#087443]">
            <Smartphone className="h-4 w-4" />
            Pesan dari aplikasi
          </span>
          <h2 className="mb-4 text-3xl font-black text-[#071712] sm:text-4xl">Cara menggunakan layanan ini</h2>
          <p className="leading-relaxed text-[#64748b]">
            Semua permintaan bantuan dilakukan dari aplikasi TEMBUS agar lokasi dan kebutuhanmu dapat diteruskan ke mitra dengan lebih jelas.
          </p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {service.steps.map((step, index) => (
            <motion.div
              key={step}
              {...fadeUp(0.08 * index)}
              className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f3ef] text-lg font-black text-[#087443]">
                {index + 1}
              </div>
              <h3 className="font-bold text-[#071712]">{step}</h3>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="bg-[#eef6ed] py-20 lg:py-24">
        <div className="container">
          <motion.div {...fadeUp()} className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-black text-[#071712] sm:text-4xl">Lebih mudah lewat TEMBUS</h2>
            <p className="leading-relaxed text-[#475569]">
              Aplikasi membantu kamu mengajukan bantuan dan mendapatkan informasi layanan dari satu tempat.
            </p>
          </motion.div>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: MapPin, title: "Lokasi lebih jelas", text: "Masukkan titik kendaraan agar mitra dapat menemukan lokasi bantuan dengan lebih mudah." },
              { icon: ShieldCheck, title: "Terhubung dengan mitra", text: "Permintaan bantuan diteruskan melalui jaringan mitra TEMBUS yang tersedia." },
              { icon: Clock3, title: "Proses lebih terarah", text: "Ikuti perkembangan permintaan bantuan langsung dari aplikasi mobile." }
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                {...fadeUp(0.08 * index)}
                className="rounded-2xl border border-[#d8e8dd] bg-white p-7 shadow-sm"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f3ef] text-[#087443]">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-[#071712]">{feature.title}</h3>
                <p className="leading-relaxed text-[#64748b]">{feature.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-20 text-center lg:py-28">
        <motion.div {...fadeUp()} className="mx-auto max-w-2xl">
          <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-[#087443]" />
          <h2 className="mb-5 text-3xl font-black text-[#071712] sm:text-4xl">Butuh bantuan di perjalanan?</h2>
          <p className="mb-9 text-lg leading-relaxed text-[#64748b]">
            Buka aplikasi TEMBUS untuk mengajukan layanan dan melihat ketersediaan mitra di area kamu.
          </p>
          <a
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#003d2b] px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-[#003d2b]/20 transition-all hover:-translate-y-0.5 hover:bg-[#00281e] active:scale-95"
          >
            <Smartphone className="h-4 w-4" />
            Download / Buka Aplikasi TEMBUS
            <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
