import { describe, expect, it } from "vitest";
import { CarFront, CircleHelp, Package, Truck, UtensilsCrossed, Wrench } from "lucide-react";
import { getCustomerServiceIcon } from "@/components/orders/serviceIcon";

describe("customer service icon contract", () => {
  it("uses distinct canonical icons for customer service categories", () => {
    expect(getCustomerServiceIcon("parcel")).toBe(Package);
    expect(getCustomerServiceIcon("instant")).toBe(Package);
    expect(getCustomerServiceIcon("food")).toBe(UtensilsCrossed);
    expect(getCustomerServiceIcon("tire")).toBe(Wrench);
    expect(getCustomerServiceIcon("towing")).toBe(CarFront);
    expect(getCustomerServiceIcon("aggregator")).toBe(Truck);
  });

  it("keeps named vehicle services distinct and unknown metadata honest", () => {
    expect(getCustomerServiceIcon("service", "Towing")).toBe(CarFront);
    expect(getCustomerServiceIcon("service", "Tambal Ban")).toBe(Wrench);
    expect(getCustomerServiceIcon("unknown")).toBe(CircleHelp);
  });
});
