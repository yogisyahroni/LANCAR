"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useRuntimeConfig } from "@/hooks/useRuntimeConfig";
import { Loader2, Package, Building2, MapPin, ArrowRight, Check, Info, Clock, TrendingDown, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────
interface CityOption {
  code: string;
  name: string;
  type: "origin" | "destination";
}

interface TariffOption {
  provider: string;
  provider_name: string;
  service: string;
  service_name: string;
  price: number;
  net_price?: number;
  etd: string;
  weight_kg: number;
  selected?: boolean;
}

interface CheckTariffParams {
  origin_code: string;
  destination_code: string;
  weight_kg: number;
}

interface AggregatorFormProps {
  onProviderSelect?: (provider: string, tariff: number, details: {
    provider_code: string;
    service_type: string;
    tariff_idr: number;
    net_cost_idr: number;
    origin_city: string;
    destination_city: string;
    weight_kg: number;
  }) => void;
}

// ─── Constants ─────────────────────────────────────────────────────
const INDONESIAN_CITIES: CityOption[] = [
  { code: "CGK", name: "Jakarta", type: "origin" },
  { code: "BDO", name: "Bandung", type: "destination" },
  { code: "SRG", name: "Semarang", type: "destination" },
  { code: "SUB", name: "Surabaya", type: "destination" },
  { code: "JOG", name: "Yogyakarta", type: "destination" },
  { code: "DPS", name: "Denpasar/Bali", type: "destination" },
  { code: "PLM", name: "Palembang", type: "destination" },
  { code: "MDN", name: "Medan", type: "destination" },
  { code: "UPG", name: "Makassar", type: "destination" },
  { code: "BPN", name: "Balikpapan", type: "destination" },
  { code: "BTM", name: "Batam", type: "destination" },
  { code: "PKU", name: "Pekanbaru", type: "destination" },
  { code: "BDG", name: "Banjarmasin", type: "destination" },
  { code: "MND", name: "Manado", type: "destination" },
  { code: "PNK", name: "Pontianak", type: "destination" },
  { code: "AMI", name: "Mataram", type: "destination" },
  { code: "KNO", name: "Kualanamu", type: "destination" },
  { code: "PDG", name: "Padang", type: "destination" },
  { code: "TKG", name: "Tanjung Karang", type: "destination" },
  { code: "SOC", name: "Solo", type: "destination" },
  { code: "MAL", name: "Malang", type: "destination" },
];

const CITIES_MAP: Record<string, string> = {};
INDONESIAN_CITIES.forEach((city) => { CITIES_MAP[city.code] = city.name; });

const PROVIDER_BRANDING: Record<string, { name: string; color: string }> = {
  jne: { name: "JNE Express", color: "text-blue-400" },
  jnt: { name: "J&T Express", color: "text-red-400" },
  sicepat: { name: "SiCepat", color: "text-orange-400" },
  anteraja: { name: "AnterAja", color: "text-green-400" },
};

// ─── Helper ────────────────────────────────────────────────────────
function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
}

