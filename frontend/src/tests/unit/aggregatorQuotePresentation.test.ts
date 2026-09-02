import { describe, expect, it } from "vitest";
import { normalizeAggregatorCarrierQuote } from "@/lib/aggregatorQuotePresentation";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

describe("normalizeAggregatorCarrierQuote", () => {
  it("keeps provider-authoritative quote fields and does not invent ETA or net cost", () => {
    const quote = normalizeAggregatorCarrierQuote(
      { quote_id: QUOTE_ID, service_code: "REG", service_name: "Regular", tariff_gross: 15000 },
      { provider: "jne", provider_name: "JNE" },
      1.5,
      ["tariff", "shipment"],
    );

    expect(quote).toMatchObject({
      quote_id: QUOTE_ID,
      service: "REG",
      price: 15000,
      chargeable_weight_kg: 1.5,
      chargeable_weight_source: "request",
      capabilities: ["tariff", "shipment"],
      limitations: [],
    });
    expect(quote?.etd).toBeUndefined();
    expect(quote?.net_price).toBeUndefined();
  });

  it("prefers provider fields and rejects incomplete or non-positive authoritative quotes", () => {
    const quote = normalizeAggregatorCarrierQuote(
      {
        quote_id: QUOTE_ID,
        service_code: "YES",
        service_display: "Yakin Esok Sampai",
        tariff_gross: "22000",
        tariff_net: "19000",
        estimated_days: "1 hari",
        chargeable_weight_kg: "2",
        source: "jne_api",
        limitations: ["Tidak menerima barang berbahaya"],
      },
      { provider: "jne", provider_name: "JNE" },
      1,
    );

    expect(quote).toMatchObject({
      quote_id: QUOTE_ID,
      service_name: "Yakin Esok Sampai",
      price: 22000,
      net_price: 19000,
      etd: "1 hari",
      chargeable_weight_kg: 2,
      chargeable_weight_source: "provider",
      source: "jne_api",
      limitations: ["Tidak menerima barang berbahaya"],
    });
    expect(normalizeAggregatorCarrierQuote(
      { quote_id: QUOTE_ID, service_code: "REG", service_name: "Regular", tariff_gross: 0 },
      { provider: "jne", provider_name: "JNE" },
      1,
    )).toBeNull();
    expect(normalizeAggregatorCarrierQuote(
      { service_code: "REG", service_name: "Regular", tariff_gross: 15000 },
      { provider: "jne", provider_name: "JNE" },
      1,
    )).toBeNull();
  });
});
