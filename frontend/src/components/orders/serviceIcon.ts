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