// ─── Component ─────────────────────────────────────────────────────
export function AggregatorForm({ onProviderSelect }: AggregatorFormProps) {
  const [originCode, setOriginCode] = useState("CGK");
  const [destCode, setDestCode] = useState("");
  const [weight, setWeight] = useState(1);
  const [tariffs, setTariffs] = useState<TariffOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const searchTariffs = useCallback(async () => {
    if (!originCode || !destCode || !weight || weight < 0.1) {
      setError("Lengkapi kota asal, tujuan, dan berat paket.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSelectedIndex(null);

    try {
      // Hit all providers in parallel
      const providers = ["jne", "jnt", "sicepat", "anteraja"];
      const results = await Promise.allSettled(
        providers.map(async (provider) => {
          const res = await api.get("/api/v1/logistics/check-tariff", {
            params: {
              provider,
              origin_code: originCode,
              destination_code: destCode,
              weight_kg: weight,
            } as any,
          });
          const data = res.data?.data?.services || res.data?.tariffs || [];
          // Normalize: API may return single or array
          const items = Array.isArray(data) ? data : [data];
          return items.map((item: any) => ({
            provider,
            provider_name: PROVIDER_BRANDING[provider]?.name || provider,
            service: item.service_code || item.service || "reg",
            service_name: item.service_name || item.service || "Reguler",
            price: Number(item.tariff_gross || item.price || item.total_price_idr || 0),
            net_price: Number(item.tariff_net || 0),
            etd: item.etd || item.estimated_days || "1-3 hari",
            weight_kg: Number(item.weight_kg || weight),
          }));
        })
      );

      const allTariffs: TariffOption[] = [];
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value.length > 0) {
          allTariffs.push(...result.value);
        }
      });

      // Sort by price ascending
      allTariffs.sort((a, b) => a.price - b.price);

      if (allTariffs.length === 0) {
        setError("Belum ada tarif tersedia untuk rute ini. Coba kota lain.");
      }

      setTariffs(allTariffs);
      setHasSearched(true);
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || "Tarif belum bisa dicek. Coba lagi.");
      setTariffs([]);
    } finally {
      setIsLoading(false);
    }
  }, [originCode, destCode, weight]);

  const selectTariff = (index: number) => {
    setSelectedIndex(index);
    const tariff = tariffs[index];
    if (tariff && onProviderSelect) {
      onProviderSelect(tariff.provider, tariff.price, {
        provider_code: tariff.provider,
        service_type: tariff.service,
        tariff_idr: tariff.price,
        net_cost_idr: tariff.net_price || Math.round(tariff.price * 0.85), // use API net if available, else estimate
        origin_city: CITIES_MAP[originCode] || originCode,
        destination_city: CITIES_MAP[destCode] || destCode,
        weight_kg: tariff.weight_kg,
      });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* City Selection */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] items-end">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Kota Asal</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
            <select
              value={originCode}
              onChange={(e) => setOriginCode(e.target.value)}
              className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 pl-10 pr-8 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {INDONESIAN_CITIES.filter((c) => c.type === "origin").map((city) => (
                <option key={city.code} value={city.code}>{city.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-center pb-2">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Kota Tujuan</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" />
            <select
              value={destCode}
              onChange={(e) => setDestCode(e.target.value)}
              className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 pl-10 pr-8 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="">Pilih kota tujuan...</option>
              {INDONESIAN_CITIES.filter((c) => c.type === "destination" && c.code !== originCode).map((city) => (
                <option key={city.code} value={city.code}>{city.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Weight */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Berat Paket (kg)</label>
        <input
          type="number"
          min="0.1"
          max="50"
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(Math.max(0.1, Number(e.target.value) || 0.1))}
          className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <p className="mt-1 text-xs text-muted-foreground">Berat maksimal 50 kg. Untuk di atas 50 kg, hubungi customer service.</p>
      </div>

      {/* Search Button */}
      <button
        type="button"
        onClick={searchTariffs}
        disabled={isLoading || !destCode}
        className="w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cek Tarif...</span>
        ) : (
          "Cek Tarif Semua Provider"
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Tariff Comparison */}
      {hasSearched && tariffs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Perbandingan Tarif</h4>
            {tariffs.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Termurah: <span className="font-semibold text-emerald-400">{formatPrice(tariffs[0].price)}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            {tariffs.map((tariff, index) => {
              const isSelected = selectedIndex === index;
              const isCheapest = index === 0;
              const providerBrand = PROVIDER_BRANDING[tariff.provider] || { name: tariff.provider_name, color: "text-gray-400" };

              return (
                <button
                  key={`${tariff.provider}-${tariff.service}-${index}`}
                  type="button"
                  onClick={() => selectTariff(index)}
                  className={[
                    "relative rounded-lg border p-4 text-left transition-all",
                    isSelected
                      ? "border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-500/5"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/10",
                    isCheapest && !isSelected ? "ring-1 ring-emerald-500/30" : "",
                  ].join(" ")}
                >
                  {isCheapest && (
                    <span className="absolute -right-1 -top-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                      TERMURAH
                    </span>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-semibold ${providerBrand.color}`}>{providerBrand.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{tariff.service_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">{formatPrice(tariff.price)}</p>
                      <p className="text-xs text-muted-foreground">{tariff.etd}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
                      <Package className="h-3 w-3" />
                      {tariff.weight_kg} kg
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
                      <Clock className="h-3 w-3" />
                      {tariff.etd}
                    </span>
                    {isCheapest && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                        <TrendingDown className="h-3 w-3" />
                        Termurah
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {hasSearched && tariffs.length === 0 && !isLoading && !error && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-6 py-10 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium text-foreground">Tidak ada tarif tersedia</p>
            <p className="mt-1 text-xs text-muted-foreground">Coba pilih kota asal dan tujuan yang berbeda.</p>
          </div>
        </div>
      )}
    </div>
  );
}