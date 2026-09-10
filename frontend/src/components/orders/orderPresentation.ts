import { AlertCircle, CheckCircle2, CircleHelp, Clock, Truck, XCircle, type LucideIcon } from "lucide-react";
import type { MessageKey } from '@/i18n/messages';

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

  if (
    code === "tembus_aggregator" ||
    category === "aggregator" ||
    model === "hub_and_spoke" ||
    (!category && Boolean(provider))
  ) {
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
  labelKey: MessageKey;
  className: string;
  icon: LucideIcon;
};

export function getPaymentStatePresentation(status?: string | null): PaymentStatePresentation {
  switch (clean(status).toLowerCase()) {
    case "paid": return { label: "Lunas", labelKey: "order.paymentPaid", className: "border-success bg-success-surface text-success", icon: CheckCircle2 };
    case "failed": return { label: "Pembayaran gagal", labelKey: "order.paymentFailed", className: "border-error bg-error-surface text-error", icon: XCircle };
    case "expired": return { label: "Pembayaran kedaluwarsa", labelKey: "order.paymentExpired", className: "border-error bg-error-surface text-error", icon: XCircle };
    case "bypassed": return { label: "Dibebaskan sistem", labelKey: "order.paymentBypassed", className: "border-info bg-info-surface text-info", icon: AlertCircle };
    case "pending":
    case "unselected":
    case "pending_payment": return { label: "Menunggu pembayaran", labelKey: "order.paymentPending", className: "border-warning bg-warning-surface text-warning", icon: Clock };
    default: return { label: "Status pembayaran belum tersedia", labelKey: "order.paymentUnknown", className: "border-border bg-surface-subtle text-muted-foreground", icon: CircleHelp };
  }
}

export type OrderStatusPresentation = {
  label: string;
  className: string;
  icon: LucideIcon;
};

export function getOrderStatusPresentation(status?: string | null): OrderStatusPresentation {
  const normalized = clean(status).toLowerCase();
  switch (normalized) {
    case "created": return { label: "Dibuat", className: "border-warning bg-warning-surface text-warning", icon: Clock };
    case "pending": return { label: "Menunggu diproses", className: "border-warning bg-warning-surface text-warning", icon: Clock };
    case "pending_payment": return { label: "Menunggu pembayaran", className: "border-warning bg-warning-surface text-warning", icon: Clock };
    case "picked_up": return { label: "Sudah dijemput", className: "border-info bg-info-surface text-info", icon: Truck };
    case "in_transit": return { label: "Dalam perjalanan", className: "border-info bg-info-surface text-info", icon: Truck };
    case "delivering":
    case "out_for_delivery": return { label: "Sedang diantar", className: "border-info bg-info-surface text-info", icon: Truck };
    case "completed":
    case "delivered":
    case "pod_completed": return { label: "Selesai", className: "border-success bg-success-surface text-success", icon: CheckCircle2 };
    case "cancelled":
    case "canceled": return { label: "Dibatalkan", className: "border-error bg-error-surface text-error", icon: XCircle };
    case "payment_failed":
    case "failed": return { label: "Gagal", className: "border-error bg-error-surface text-error", icon: XCircle };
    case "expired": return { label: "Kedaluwarsa", className: "border-error bg-error-surface text-error", icon: XCircle };
    case "no_courier_found": return { label: "Kurir belum ditemukan", className: "border-accent bg-accent-surface text-accent", icon: AlertCircle };
    default: return {
      label: normalized ? normalized.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Status belum tersedia",
      className: "border-border bg-surface-subtle text-foreground-muted",
      icon: CircleHelp,
    };
  }
}

export const deliveryStateLabel = (status?: string | null) => {
  const normalized = clean(status).toLowerCase();
  if (!normalized) return "Status pengiriman belum tersedia";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export function deliveryStateKey(status?: string | null): MessageKey | null {
  switch (clean(status).toLowerCase()) {
    case 'out_for_delivery': return 'order.deliveryOutForDelivery';
    case 'delivered': return 'order.deliveryDelivered';
    case 'cancelled':
    case 'canceled': return 'order.deliveryCancelled';
    default: return clean(status) ? null : 'order.deliveryUnknown';
  }
}
