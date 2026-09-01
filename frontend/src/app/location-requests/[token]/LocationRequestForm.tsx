'use client';

import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, LocateFixed, MapPin, Phone, UserRound } from 'lucide-react';
import { customerApiRootUrl } from '@/lib/runtimeConfig';

type LocationRequestPayload = {
  pickup_address: string;
  recipient_name?: string | null;
  status: string;
  expires_at: string;
};

type Props = {
  token: string;
  initialRequest: LocationRequestPayload;
};

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';
type LocationSource = 'device' | 'address' | null;

type ResolvedLocation = {
  lat: number;
  lng: number;
  label?: string;
};

type GeocodeResult = {
  label?: string;
  latitude?: number;
  longitude?: number;
};

const RECEIVER_LOCATION_STORAGE_KEY = 'tembus_receiver_location_submitted_v1';

export function LocationRequestForm({ token, initialRequest }: Props) {
  const [address, setAddress] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState<ResolvedLocation | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [contactName, setContactName] = useState(initialRequest.recipient_name || '');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');

  const canSubmit = useMemo(() => {
    return address.trim().length >= 8;
  }, [address]);

  const updateAddress = (value: string) => {
    setAddress(value);
    setResolvedLocation(null);
    setLocationSource(null);
    if (message) setMessage('');
  };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setSubmitState('error');
      setMessage('Perangkat ini belum mendukung deteksi lokasi otomatis.');
      return;
    }

    setIsLocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setResolvedLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: 'Titik dari lokasi perangkat',
        });
        setLocationSource('device');
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        setSubmitState('error');
        setMessage('Lokasi perangkat belum bisa dibaca. Pastikan izin lokasi aktif, atau isi alamat lebih lengkap.');
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      }
    );
  };

  const resolveAddressLocation = async (): Promise<ResolvedLocation> => {
    if (resolvedLocation) return resolvedLocation;

    const response = await fetch(
      `${customerApiRootUrl}/api/v1/maps/geocode?query=${encodeURIComponent(address.trim())}&scope=web_customer`,
      { method: 'GET' }
    );
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};

    if (!response.ok) {
      throw new Error(body?.error || 'Alamat belum bisa divalidasi. Coba tulis alamat lebih lengkap.');
    }

    const firstResult = (Array.isArray(body?.results) ? body.results : []).find((item: GeocodeResult) => {
      return Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
    });

    if (!firstResult) {
      throw new Error('Alamat belum cukup spesifik. Tambahkan nama jalan, nomor, kecamatan, dan kota.');
    }

    const nextLocation = {
      lat: Number(firstResult.latitude),
      lng: Number(firstResult.longitude),
      label: firstResult.label || address.trim(),
    };
    setResolvedLocation(nextLocation);
    setLocationSource('address');
    return nextLocation;
  };

  const submitLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitState === 'submitting') return;

    setSubmitState('submitting');
    setMessage('');

    try {
      const location = await resolveAddressLocation();
      const response = await fetch(`${customerApiRootUrl}/api/v1/public/location-requests/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          location: { lat: location.lat, lng: location.lng },
          contact_name: contactName,
          contact_phone: contactPhone,
          notes,
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
      if (!response.ok || body?.success === false) {
        throw new Error(body?.message || 'Lokasi belum bisa dikirim.');
      }
      try {
        window.localStorage.setItem(
          RECEIVER_LOCATION_STORAGE_KEY,
          JSON.stringify({
            token,
            submitted_at: new Date().toISOString(),
          })
        );
      } catch {
        // Cross-tab notification is best-effort. The pemesan page also polls the server.
      }
      setSubmitState('success');
      setMessage('Lokasi penerima berhasil dikirim ke pemesan.');
    } catch (error) {
      setSubmitState('error');
      setMessage(error instanceof Error ? error.message : 'Lokasi belum bisa dikirim.');
    }
  };

  if (submitState === 'success') {
    return (
      <div className="rounded-[2rem] border border-brand-emerald-100 bg-white p-7 shadow-lg">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-emerald-50 text-brand-emerald-600">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h2 className="mt-6 text-2xl font-black tracking-tight text-slate-950">Lokasi sudah diterima</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {message} Pemesan akan memakai detail ini untuk melanjutkan pengiriman.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submitLocation} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg sm:p-7">
      <div className="mb-6 rounded-3xl bg-slate-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-emerald-700">Pickup</p>
        <p className="mt-2 text-base font-black text-slate-950">{initialRequest.pickup_address}</p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
            <MapPin className="h-4 w-4 text-orange-500" />
            Alamat penerima
          </span>
          <textarea
            value={address}
            onChange={(event) => updateAddress(event.target.value)}
            className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-brand-emerald-500 focus:ring-4 focus:ring-brand-emerald-100"
            placeholder="Nama gedung, jalan, nomor, patokan, kecamatan, kota"
            required
          />
        </label>

        <div className="rounded-2xl border border-brand-emerald-100 bg-brand-emerald-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-slate-950">Titik lokasi otomatis</p>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Kami akan menentukan titik dari alamat. Gunakan lokasi perangkat jika penerima sedang berada di alamat tujuan.
              </p>
            </div>
            <button
              type="button"
              onClick={useDeviceLocation}
              disabled={isLocating || submitState === 'submitting'}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-brand-emerald-700 shadow-sm ring-1 ring-brand-emerald-100 transition hover:bg-brand-emerald-100 active:scale-[0.98] disabled:text-slate-400"
            >
              {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              Lokasi saya
            </button>
          </div>
          {resolvedLocation ? (
            <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-brand-emerald-800">
              Titik siap dipakai dari {locationSource === 'device' ? 'lokasi perangkat' : 'alamat yang diisi'}.
            </p>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
            <UserRound className="h-4 w-4 text-slate-500" />
            Nama penerima
          </span>
          <input
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-brand-emerald-500 focus:ring-4 focus:ring-brand-emerald-100"
            placeholder="Nama penerima"
          />
        </label>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
            <Phone className="h-4 w-4 text-slate-500" />
            Nomor handphone
          </span>
          <input
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            inputMode="tel"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-brand-emerald-500 focus:ring-4 focus:ring-brand-emerald-100"
            placeholder="08xxxxxxxxxx"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-800">Catatan lokasi</span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-brand-emerald-500 focus:ring-4 focus:ring-brand-emerald-100"
            placeholder="Contoh: titip ke resepsionis, lobby tower A"
          />
        </label>
      </div>

      {message ? (
        <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{message}</p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit || submitState === 'submitting'}
        className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-brand-emerald-600 text-base font-black text-white shadow-lg shadow-brand-emerald-600/20 transition active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
      >
        {submitState === 'submitting' ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Kirim lokasi'}
      </button>
    </form>
  );
}
