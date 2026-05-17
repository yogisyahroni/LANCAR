'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Clock, MapPin, Navigation, Package, ShieldCheck, Truck } from 'lucide-react';

type TrackingPayload = {
  order_id: string;
  status: string;
  pickup_address?: string;
  drop_address?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  drop_latitude?: number;
  drop_longitude?: number;
  courier_name?: string;
  courier_latitude?: number;
  courier_longitude?: number;
  last_location_at?: string;
  expires_at?: string;
};

const apiOrigin = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
  return configured.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
};

const statusLabel: Record<string, string> = {
  assigned: 'Kurir ditugaskan',
  picked_up: 'Barang sudah diambil',
  in_transit: 'Dalam pengantaran',
  dispatching: 'Mencari kurir',
  offered: 'Menunggu kurir',
};

const formatTime = (value?: string) => {
  if (!value) return 'Belum tersedia';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export default function PublicTrackingPage() {
  const params = useParams();
  const token = String(params?.token || '');
  const [data, setData] = useState<TrackingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mapUrl = useMemo(() => {
    const lat = data?.courier_latitude || data?.pickup_latitude || data?.drop_latitude;
    const lng = data?.courier_longitude || data?.pickup_longitude || data?.drop_longitude;
    if (!lat || !lng) return null;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }, [data]);

  useEffect(() => {
    if (!token) return;

    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`${apiOrigin()}/track/${token}`, { cache: 'no-store' });
        const payload = await res.json();
        if (!active) return;
        if (!res.ok || !payload.success) {
          setError(payload.message || 'Tracking link tidak aktif.');
          setData(null);
        } else {
          setData(payload.data);
          setError('');
        }
      } catch {
        if (active) setError('Tracking belum bisa dimuat. Coba beberapa saat lagi.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    const interval = window.setInterval(load, 20_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-6">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.32em] text-emerald-300">LANCAR Live Tracking</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight">Pantau pengantaran</h1>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
            <Truck className="h-5 w-5" />
          </div>
        </header>

        {loading ? (
          <section className="flex flex-1 items-center justify-center text-slate-400">Memuat tracking...</section>
        ) : error ? (
          <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <ShieldCheck className="h-12 w-12 text-slate-500" />
            <h2 className="text-xl font-black">Link tidak aktif</h2>
            <p className="max-w-sm text-sm text-slate-400">{error}</p>
          </section>
        ) : data ? (
          <section className="flex flex-1 flex-col gap-5 py-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">Status pengantaran</p>
                  <h2 className="mt-1 text-2xl font-black">{statusLabel[data.status] || data.status}</h2>
                </div>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-200">
                  Live
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <InfoTile icon={<Truck className="h-5 w-5" />} label="Kurir" value={data.courier_name || 'Kurir LANCAR'} />
                <InfoTile icon={<Clock className="h-5 w-5" />} label="Update lokasi" value={formatTime(data.last_location_at)} />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900 p-5">
              <div className="mb-4 flex items-center gap-3">
                <Navigation className="h-5 w-5 text-emerald-300" />
                <h3 className="font-black">Rute</h3>
              </div>
              <div className="space-y-4">
                <AddressRow title="Pickup" address={data.pickup_address || 'Alamat pickup belum tersedia'} active />
                <AddressRow title="Dropoff" address={data.drop_address || 'Alamat tujuan belum tersedia'} />
              </div>
              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 font-black text-slate-950 transition hover:bg-emerald-400"
                >
                  <MapPin className="h-5 w-5" />
                  Buka Maps
                </a>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-start gap-3">
                <Package className="mt-0.5 h-5 w-5 text-emerald-300" />
                <div>
                  <h3 className="font-black">Privasi tracking</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Link ini hanya aktif selama perjalanan berlangsung dan otomatis berhenti saat order selesai.
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-2 text-emerald-300">{icon}</div>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-100">{value}</p>
    </div>
  );
}

function AddressRow({ title, address, active = false }: { title: string; address: string; active?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className={`mt-1 h-4 w-4 rounded-full border-4 ${active ? 'border-emerald-300 bg-emerald-950' : 'border-slate-500 bg-slate-950'}`} />
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-200">{address}</p>
      </div>
    </div>
  );
}
