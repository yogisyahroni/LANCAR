"use client";

import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, DollarSign, Users, Package } from "lucide-react";
import { api } from "@/lib/api";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/hooks/useAuth";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from "recharts";

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
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  // SWR Hooks
  const { data: kpis, mutate: mutateKPIs } = useSWR<KPI[]>("/admin/analytics/kpis", fetcher);
  const { data: economics, mutate: mutateEconomics } = useSWR<UnitEconomics>("/admin/analytics/unit-economics", fetcher);
  const { data: heatData } = useSWR("/admin/analytics/heat-data", fetcher);

  // Initialize WebSocket connection for Real-time Analytics updates
  useEffect(() => {
    if (!token || !user) return;

    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000", {
      auth: { token },
      query: { role: user.role }
    });

    newSocket.on("connect", () => {
      console.log("Analytics WebSocket connected");
    });

    // Listen for real-time order/analytics updates
    newSocket.on("analytics_update", () => {
      // Re-fetch data on real-time update
      mutateKPIs();
      mutateEconomics();
    });

    // Example of order event mapping to analytics
    newSocket.on("order_created", () => mutateEconomics());
    newSocket.on("order_delivered", () => {
      mutateKPIs();
      mutateEconomics();
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user, mutateKPIs, mutateEconomics]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Real-time Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Monitor key performance indicators and unit economics in real-time.
        </p>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis ? (
          kpis.map((kpi, index) => (
            <Card key={index} className="shadow-sm border-white/10 bg-background/80 backdrop-blur-md transition-all duration-200 hover:scale-[1.02]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpi.value}</div>
                <div className="flex items-center space-x-2 mt-1">
                  {kpi.up ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-rose-500" />
                  )}
                  <p className={`text-xs ${kpi.up ? "text-emerald-500" : "text-rose-500"}`}>
                    {kpi.change} from last period
                  </p>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          // Skeleton Loaders
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="shadow-sm animate-pulse">
              <CardHeader className="h-10 bg-muted/50 rounded-t-xl" />
              <CardContent className="h-20 bg-muted rounded-b-xl" />
            </Card>
          ))
        )}
      </div>

      {/* Unit Economics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Unit Economics & Margins</CardTitle>
            <CardDescription>Metrics calculated per customer & order over 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {economics ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">CAC (Customer Acquisition Cost)</p>
                    <p className="text-xl font-semibold text-rose-600">{formatCurrency(economics.cac_idr)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">LTV (Life-Time Value)</p>
                    <p className="text-xl font-semibold text-emerald-600">{formatCurrency(economics.ltv_idr)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Average Order Value (AOV)</p>
                    <p className="text-xl font-semibold">{formatCurrency(economics.aov_idr)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Margin Per Order</p>
                    <p className="text-xl font-semibold text-blue-600">{formatCurrency(economics.avg_margin_idr)}</p>
                  </div>
                </div>

                {/* LTV/CAC Ratio Indicator */}
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Health Ratio (LTV:CAC)</p>
                  <div className="flex items-center space-x-4">
                    <div className="text-2xl font-bold">
                      {economics.cac_idr > 0 ? (economics.ltv_idr / economics.cac_idr).toFixed(2) : "N/A"}x
                    </div>
                    {economics.cac_idr > 0 && (economics.ltv_idr / economics.cac_idr) >= 3 ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Healthy {'>'} 3x</Badge>
                    ) : (
                      <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Needs Attention</Badge>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-48 animate-pulse bg-muted rounded-md" />
            )}
          </CardContent>
        </Card>

        {/* Tax & Reserves (PPN, Weather Fund, Operational) */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Financial Reserves & Tax</CardTitle>
            <CardDescription>Automatic splitting of PPN and operational funds.</CardDescription>
          </CardHeader>
          <CardContent>
             {economics ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <DollarSign className="h-5 w-5 text-gray-500" />
                      <span className="font-medium">Gross Revenue (30D)</span>
                    </div>
                    <span className="font-bold">{formatCurrency(economics.gross_revenue)}</span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-rose-50/50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Activity className="h-5 w-5 text-rose-500" />
                      <span className="font-medium">PPN Collected (1.1%)</span>
                    </div>
                    <span className="font-bold text-rose-700">{formatCurrency(economics.total_ppn)}</span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-amber-50/50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Package className="h-5 w-5 text-amber-500" />
                      <span className="font-medium">Weather / Emergency Reserve (2%)</span>
                    </div>
                    <span className="font-bold text-amber-700">{formatCurrency(economics.total_reserve)}</span>
                  </div>
                </div>
             ) : (
               <div className="h-48 animate-pulse bg-muted rounded-md" />
             )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
