"use client";

import { AggregatorWizard } from "@/components/orders/AggregatorWizard";
import Link from "next/link";

export default function NewEkspedisiOrderPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Kirim Paket Baru</h1>
          <p className="mt-2 text-muted-foreground">Isi detail pengambilan dan tujuan dengan lengkap.</p>
        </div>
        
        {/* Order Mode Selector */}
        <div className="flex bg-muted/60 p-1 rounded-xl border border-border/40 select-none shrink-0">
          <Link
            href="/orders/new"
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer text-muted-foreground hover:text-foreground"
          >
            🚀 Instan (On-Demand)
          </Link>
          <div
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-default bg-card text-foreground shadow-sm"
          >
            📦 Ekspedisi (Aggregator)
          </div>
        </div>
      </div>

      <div className="mt-6">
        <AggregatorWizard />
      </div>
    </div>
  );
}
