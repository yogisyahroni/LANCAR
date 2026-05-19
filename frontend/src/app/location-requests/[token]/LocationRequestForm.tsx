'use client';

import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, Navigation, Phone, UserRound } from 'lucide-react';

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

const apiRoot = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
  return configured.replace(/\/api\/v1\/?$/, '');
};

export function LocationRequestForm({ token, initialRequest }: Props) {
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [contactName, setContactName] = useState(initialRequest.recipient_name || '');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');

  const canSubmit = useMemo(() => {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    return (
      address.trim().length >= 6 &&
      Number.isFinite(parsedLat) &&
      Number.isFinite(parsedLng) &&
      parsedLat >= -90 &&
      parsedLat <= 90 &&
      parsedLng >= -180 &&
      parsedLng <= 180
    );
  }, [address, lat, lng]);

  const submitLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitState === 'submitting') return;

    setSubmitState('submitting');
    setMessage('');

    try {
      const response = await fetch(`${apiRoot()}/api/v1/public/location-requests/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          location: { lat: Number(lat), lng: Number(lng) },
          contact_name: contactName,
          contact_phone: contactPhone,
          notes,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        throw new Error(body?.message || 'Lokasi belum bisa dikirim.');
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
      <div className="rounded-[2rem] border border-emerald-100 bg-white p-7 shadow-lg">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
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
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">Pickup</p>
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
            onChange={(event) => setAddress(event.target.value)}
            className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="Nama gedung, jalan, nomor, patokan, kota"
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
              <Navigation className="h-4 w-4 text-emerald-600" />
              Latitude
            </span>
            <input
              value={lat}
              onChange={(event) => setLat(event.target.value)}
              inputMode="decimal"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              placeholder="-6.2000"
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-800">Longitude</span>
            <input
              value={lng}
              onChange={(event) => setLng(event.target.value)}
              inputMode="decimal"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              placeholder="106.8166"
              required
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
            <UserRound className="h-4 w-4 text-slate-500" />
            Nama penerima
          </span>
          <input
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            placeholder="08xxxxxxxxxx"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-800">Catatan lokasi</span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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
        className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-emerald-600 text-base font-black text-white shadow-lg shadow-emerald-600/20 transition active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
      >
        {submitState === 'submitting' ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Kirim lokasi'}
      </button>
    </form>
  );
}
