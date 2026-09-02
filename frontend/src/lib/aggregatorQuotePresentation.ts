export type AggregatorCarrierQuote = {
  quote_id: string;
  provider: string;
  provider_name: string;
  service: string;
  service_name: string;
  price: number;
  net_price?: number;
  provider_gross_price?: number;
  etd?: string;
  etd_source?: string;
  expires_at?: string;
  rule_version?: string;
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
  const quoteId = firstString(item.quote_id);
  const service = firstString(item.service_code, item.service);
  const serviceName = firstString(item.service_name, item.service_display, item.service);
  // The customer-facing amount is the persisted server-calculated tariff.
  // Provider gross remains presentation metadata and must not become order truth.
  const price = positiveNumber(item.customer_tariff_idr ?? item.price ?? item.total_price_idr ?? item.tariff_gross);
  if (!quoteId || !service || !serviceName || !price) return null;

  const providerWeight = positiveNumber(
    item.chargeable_weight_kg ?? item.chargeable_weight ?? item.billable_weight_kg,
  );
  const requestedWeight = positiveNumber(requestedWeightKg);
  const netPrice = positiveNumber(item.tariff_net ?? item.net_price);
  const providerGrossPrice = positiveNumber(item.tariff_gross);

  return {
    ...provider,
    quote_id: quoteId,
    service,
    service_name: serviceName,
    price,
    ...(netPrice ? { net_price: netPrice } : {}),
    ...(providerGrossPrice ? { provider_gross_price: providerGrossPrice } : {}),
    etd: firstString(item.etd, item.estimated_days),
    etd_source: firstString(item.etd_source),
    expires_at: firstString(item.expires_at),
    rule_version: firstString(item.rule_version),
    ...(providerWeight || requestedWeight ? { chargeable_weight_kg: providerWeight ?? requestedWeight } : {}),
    chargeable_weight_source: providerWeight ? "provider" : "request",
    source: firstString(item.source, item.quote_source, item.etd_source),
    capabilities: stringArray(item.capabilities).length > 0 ? stringArray(item.capabilities) : providerCapabilities,
    limitations: stringArray(item.limitations),
  };
}

export function capabilityLabel(capability: string): string {
  return capability.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
