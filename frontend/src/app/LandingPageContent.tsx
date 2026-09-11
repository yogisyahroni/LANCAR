'use client';

import Link from 'next/link';
import { ArrowRight, BarChart3, Package, ShieldCheck, Zap, type LucideIcon } from 'lucide-react';
import ResiCheckWidget from '@/components/landing/ResiCheckWidget';
import LocaleSwitcher from '@/components/i18n/LocaleSwitcher';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatCurrency } from '@/i18n/format';
import type { MessageKey } from '@/i18n/messages';
import { getCustomerServiceIcon, type CustomerServiceIconKey } from '@/components/orders/serviceIcon';

const services: Array<{ id: CustomerServiceIconKey; icon: LucideIcon; name: MessageKey; description: MessageKey; accent: string; iconColor: string }> = [
  { id: 'parcel', icon: getCustomerServiceIcon('parcel'), name: 'landing.service.parcel.name', description: 'landing.service.parcel.description', accent: 'bg-success-surface border-success/20', iconColor: 'text-success' },
  { id: 'food', icon: getCustomerServiceIcon('food'), name: 'landing.service.food.name', description: 'landing.service.food.description', accent: 'bg-accent-surface border-accent', iconColor: 'text-accent' },
  { id: 'tire', icon: getCustomerServiceIcon('tire'), name: 'landing.service.tire.name', description: 'landing.service.tire.description', accent: 'bg-info-surface border-info', iconColor: 'text-info' },
  { id: 'towing', icon: getCustomerServiceIcon('towing'), name: 'landing.service.towing.name', description: 'landing.service.towing.description', accent: 'bg-warning-surface border-warning', iconColor: 'text-warning' },
];

const pricing = [
  { id: 'parcel', value: 12000, note: 'landing.pricingNote.parcel' as MessageKey },
  { id: 'food', value: 8000, note: 'landing.pricingNote.food' as MessageKey },
  { id: 'tire', value: 35000, note: 'landing.pricingNote.tire' as MessageKey },
  { id: 'towing', value: 150000, note: 'landing.pricingNote.towing' as MessageKey },
];

const serviceNameKeys: Record<string, MessageKey> = {
  parcel: 'landing.service.parcel.name',
  food: 'landing.service.food.name',
  tire: 'landing.service.tire.name',
  towing: 'landing.service.towing.name',
};

