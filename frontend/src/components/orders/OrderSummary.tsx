"use client";

import { motion } from "framer-motion";
import { Package, MapPin, ShieldCheck, Zap } from "lucide-react";

interface OrderSummaryProps {
  isLoading: boolean;
  pricing: {
    distance_km: number;
    base_price_idr: number;
    volumetric_surcharge_idr: number;
    insurance_premium_idr: number;
    total_price_idr: number;
  } | null;
  isValid: boolean;
}

export function OrderSummary({ isLoading, pricing, isValid }: OrderSummaryProps) {
  return (
    <div className="sticky top-8 rounded-2xl border border-white/10 bg-background/50 p-6 shadow-xl backdrop-blur-md">
      <h3 className="mb-6 text-lg font-semibold tracking-tight">Ringkasan Biaya</h3>

      <div className="space-y-4">
        {/* Base Fare */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>Ongkos Kirim {pricing ? `(${pricing.distance_km} km)` : ""}</span>
          </div>
          <span className="font-medium text-foreground">
            {isLoading ? (
              <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/10"></span>
            ) : pricing ? (
              `Rp ${pricing.base_price_idr.toLocaleString('id-ID')}`
            ) : (
              "-"
            )}
          </span>
        </div>

        {/* Volumetric / Weight Surcharge */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>Biaya Dimensi/Berat</span>
          </div>
          <span className="font-medium text-foreground">
            {isLoading ? (
              <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/10"></span>
            ) : pricing ? (
              pricing.volumetric_surcharge_idr > 0 ? `Rp ${pricing.volumetric_surcharge_idr.toLocaleString('id-ID')}` : "Gratis"
            ) : (
              "-"
            )}
          </span>
        </div>

        {/* Insurance */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>Asuransi</span>
          </div>
          <span className="font-medium text-foreground">
            {isLoading ? (
              <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/10"></span>
            ) : pricing ? (
              pricing.insurance_premium_idr > 0 ? `Rp ${pricing.insurance_premium_idr.toLocaleString('id-ID')}` : "-"
            ) : (
              "-"
            )}
          </span>
        </div>

        {/* Surge/Dynamic Pricing - placeholder for UI */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="h-4 w-4 text-amber-500" />
            <span>High Demand Surcharge</span>
          </div>
          <span className="font-medium text-foreground">-</span>
        </div>
      </div>

      <div className="my-6 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">Total Tagihan</span>
        <div className="text-right">
          <span className="text-2xl font-bold tracking-tight text-emerald-500">
            {isLoading ? (
              <span className="inline-block h-8 w-24 animate-pulse rounded bg-emerald-500/20"></span>
            ) : pricing ? (
              `Rp ${pricing.total_price_idr.toLocaleString('id-ID')}`
            ) : (
              "Rp 0"
            )}
          </span>
        </div>
      </div>

      <motion.button
        type="submit"
        form="order-form"
        disabled={!isValid || isLoading || !pricing}
        className="mt-8 w-full rounded-xl bg-primary px-4 py-4 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:shadow-primary/25 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]"
        whileTap={isValid && !isLoading && pricing ? { scale: 0.98 } : {}}
      >
        {isLoading ? "Menghitung..." : "Bayar Sekarang"}
      </motion.button>
    </div>
  );
}
