import { describe, expect, it } from "vitest";
import { addressPointSchema, createOrderSchema, isValidLocation } from "@/components/orders/OrderSchemas";

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

  it("requires complete package facts and preserves the delivery policy", () => {
    const result = createOrderSchema().safeParse({
      service_code: "tembus_instant",
      pickup_address: "Jl. Pickup 123",
      pickup_location: { lat: -6.2, lng: 106.8 },
      dropoff_address: "Jl. Tujuan 456",
      dropoff_location: { lat: -6.21, lng: 106.81 },
      recipient_name: "Siti",
      recipient_phone: "081234567890",
      package_details: {
        category: "Dokumen",
        item_description: "Dokumen asli dalam map",
        quantity: 2,
        is_fragile: true,
        is_prohibited: false,
        requires_delivery_code: true,
        vehicle_type: "Motor",
        weight_kg: 1,
        dimensions: { length: 30, width: 20, height: 10 },
        dimensions_scanned: false
      },
      has_insurance: false,
      schedule_type: "now"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.package_details.quantity).toBe(2);
      expect(result.data.package_details.is_fragile).toBe(true);
      expect(result.data.package_details.requires_delivery_code).toBe(true);
    }
  });
});
