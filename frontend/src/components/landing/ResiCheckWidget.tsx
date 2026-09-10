'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PackageSearch } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

const RESI_PATTERN = /^[A-Za-z0-9-]{1,40}$/;

export default function ResiCheckWidget() {
  const { t } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const resi = value.trim();
    if (!resi) {
      setError(t('landing.trackRequired'));
      return;
    }
    if (!RESI_PATTERN.test(resi)) {
      setError(t('landing.trackInvalid'));
      return;
    }
    setError(null);
    router.push(`/cek-resi?resi=${encodeURIComponent(resi)}`);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full" noValidate>
      <label
        htmlFor="landing-resi-input"
        className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted"
      >
        {t('landing.trackLabel')}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="landing-resi-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={40}
          aria-describedby="landing-resi-error"
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t('landing.trackPlaceholder')}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface/[0.06] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-foreground outline-none transition-all placeholder:normal-case placeholder:text-foreground-muted focus:border-success/60 focus:ring-2 focus:ring-focus-ring"
        />
        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-black text-on-success transition-all hover:bg-success active:scale-[0.98]"
        >
          <PackageSearch className="h-4 w-4"  aria-hidden="true"/>
          {t('landing.trackSubmit')}
        </button>
      </div>
      <p id="landing-resi-error" role={error ? 'alert' : undefined} className="mt-2 min-h-[1rem] text-xs font-medium text-warning">
        {error}
      </p>
    </form>
  );
}