export default function LandingPageContent() {
  const { locale, t } = useI18n();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-surface-subtle backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" className="flex items-center gap-2"><img src="/tembusweb.svg" alt="TEMBUS" className="h-8 w-24 object-contain sm:w-auto" /></Link>
          <nav aria-label={t('landing.primaryNav')} className="hidden items-center gap-6 md:flex">
            <a href="#layanan" className="text-sm text-foreground-muted transition-colors hover:text-foreground">{t('landing.servicesNav')}</a>
            <a href="#harga" className="text-sm text-foreground-muted transition-colors hover:text-foreground">{t('landing.pricingNav')}</a>
            <a href="#umkm" className="text-sm text-foreground-muted transition-colors hover:text-foreground">{t('landing.umkmNav')}</a>
            <Link href="/cek-resi" className="text-sm text-foreground-muted transition-colors hover:text-foreground">{t('landing.trackNav')}</Link>
          </nav>
          <div className="flex items-center gap-2"><LocaleSwitcher className="!hidden sm:!inline-flex" /><Link href="/login" className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground-muted transition-all hover:bg-surface-subtle">{t('landing.signIn')}</Link><Link href="/daftar" className="rounded-xl bg-success px-4 py-2 text-sm font-black text-on-success transition-all hover:bg-success">{t('landing.register')}</Link></div>
        </div>
      </header>

      <section className="relative overflow-hidden"><div aria-hidden="true" className="pointer-events-none absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-success/15 blur-[120px]" /><div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-14 md:pt-24"><p className="text-xs font-bold uppercase tracking-wide text-success">{t('landing.eyebrow')}</p><h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">{t('landing.heroTitle')}</h1><p className="mt-5 max-w-xl text-base leading-7 text-foreground-muted md:text-lg">{t('landing.heroDescription')}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"><Link href="/orders/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-success px-7 py-4 text-base font-black text-on-success shadow-lg shadow-success/25 transition-all hover:bg-success active:scale-[0.98]">{t('landing.sendNow')}<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link><Link href="/login" className="inline-flex items-center justify-center rounded-xl border border-border bg-surface/[0.04] px-7 py-4 text-base font-bold text-foreground transition-all hover:bg-surface-subtle">{t('landing.signIn')}</Link></div><div className="mt-10 max-w-xl rounded-2xl border border-border bg-surface/[0.04] p-5 backdrop-blur-sm"><ResiCheckWidget /></div><ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-foreground-muted"><li className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-success" aria-hidden="true" />{t('landing.nearestCourier')}</li><li className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />{t('landing.optionalInsurance')}</li><li className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-success" aria-hidden="true" />{t('landing.publicTracking')}</li></ul></div></section>

      <section id="layanan" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-14"><h2 className="text-2xl font-black tracking-tight md:text-3xl">{t('landing.servicesTitle')}</h2><p className="mt-2 text-sm text-foreground-muted">{t('landing.servicesDescription')}</p><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{services.map((service) => <Link key={service.id} href="/orders/new" className={`group rounded-3xl border p-5 transition-all hover:-translate-y-1 ${service.accent}`}><div className="w-fit rounded-2xl bg-surface-subtle p-3"><service.icon className={`h-6 w-6 ${service.iconColor}`} aria-hidden="true" /></div><h3 className="mt-4 text-lg font-black text-foreground">{t(service.name)}</h3><p className="mt-1.5 text-xs leading-5 text-foreground-muted">{t(service.description)}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-foreground-muted transition-colors group-hover:text-foreground">{t('landing.orderNow')}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span></Link>)}</div></section>

      <section id="harga" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-14"><h2 className="text-2xl font-black tracking-tight md:text-3xl">{t('landing.pricingTitle')}</h2><p className="mt-2 text-sm text-foreground-muted">{t('landing.pricingDescription')}</p><div className="mt-8 overflow-hidden rounded-3xl border border-border"><table className="w-full text-left text-sm"><caption className="sr-only">{t('landing.pricingTableCaption')}</caption><thead className="bg-surface/[0.06] text-xs uppercase tracking-wide text-foreground-muted"><tr><th scope="col" className="px-5 py-3">{t('landing.pricingService')}</th><th scope="col" className="px-5 py-3">{t('landing.pricingRate')}</th><th className="hidden px-5 py-3 sm:table-cell" scope="col">{t('landing.pricingNote')}</th></tr></thead><tbody className="divide-y divide-border">{pricing.map((row) => <tr key={row.id} className="transition-colors hover:bg-surface/[0.03]"><th scope="row" className="px-5 py-4 font-bold">{t(serviceNameKeys[row.id])}</th><td className="px-5 py-4 font-semibold text-success">{t('landing.startingFrom', { price: formatCurrency(row.value, 'IDR', locale) })}</td><td className="hidden px-5 py-4 text-foreground-muted sm:table-cell">{t(row.note)}</td></tr>)}</tbody></table></div></section>

      <section id="umkm" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-14"><div className="rounded-3xl border border-success/20 bg-gradient-to-br from-primary/10 via-foreground/20/[0.02] to-transparent p-8 md:p-12"><p className="text-xs font-bold uppercase tracking-wide text-success">{t('landing.umkmEyebrow')}</p><h2 className="mt-3 max-w-2xl text-2xl font-black tracking-tight md:text-3xl">{t('landing.umkmTitle')}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-muted">{t('landing.umkmDescription')}</p><Link href="/laporan" className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-success px-6 py-3.5 text-sm font-black text-on-success transition-all hover:bg-success active:scale-[0.98]"><BarChart3 className="h-4 w-4" aria-hidden="true" />{t('landing.umkmCta')}</Link></div></section>

      <footer className="border-t border-border"><div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4"><div><img src="/tembusweb.svg" alt="TEMBUS" className="h-8 object-contain" /><p className="mt-3 max-w-xs text-xs leading-5 text-foreground-muted">{t('landing.footerDescription')}</p></div><nav aria-label={t('landing.productLinks')}><h3 className="text-xs font-bold uppercase tracking-wide text-foreground-muted">{t('landing.productLinks')}</h3><ul className="mt-3 space-y-2 text-sm text-foreground-muted"><li><a href="#layanan" className="hover:text-foreground">{t('landing.servicesNav')}</a></li><li><a href="#harga" className="hover:text-foreground">{t('landing.pricingNav')}</a></li><li><a href="#umkm" className="hover:text-foreground">{t('landing.umkmNav')}</a></li></ul></nav><nav aria-label={t('landing.helpLinks')}><h3 className="text-xs font-bold uppercase tracking-wide text-foreground-muted">{t('landing.helpLinks')}</h3><ul className="mt-3 space-y-2 text-sm text-foreground-muted"><li><Link href="/cek-resi" className="hover:text-foreground">{t('landing.trackNav')}</Link></li><li><Link href="/login" className="hover:text-foreground">{t('landing.signIn')}</Link></li><li><Link href="/daftar" className="hover:text-foreground">{t('landing.register')}</Link></li></ul></nav><div><h3 className="text-xs font-bold uppercase tracking-wide text-foreground-muted">{t('landing.legalLinks')}</h3><p className="mt-3 text-xs text-foreground-muted">{t('landing.footerRights')}</p></div></div></footer>
    </main>
  );
}
