import {
  isLogisticsProviderAvailable,
  providerAvailabilityMessage,
} from "@/types/logistics";
import type { LogisticsProviderOption } from "@/types/logistics";
import { describe, expect, it } from "vitest";

describe("logistics provider availability", () => {
  it("keeps a provider selectable only when the server does not mark it unavailable", () => {
    const available: LogisticsProviderOption = { code: "jne", name: "JNE", available: true };
    const unavailable: LogisticsProviderOption = {
      code: "jnt",
      name: "J&T",
      available: false,
      availability_reason: "circuit_open",
    };

    expect(isLogisticsProviderAvailable(available)).toBe(true);
    expect(isLogisticsProviderAvailable(unavailable)).toBe(false);
    expect(providerAvailabilityMessage(unavailable)).toBe("Sementara tidak tersedia");
  });

  it("does not treat a missing availability field as an unavailable provider", () => {
    expect(isLogisticsProviderAvailable({ code: "jne", name: "JNE" })).toBe(true);
  });
});
