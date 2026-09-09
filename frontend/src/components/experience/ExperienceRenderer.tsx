'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchCustomerExperience, type ExperienceManifest, type ExperienceProperties, type ExperienceSection } from '@/lib/experience/experienceClient';
import { sanitizeDeepLink } from '@/lib/deepLink';

const text = (properties: ExperienceProperties, key: string) => {
  const value = properties[key];
  return typeof value === 'string' ? value.trim() : '';
};

const internalTarget = (properties: ExperienceProperties) => sanitizeDeepLink(text(properties, 'deep_link'));

function ExperienceCard({ section, manifest }: { section: ExperienceSection; manifest: ExperienceManifest }) {
  const title = text(section.properties, 'title');
  const body = text(section.properties, 'body');
  const badge = text(section.properties, 'badge');
  const target = internalTarget(section.properties);
  const campaignId = text(section.properties, 'campaign_id') || section.id;
  if (!title && !body) return null;

  const content = (
    <div className="space-y-1">
      {badge && <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{badge}</span>}
      {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
    </div>
  );

  return (
    <article
      className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
      data-experience-manifest={manifest.manifest_id}
      data-experience-revision={manifest.revision}
      data-campaign-id={campaignId}
    >
      {target ? <Link href={target} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{content}</Link> : content}
    </article>
  );
}

function ExperienceSectionView({ section, manifest }: { section: ExperienceSection; manifest: ExperienceManifest }) {
  if (section.component === 'spacer' || section.component === 'design_tokens') return null;
  if (section.component === 'promo_carousel') {
    const items = Array.isArray(section.properties.items) ? section.properties.items : [];
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item, index) => {
          if (!item || typeof item !== 'object') return null;
          const properties = item as ExperienceProperties;
          return <ExperienceCard key={String(properties.id || index)} section={{ id: String(properties.id || index), component: 'campaign_strip', properties }} manifest={manifest} />;
        })}
      </div>
    );
  }
  if (section.component === 'quick_actions') {
    const actions = Array.isArray(section.properties.actions) ? section.properties.actions : [];
    return (
      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) => {
          if (!action || typeof action !== 'object') return null;
          const properties = action as ExperienceProperties;
          const target = sanitizeDeepLink(text(properties, 'deep_link'));
          const label = text(properties, 'label');
          if (!target || !label) return null;
          return <Link key={`${label}-${index}`} href={target} className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">{label}</Link>;
        })}
      </div>
    );
  }
  return <ExperienceCard section={section} manifest={manifest} />;
}

export default function ExperienceRenderer() {
  const [manifest, setManifest] = useState<ExperienceManifest | null>(null);

  useEffect(() => {
    let active = true;
    void fetchCustomerExperience().then((value) => {
      if (active) setManifest(value);
    });
    return () => { active = false; };
  }, []);

  if (!manifest) return null;
  const sections = manifest.sections.filter((section) => section.component !== 'campaign_intro' || section.properties.enabled !== false);
  if (sections.length === 0) return null;

  return (
    <section aria-label="Campaigns and information" className="space-y-3" data-experience-surface="customer_web">
      {sections.map((section) => <ExperienceSectionView key={section.id} section={section} manifest={manifest} />)}
    </section>
  );
}
