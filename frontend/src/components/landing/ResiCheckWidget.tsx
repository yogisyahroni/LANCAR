'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PackageSearch } from 'lucide-react';

const RESI_PATTERN = /^[A-Za-z0-9-]{1,40}$/;

export default function ResiCheckWidget() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const resi = value.trim();
    if (!resi) {
      setError('Masukkan nomor resi terlebih dahulu.');
      return;
    }
    if (!RESI_PATTERN.test(resi)) {
      setError('Resi hanya boleh berisi huruf, angka, dan tanda hubung (maks. 40 karakter).');
      return;
    }
    setError(null);
    router.push(`/cek-resi?resi=${encodeURIComponent(resi)}`);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full" noValidate>
      <label
        htmlFor="landing-resi-input"
        className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400"
      >
        Lacak kiriman kamu
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
          placeholder="Contoh: TB-12345678"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white outline-none transition-all placeholder:normal-case placeholder:text-slate-500 focus:border-brand-emerald-400/60 focus:ring-2 focus:ring-brand-emerald-500/20"
        />
        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition-all hover:bg-brand-emerald-400 active:scale-[0.98]"
        >
          <PackageSearch className="h-4 w-4" />
          Cek Resi
        </button>
      </div>
      <p id="landing-resi-error" role={error ? 'alert' : undefined} className="mt-2 min-h-[1rem] text-xs font-medium text-amber-300">
        {error}
      </p>
    </form>
  );
}
