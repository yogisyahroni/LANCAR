import { describe, expect, it } from "vitest";
import { addressPointSchema, isValidLocation } from "@/components/orders/OrderSchemas";

describe("coordinate-safe on-demand addresses", () => {
  it("rejects zero, non-finite, and out-of-range coordinates", () => {
    expect(isValidLocation({ lat: -6.2, lng: 106.8 })).toBe(true);
    expect(isValidLocation({ lat: 0, lng: 0 })).toBe(false);
    expect(isValidLocation({ lat: Number.NaN, lng: 106.8 })).toBe(false);
    expect(isValidLocation({ lat: 91, lng: 106.8 })).toBe(false);
  });

  it("requires an atomic resolved address point", () => {
    const result = addressPointSchema.safeParse({
      id: "saved-1",
      label: "Rumah",
      address: "Jl. Merdeka 1",
      lat: -6.2,
      lng: 106.8,
      source: "saved",
      resolved_at: new Date().toISOString()
    });
    expect(result.success).toBe(true);
    expect(addressPointSchema.safeParse({ id: "manual", label: "Teks", address: "Jl. A", lat: 0, lng: 0, source: "manual", resolved_at: new Date().toISOString() }).success).toBe(false);
  });
});
