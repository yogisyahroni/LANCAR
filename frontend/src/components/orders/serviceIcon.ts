import {
  CarFront,
  CircleHelp,
  Package,
  Truck,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type CustomerServiceIconKey =
  | "parcel"
  | "instant"
  | "food"
  | "tire"
  | "towing"
  | "aggregator"
  | "service"
  | "unknown";

export type CustomerServiceDescriptor = {
  code?: string | null;
  name?: string | null;
  service_category?: string | null;
  service_family?: string | null;
};

/** One canonical service icon mapping shared by marketing and transactional surfaces. */
export function getCustomerServiceIcon(key: CustomerServiceIconKey, label = ""): LucideIcon {
  switch (key) {
    case "parcel":
    case "instant":
      return Package;
    case "food":
      return UtensilsCrossed;
    case "tire":
      return Wrench;
    case "towing":
      return CarFront;
    case "aggregator":
      return Truck;
    case "service":
      return label.toLowerCase().includes("towing") ? CarFront : Wrench;
    case "unknown":
    default:
      return CircleHelp;
  }
}

/** Resolve the same canonical icon for service records returned by the API. */
export function getCustomerServiceIconForService(service: CustomerServiceDescriptor): LucideIcon {
  const code = service.code?.trim().toLowerCase() ?? "";
  const category = service.service_category?.trim().toLowerCase() ?? "";
  const signal = [code, service.name, category, service.service_family]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (category === "aggregator" || signal.includes("aggregator") || signal.includes("ekspedisi")) {
    return getCustomerServiceIcon("aggregator");
  }
  if (signal.includes("food") || signal.includes("kuliner")) {
    return getCustomerServiceIcon("food");
  }
  if (signal.includes("towing") || signal.includes("derek")) {
    return getCustomerServiceIcon("towing");
  }
  if (signal.includes("tire") || signal.includes("tambal") || signal.includes("ban")) {
    return getCustomerServiceIcon("tire");
  }
  if (
    category === "package_on_demand" ||
    signal.includes("instant") ||
    signal.includes("parcel") ||
    signal.includes("paket") ||
    signal.includes("p2p")
  ) {
    return getCustomerServiceIcon("instant");
  }
  return getCustomerServiceIcon("unknown");
}
