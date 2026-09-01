export type AggregatorCarrierQuote = {
  provider: string;
  provider_name: string;
  service: string;
  service_name: string;
  price: number;
  net_price?: number;
  etd?: string;
  chargeable_weight_kg?: number;
  chargeable_weight_source: "provider" | "request";
  source?: string;
  capabilities: string[];
  limitations: string[];
};

type UnknownRecord = Record<string, unknown>;

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

export function normalizeAggregatorCarrierQuote(
  item: UnknownRecord,
  provider: Pick<AggregatorCarrierQuote, "provider" | "provider_name">,
  requestedWeightKg: number,
  providerCapabilities: string[] = [],
): AggregatorCarrierQuote | null {
  const service = firstString(item.service_code, item.service);
  const serviceName = firstString(item.service_name, item.service_display, item.service);
  const price = positiveNumber(item.tariff_gross ?? item.price ?? item.total_price_idr);
  if (!service || !serviceName || !price) return null;

  const providerWeight = positiveNumber(
    item.chargeable_weight_kg ?? item.chargeable_weight ?? item.billable_weight_kg,
  );
  const requestedWeight = positiveNumber(requestedWeightKg);
  const netPrice = positiveNumber(item.tariff_net ?? item.net_price);

  return {
    ...provider,
    service,
    service_name: serviceName,
    price,
    ...(netPrice ? { net_price: netPrice } : {}),
    etd: firstString(item.etd, item.estimated_days),
    ...(providerWeight || requestedWeight ? { chargeable_weight_kg: providerWeight ?? requestedWeight } : {}),
    chargeable_weight_source: providerWeight ? "provider" : "request",
    source: firstString(item.source, item.quote_source),
    capabilities: stringArray(item.capabilities).length > 0 ? stringArray(item.capabilities) : providerCapabilities,
    limitations: stringArray(item.limitations),
  };
}

export function capabilityLabel(capability: string): string {
  return capability.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
