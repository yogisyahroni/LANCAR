export type LogisticsProviderAvailabilityReason =
  | "credentials_not_configured"
  | "circuit_open"
  | "provider_unavailable"
  | string;

export interface LogisticsProviderOption {
  code: string;
  name: string;
  capabilities?: string[];
  services?: Array<{ code: string; name: string }>;
  tracking_mode?: "webhook" | "polling" | "degraded_manual" | string;
  tracking_degraded?: boolean;
  available?: boolean;
  availability_reason?: LogisticsProviderAvailabilityReason;
}

export const isLogisticsProviderAvailable = (provider?: LogisticsProviderOption | null): boolean =>
  Boolean(provider && provider.available !== false);

export const providerAvailabilityMessage = (provider?: LogisticsProviderOption | null): string => {
  if (isLogisticsProviderAvailable(provider)) return "Provider siap digunakan";
  if (provider?.availability_reason === "circuit_open") return "Sementara tidak tersedia";
  return "Belum siap digunakan";
};
