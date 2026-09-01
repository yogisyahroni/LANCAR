import { describe, expect, it } from "vitest";
import { getOrderServicePresentation, getPaymentStatePresentation } from "@/components/orders/orderPresentation";

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

  it("keeps payment status separate from delivery status", () => {
    expect(getPaymentStatePresentation("paid").label).toBe("Lunas");
    expect(getPaymentStatePresentation("pending").label).toBe("Menunggu pembayaran");
  });
});
