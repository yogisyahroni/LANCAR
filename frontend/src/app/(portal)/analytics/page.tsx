"use client";

import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Package,
  ChevronRight
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { getSocket } from "@/lib/socket";
import { Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";

// TypeScript Interfaces
interface UnitEconomics {
  cac_idr: number;
  ltv_idr: number;
  aov_idr: number;
  avg_margin_idr: number;
  total_ppn: number;
  total_reserve: number;
  gross_revenue: number;
}

interface KPI {
  label: string;
  value: string;
  change: string;
  up: boolean;
}

const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function AnalyticsPage() {
  const { user, isAuthenticated } = useAuthStore();
  const [socket, setSocket] = useState<Socket | null>(null);

  // SWR Hooks
  const { data: kpis, mutate: mutateKPIs } = useSWR<KPI[]>("/admin/analytics/kpis", fetcher);
  const { data: economics, mutate: mutateEconomics } = useSWR<UnitEconomics>("/admin/analytics/unit-economics", fetcher);

  // Initialize WebSocket connection for Real-time Analytics updates
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const newSocket = getSocket(user.id);
    if (!newSocket) return;

    const handleAnalyticsUpdate = () => {
      mutateKPIs();
      mutateEconomics();
    };

    const handleOrderEvent = () => mutateEconomics();

    newSocket.on("analytics_update", handleAnalyticsUpdate);
    newSocket.on("order_created", handleOrderEvent);
    newSocket.on("order_delivered", () => {
      mutateKPIs();
      mutateEconomics();
    });

    setSocket(newSocket);

    return () => {
      newSocket.off("analytics_update", handleAnalyticsUpdate);
      newSocket.off("order_created", handleOrderEvent);
    };
  }, [isAuthenticated, user, mutateKPIs, mutateEconomics]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="space-y-8 select-none pb-10">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Real-time Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor key performance indicators and unit economics in real-time.
          </p>
        </div>
      </motion.div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis ? (
          kpis.map((kpi, index) => (
            <motion.div 
              key={index} 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="p-6 rounded-2xl border border-border/40 glass-card transition-all duration-300 hover:scale-[1.02] shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-muted-foreground">{kpi.label}</span>
                <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
              <div className="flex items-center gap-1.5 mt-2">
                {kpi.up ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                )}
                <span className={`text-[10px] font-bold ${kpi.up ? "text-emerald-500" : "text-rose-500"}`}>
                  {kpi.change} from last period
                </span>
              </div>
            </motion.div>
          ))
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted/40 border border-border/40 rounded-2xl animate-pulse" />
          ))
        )}
      </div>

      {/* Unit Economics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card rounded-2xl p-6 border border-border/40 flex flex-col gap-6"
        >
          <div>
            <h3 className="text-lg font-bold text-foreground">Unit Economics & Margins</h3>
            <p className="text-xs text-muted-foreground mt-1">Metrics calculated per customer & order over 30 days.</p>
          </div>

          {economics ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-border/10">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">CAC</p>
                  <p className="text-xl font-bold text-rose-500">{formatCurrency(economics.cac_idr)}</p>
                </div>
                <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-border/10">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">LTV</p>
                  <p className="text-xl font-bold text-emerald-500">{formatCurrency(economics.ltv_idr)}</p>
                </div>
                <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-border/10">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">AOV</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(economics.aov_idr)}</p>
                </div>
                <div className="p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-border/10">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Margin</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(economics.avg_margin_idr)}</p>
                </div>
              </div>

              <div className="pt-6 border-t border-border/40">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-foreground">Health Ratio (LTV:CAC)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-primary">
                      {economics.cac_idr > 0 ? (economics.ltv_idr / economics.cac_idr).toFixed(2) : "N/A"}x
                    </span>
                    {economics.cac_idr > 0 && (economics.ltv_idr / economics.cac_idr) >= 3 ? (
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-500 rounded-full font-bold">HEALTHY</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 bg-rose-500/20 text-rose-500 rounded-full font-bold">ACTION NEEDED</span>
                    )}
                  </div>
                </div>
                <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                   <div 
                     className={`h-full rounded-full transition-all duration-1000 ${ (economics.ltv_idr / economics.cac_idr) >= 3 ? 'bg-emerald-500' : 'bg-rose-500' }`} 
                     style={{ width: `${Math.min((economics.ltv_idr / economics.cac_idr) * 10, 100)}%` }} 
                   />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 bg-muted/40 animate-pulse rounded-xl" />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card rounded-2xl p-6 border border-border/40 flex flex-col gap-6"
        >
          <div>
            <h3 className="text-lg font-bold text-foreground">Financial Reserves & Tax</h3>
            <p className="text-xs text-muted-foreground mt-1">Automatic splitting of PPN and operational funds.</p>
          </div>

          {economics ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-border/10 group hover:border-primary/40 transition-all">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-zinc-500/10 rounded-lg flex items-center justify-center text-zinc-500">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Gross Revenue</p>
                    <p className="text-sm font-bold text-foreground">Last 30 Days</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-foreground">{formatCurrency(economics.gross_revenue)}</span>
              </div>

              <div className="flex justify-between items-center p-4 bg-rose-500/5 rounded-xl border border-rose-500/10 group hover:border-rose-500/40 transition-all">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-rose-500/10 rounded-lg flex items-center justify-center text-rose-500">
                    <TrendingDown className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-rose-500/80">PPN (1.1%)</p>
                    <p className="text-sm font-bold text-foreground">Tax Collected</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-rose-500">{formatCurrency(economics.total_ppn)}</span>
              </div>

              <div className="flex justify-between items-center p-4 bg-amber-500/5 rounded-xl border border-amber-500/10 group hover:border-amber-500/40 transition-all">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-amber-500/80">Weather Reserve (2%)</p>
                    <p className="text-sm font-bold text-foreground">Emergency Fund</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-amber-500">{formatCurrency(economics.total_reserve)}</span>
              </div>

              <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/20">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Dana cadangan cuaca digunakan secara otomatis untuk insentif kurir saat hujan ekstrem guna menjaga SLA tetap di atas 95%.
                </p>
              </div>
            </div>
          ) : (
            <div className="h-64 bg-muted/40 animate-pulse rounded-xl" />
          )}
        </motion.div>
      </div>
    </div>
  );
}
