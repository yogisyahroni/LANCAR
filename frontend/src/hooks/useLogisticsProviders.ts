"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LogisticsProviderOption } from "@/types/logistics";

export function useLogisticsProviders() {
  const [providers, setProviders] = useState<LogisticsProviderOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.get("/logistics/providers")
      .then((response) => {
        const data = response.data?.data;
        if (!Array.isArray(data)) throw new Error("Respons katalog provider tidak valid");
        const available = data.filter((provider: LogisticsProviderOption) =>
          provider.capabilities?.includes("tariff") && provider.capabilities?.includes("shipment")
        );
        if (active) setProviders(available);
      })
      .catch((reason: any) => {
        if (!active) return;
        setProviders([]);
        setError(reason.response?.data?.message || reason.message || "Katalog ekspedisi tidak tersedia.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  return { providers, isLoading, error };
}
