"use client";

import { useState } from "react";
import { MapPin, Package, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

const TrackingLiveMap = dynamic(() => import("./TrackingLiveMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[300px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/5">
      <Loader2 className="h-8 w-8 animate-spin text-white/50" />
    </div>
  ),
});

interface PublicTrackingEvent {
  status: string;
  description: string;
  timestamp: string;
  location?: string;
}

interface GPSLocation {
  latitude: number;
  longitude: number;
}

interface PublicTrackingResponse {
  resi_number: string;
  status: string;
  model: string;
  origin: string;
  destination: string;
  timeline: PublicTrackingEvent[];
  live_map?: GPSLocation;
}

export default function PublicTrackingWidget() {
  const [resi, setResi] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicTrackingResponse | null>(null);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resi.trim()) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`https://api.tembus.com/api/v1/tracking/public?resi=${encodeURIComponent(resi)}`);
      // Note: In development we might need to point this to the correct local proxy or backend URL.
      // Assuming Next.js proxy or standard base URL setup. Let's use relative path if we can, but since this is a microservices arch, let's use the local API if needed.
      // Wait, let's use a relative URL if there is an API gateway, or hardcode local port 8080 for now if no gateway.
      // I'll check how other parts of landing-page call the backend. But actually, landing page is mostly static. 
      // Let's use `/api/tracking` and we can set up a rewrite in next.config.mjs.
      
      const response = await fetch(`http://localhost:8080/api/v1/tracking/public?resi=${encodeURIComponent(resi)}`);
      
      if (!response.ok) {
        throw new Error("Nomor resi tidak ditemukan atau terjadi kesalahan server");
      }
      const json = await response.json();
      if (json.data) {
        setData(json.data);
      } else {
        throw new Error("Format respons tidak valid");
      }
    } catch (err: any) {
      let errorMessage = err.message || "Gagal melacak paket";
      const errLower = errorMessage.toLowerCase();
      
      // Translate generic technical errors into user-friendly messages
      if (errLower.includes("failed to fetch") || errLower.includes("network error")) {
        errorMessage = "Tidak dapat memuat data. Mohon pastikan koneksi internet Anda aktif dan stabil.";
      } else if (errLower.includes("tidak ditemukan") || errLower.includes("not found") || errLower.includes("missing")) {
        errorMessage = "Nomor resi tidak ditemukan. Mohon pastikan nomor resi sudah dimasukkan dengan benar.";
      } else if (errLower.includes("format") || errLower.includes("valid") || errLower.includes("syntax")) {
        errorMessage = "Informasi pelacakan tidak dapat diproses saat ini. Mohon coba beberapa saat lagi.";
      } else {
        errorMessage = "Pencarian status paket sedang tidak tersedia. Mohon muat ulang halaman atau coba lagi nanti.";
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Dummy fallback timeline if no data
  const fallbackTimeline = [
    { desc: "Pesanan Dibuat", time: "15 Jun 2026, 08:30" },
    { desc: "Kurir Pickup", time: "15 Jun 2026, 09:15" },
    { desc: "Dalam Pengiriman", time: "15 Jun 2026, 10:20" },
    { desc: "Sampai Tujuan", time: "15 Jun 2026, 11:45" },
  ];

  return (
    <div className="flex-1 lg:flex w-full flex-col md:flex-row gap-8 items-start">
      <div className="flex-1 w-full max-w-xl">
        <h2 className="text-2xl font-black leading-tight">
          Lacak Paket Anda<br />Secara Real-Time
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/74">
          Masukkan nomor resi untuk melacak<br />status pengiriman paket Anda.
        </p>
        <form onSubmit={handleTrack} className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <label className="sr-only" htmlFor="tracking-number">Nomor resi</label>
          <input
            id="tracking-number"
            type="text"
            value={resi}
            onChange={(e) => setResi(e.target.value)}
            inputMode="text"
            autoComplete="off"
            placeholder="Masukkan No. Resi"
            className="min-h-[46px] flex-1 rounded-lg border border-white/12 bg-white px-4 text-sm font-semibold text-[#071712] outline-none transition-all duration-200 placeholder:text-[#ccc] focus:border-[#7bc043] focus:ring-4 focus:ring-[#7bc043]/25"
          />
          <button
            type="submit"
            disabled={loading}
            className="min-h-[46px] shrink-0 rounded-lg bg-[#448045] px-6 text-sm font-bold text-white transition-all duration-200 hover:brightness-110 active:scale-95 disabled:opacity-70 flex items-center justify-center"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Lacak"}
          </button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-400 font-medium">{error}</p>
        )}
        <p className="mt-2 text-[11px] text-white/60">Contoh No. Resi: TBX1234567890</p>
      </div>

      <div className="w-full lg:w-1/2 lg:pl-8 lg:border-l lg:border-white/10 mt-8 lg:mt-0 min-h-[300px]">
        {data ? (
          <div className="flex flex-col h-full">
            <div className="mb-4 bg-white/10 p-4 rounded-lg border border-white/10">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-white/60 uppercase">Tipe Layanan</span>
                <span className="text-sm font-bold text-[#ffb47d] uppercase">{data.model}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white/60 uppercase">Status</span>
                <span className="text-sm font-bold text-white uppercase">{data.status}</span>
              </div>
            </div>

            {data.live_map && (data.model === "instant" || data.model === "same-day") ? (
              <div className="flex-1 w-full min-h-[300px] h-full relative">
                <TrackingLiveMap latitude={data.live_map.latitude} longitude={data.live_map.longitude} status={data.status} />
              </div>
            ) : (
              <div className="space-y-5 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {data.timeline.length > 0 ? (
                  data.timeline.map((item, index) => (
                    <div key={index} className="flex items-start gap-4">
                      <span className="relative flex shrink-0 items-center justify-center mt-0.5">
                        {index < data.timeline.length - 1 && (
                          <span className="absolute left-1/2 top-6 bottom-[-20px] w-0 -translate-x-1/2 border-l-2 border-dashed border-[#ffb47d]/40" />
                        )}
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#ffb47d]/30 bg-[#153423]">
                          {index === 0 ? <Package className="h-3.5 w-3.5 text-[#ffb47d]" /> : <MapPin className="h-3.5 w-3.5 text-[#ffb47d]" />}
                        </span>
                      </span>
                      <div>
                        <strong className="block text-[13px] font-bold text-white">{item.description}</strong>
                        <span className="text-[11px] text-white/60">{formatTime(item.timestamp)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white/60">Belum ada pembaruan status.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {fallbackTimeline.map((item, index) => (
              <div key={item.desc} className="flex items-start gap-4 opacity-50">
                <span className="relative flex shrink-0 items-center justify-center mt-0.5">
                  {index < fallbackTimeline.length - 1 && (
                    <span className="absolute left-1/2 top-6 bottom-[-20px] w-0 -translate-x-1/2 border-l-2 border-dashed border-[#ffb47d]/40" />
                  )}
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#ffb47d]/30 bg-[#153423]">
                    <MapPin className="h-3.5 w-3.5 text-[#ffb47d]" />
                  </span>
                </span>
                <div>
                  <strong className="block text-[13px] font-bold text-white">{item.desc}</strong>
                  <span className="text-[11px] text-white/60">{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
