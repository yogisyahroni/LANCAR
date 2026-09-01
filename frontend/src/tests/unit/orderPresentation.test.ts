import { describe, expect, it } from "vitest";
import {
  deliveryStateLabel,
  getOrderServicePresentation,
  getPaymentStatePresentation,
} from "@/components/orders/orderPresentation";

describe("customer order service presentation", () => {
  it("keeps LANCAR first-mile and external carrier distinct for aggregator orders", () => {
    const presentation = getOrderServicePresentation({
      model: "hub_and_spoke",
      service_code: "tembus_aggregator",
      logistics_provider: "jne",
      logistics_service_type: "regular",
      awb_number: "AWB-REAL-1",
    });

    expect(presentation.kind).toBe("aggregator");
    expect(presentation.firstMileLabel).toBe("First-mile: LANCAR");
    expect(presentation.externalCarrierLabel).toContain("jne · regular");
    expect(presentation.externalCarrierLabel).toContain("AWB-REAL-1");
  });

  it("does not turn missing service metadata into an instant claim", () => {
    const presentation = getOrderServicePresentation({ model: "unknown_model", service_code: "legacy_service" });
    expect(presentation.kind).toBe("unknown");
    expect(presentation.label).toBe("Layanan belum teridentifikasi");
    expect(getOrderServicePresentation({}).kind).toBe("unknown");
  });

  it("keeps food, instant, and named service labels tied to server metadata", () => {
    expect(getOrderServicePresentation({ service_code: "tembus_food", service_snapshot: { category: "food" } }).kind)
      .toBe("food");
    expect(getOrderServicePresentation({ model: "p2p", service_code: "tembus_instant" }).label)
      .toBe("Instan LANCAR");
    expect(getOrderServicePresentation({ service_snapshot: { service_name: "Tambal Ban" } }).label)
      .toBe("Tambal Ban");
  });

  it("renders unavailable carrier metadata without inventing an AWB", () => {
    const presentation = getOrderServicePresentation({
      service_code: "tembus_aggregator",
      model: "hub_and_spoke",
    });

    expect(presentation.externalCarrierLabel).toBe("Carrier eksternal: belum ditetapkan");
    expect(presentation.externalCarrierLabel).not.toContain("AWB");
  });

  it("keeps payment status separate from delivery status", () => {
    expect(getPaymentStatePresentation("paid").label).toBe("Lunas");
    expect(getPaymentStatePresentation("pending").label).toBe("Menunggu pembayaran");
    expect(getPaymentStatePresentation("failed").label).toBe("Pembayaran gagal");
    expect(getPaymentStatePresentation("expired").label).toBe("Pembayaran kedaluwarsa");
    expect(getPaymentStatePresentation("unknown").label).toBe("Status pembayaran belum tersedia");
    expect(deliveryStateLabel("out_for_delivery")).toBe("Out For Delivery");
    expect(deliveryStateLabel(null)).toBe("Status pengiriman belum tersedia");
  });
});
