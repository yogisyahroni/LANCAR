export type OrderPresentationInput = {
  model?: string | null;
  service_category?: "package_on_demand" | "food" | "tambal_ban" | "aggregator" | "towing" | string | null;
  service_code?: string | null;
  order_contract?: {
    service?: {
      category?: string | null;
      degraded?: boolean;
    } | null;
  } | null;
  service_snapshot?: {
    name?: string | null;
    service_name?: string | null;
    category?: string | null;
    service_category?: string | null;
  } | null;
  logistics_provider?: string | null;
  logistics_service_type?: string | null;
  awb_number?: string | null;
};

export type OrderServicePresentation = {
  kind: "instant" | "aggregator" | "food" | "service" | "unknown";
  label: string;
  description: string;
  firstMileLabel?: string;
  externalCarrierLabel?: string;
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function getOrderServicePresentation(order: OrderPresentationInput): OrderServicePresentation {
  const code = clean(order.service_code).toLowerCase();
  const category = clean(
    order.service_category ||
    order.order_contract?.service?.category ||
    order.service_snapshot?.service_category ||
    order.service_snapshot?.category,
  ).toLowerCase();
  const model = clean(order.model).toLowerCase();
  const provider = clean(order.logistics_provider);
  const serviceType = clean(order.logistics_service_type);
  const externalName = [provider, serviceType].filter(Boolean).join(" · ");

  if (code === "tembus_aggregator" || category === "aggregator" || model === "hub_and_spoke" || Boolean(provider)) {
    return {
      kind: "aggregator",
      label: "Ekspedisi Antar-Kota",
      description: "Hemat · ETA terjadwal · first-mile LANCAR → carrier",
      firstMileLabel: "First-mile: LANCAR",
      externalCarrierLabel: `Carrier eksternal: ${externalName || "belum ditetapkan"}${order.awb_number ? ` · AWB ${order.awb_number}` : ""}`,
    };
  }

  if (category === "food" || category === "food_delivery" || code.includes("food")) {
    return { kind: "food", label: "Food delivery", description: "Pengantaran merchant oleh LANCAR" };
  }

  if (category === "package_on_demand" || model === "p2p" || code === "tembus_instant") {
    return { kind: "instant", label: "Paket Instan", description: "Cepat · ETA berbasis rute · last-mile LANCAR" };
  }

  if (category === "tambal_ban" || category === "towing") {
    return { kind: "service", label: category === "towing" ? "Towing" : "Tambal ban", description: "Layanan bantuan kendaraan LANCAR" };
  }

  const serviceName = clean(order.service_snapshot?.service_name || order.service_snapshot?.name);
  if (serviceName) return { kind: "service", label: serviceName, description: "Layanan LANCAR" };
  return { kind: "unknown", label: "Layanan belum teridentifikasi", description: "Detail layanan belum dikirim server" };
}

export type PaymentStatePresentation = {
  label: string;
  className: string;
};

export function getPaymentStatePresentation(status?: string | null): PaymentStatePresentation {
  switch (clean(status).toLowerCase()) {
    case "paid": return { label: "Lunas", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" };
    case "failed": return { label: "Pembayaran gagal", className: "border-red-400/30 bg-red-400/10 text-red-200" };
    case "expired": return { label: "Pembayaran kedaluwarsa", className: "border-red-400/30 bg-red-400/10 text-red-200" };
    case "bypassed": return { label: "Dibebaskan sistem", className: "border-sky-400/30 bg-sky-400/10 text-sky-200" };
    case "pending":
    case "unselected":
    case "pending_payment": return { label: "Menunggu pembayaran", className: "border-amber-400/30 bg-amber-400/10 text-amber-100" };
    default: return { label: "Status pembayaran belum tersedia", className: "border-white/15 bg-white/5 text-muted-foreground" };
  }
}

export const deliveryStateLabel = (status?: string | null) => {
  const normalized = clean(status).toLowerCase();
  if (!normalized) return "Status pengiriman belum tersedia";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};
