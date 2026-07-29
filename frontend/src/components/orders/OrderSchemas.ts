import * as z from "zod";
import { RuntimeConfig } from "@/hooks/useRuntimeConfig";

export const coordinateSchema = z.object({
  lat: z.number(),
  lng: z.number()
});

export const CUSTOMER_ORDER_DRAFT_KEY = "tembus_customer_order_draft_v2";
export const LEGACY_CUSTOMER_ORDER_DRAFT_KEY = "tembus_customer_order_draft_v1";
export const CUSTOMER_ORDER_DRAFT_TTL_MS = 60 * 60 * 1000;
export const RECEIVER_LOCATION_STORAGE_KEY = "tembus_receiver_location_submitted_v1";
export const RECEIVER_LOCATION_POLL_MS = 4000;

export const clearCustomerOrderDraft = () => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CUSTOMER_ORDER_DRAFT_KEY);
  window.sessionStorage.removeItem(LEGACY_CUSTOMER_ORDER_DRAFT_KEY);
};

export const createOrderSchema = (config?: RuntimeConfig | null, mode: 'instan' | 'ekspedisi' = 'instan') => z.object({
  service_code: z.string().min(1, "Pilih layanan pengiriman"),
  size_tier: z.string().optional(),
  pickup_address: z.string().min(5, "Alamat pickup minimal 5 karakter"),
  pickup_location: coordinateSchema.optional(),
  dropoff_address: z.string().min(5, "Alamat tujuan minimal 5 karakter"),
  dropoff_location: coordinateSchema.optional(),
  recipient_name: z.string().min(3, "Nama penerima wajib diisi"),
  recipient_phone: z.string().regex(/^(08|628|\+628)[0-9]{8,11}$/, "Nomor HP tidak valid"),
  package_details: z.object({
    category: z.string().min(1, "Pilih kategori paket"),
    item_description: z.string().min(5, "Deskripsi barang minimal 5 karakter"),
    vehicle_type: z.enum(["Motor", "Mobil", "Truk"]).default("Motor"),
    weight_kg: z.preprocess(
      (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
      z.number({ message: "Berat wajib diisi" }).min(0.1, "Berat minimal 0.1 kg")
    ),
    dimensions: z.object({
      length: z.preprocess(
        (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
        z.number({ message: "Panjang harus berupa angka" }).min(1, "Panjang minimal 1 cm").optional()
      ),
      width: z.preprocess(
        (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
        z.number({ message: "Lebar harus berupa angka" }).min(1, "Lebar minimal 1 cm").optional()
      ),
      height: z.preprocess(
        (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
        z.number({ message: "Tinggi harus berupa angka" }).min(1, "Tinggi minimal 1 cm").optional()
      ),
    }),
    dimensions_scanned: z.boolean().default(false)
  }),
  has_insurance: z.boolean().default(false),
  item_value: z.preprocess(
    (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
    z.number({ message: "Nilai barang harus berupa angka" })
      .min(config?.insurance_min_premium || 1000, `Nilai barang minimal Rp ${(config?.insurance_min_premium || 1000).toLocaleString("id-ID")}`)
      .optional()
  ).optional(),
  schedule_type: z.enum(["now", "scheduled"]).default("now"),
  scheduled_at: z.string().optional(),
  customer_notes: z.string().max(200).optional(),

  // Aggregator logistics fields (optional — only for 3PL/network parcel flow)
  logistics_provider: z.string().optional(),
  logistics_service_type: z.string().optional(),
  logistics_tariff_idr: z.number().optional(),
  logistics_net_cost_idr: z.number().optional(),
  pickup_city: z.string().optional(),
  dropoff_city: z.string().optional(),
}).superRefine((data, ctx) => {
  if (mode === 'instan') {
    if (!data.pickup_location) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pickup_location"],
        message: "Pilih titik pickup dari hasil pencarian, lokasi saat ini, atau Buku Alamat"
      });
    }
    if (!data.dropoff_location) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dropoff_location"],
        message: "Pilih titik tujuan dari hasil pencarian, lokasi saat ini, atau Buku Alamat"
      });
    }
  }
  if (data.has_insurance && !data.item_value) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["item_value"],
      message: "Nilai barang wajib diisi jika asuransi aktif"
    });
  }
  if (data.schedule_type === "scheduled" && !data.scheduled_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduled_at"],
      message: "Pilih jadwal pengiriman"
    });
  }
});

const defaultSchema = createOrderSchema();
export type OrderFormValues = z.infer<typeof defaultSchema>;

export type LocationValue = { lat: number; lng: number };
export type AddressMode = "pickup" | "dropoff";

export interface SavedAddress {
  id: string;
  label: string;
  contact_name?: string;
  contact_phone_masked?: string;
  address: string;
  lat: number;
  lng: number;
  kind?: "pickup" | "receiver" | "both";
  is_favorite?: boolean;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
  source: "tomtom" | "osm" | "saved";
  recipient_name?: string;
  phone?: string;
}

export interface ReceiverLocationLink {
  id: string;
  status: "pending" | "submitted" | "expired" | string;
  pickup_address: string;
  recipient_name?: string | null;
  submitted_address?: string | null;
  submitted_contact_name?: string | null;
  submitted_contact_phone_masked?: string | null;
  submitted_notes?: string | null;
  submitted_lat?: number | null;
  submitted_lng?: number | null;
  submitted_at?: string | null;
  expires_at: string;
  created_at: string;
  url?: string;
  token?: string;
}

export interface CustomerOrderDraftPayload {
  version: 2;
  saved_at: string;
  expires_at: string;
  form: Partial<OrderFormValues>;
  receiver_location_link?: Partial<ReceiverLocationLink> | null;
}

export interface OrderFormProps {
  mode?: 'instan' | 'ekspedisi';
  onFormChange: (data: Partial<OrderFormValues>, isValid: boolean, context?: { selectedService?: DeliveryService; scanRequired: boolean }) => void;
  onSubmit: (data: OrderFormValues) => void;
}

export interface DeliveryService {
  code: string;
  name: string;
  description: string;
  service_family: string;
  service_category: string;
  route_model: "p2p";
  vehicle_types: string[];
  exclusive_driver: boolean;
  batching_allowed: boolean;
  max_eta_minutes: number;
  max_distance_km?: number | null;
  max_weight_kg?: number | null;
  uses_size_tier: boolean;
  requires_dimension_scan: boolean;
  metadata?: Record<string, any>;
  size_tiers: Array<{
    code: string;
    name: string;
    description?: string;
    max_weight_kg?: number;
  }>;
}

export const isLocationValue = (value: unknown): value is LocationValue => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.lat === "number" && Number.isFinite(record.lat) &&
    typeof record.lng === "number" && Number.isFinite(record.lng);
};

export const asTrimmedString = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

export const asFiniteNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
};

export const buildSafeOrderDraftForm = (values: OrderFormValues): Partial<OrderFormValues> => {
  const safePackageDetails: Partial<OrderFormValues["package_details"]> = {};
  const category = asTrimmedString(values.package_details?.category, 80);
  const vehicle_type = values.package_details?.vehicle_type as any;
  const weightKg = asFiniteNumber(values.package_details?.weight_kg);
  const length = asFiniteNumber(values.package_details?.dimensions?.length);
  const width = asFiniteNumber(values.package_details?.dimensions?.width);
  const height = asFiniteNumber(values.package_details?.dimensions?.height);

  if (category) safePackageDetails.category = category;
  if (vehicle_type) safePackageDetails.vehicle_type = vehicle_type;
  if (weightKg !== undefined) safePackageDetails.weight_kg = weightKg;
  safePackageDetails.dimensions_scanned = Boolean(values.package_details?.dimensions_scanned);
  if (length !== undefined || width !== undefined || height !== undefined) {
    safePackageDetails.dimensions = {
      length: length as any,
      width: width as any,
      height: height as any
    };
  }

  const draft: Partial<OrderFormValues> = {
    schedule_type: values.schedule_type === "scheduled" ? "scheduled" : "now",
    has_insurance: Boolean(values.has_insurance),
    package_details: safePackageDetails as OrderFormValues["package_details"]
  };

  const serviceCode = asTrimmedString(values.service_code, 80);
  const sizeTier = asTrimmedString(values.size_tier, 80);
  const pickupAddress = asTrimmedString(values.pickup_address, 500);
  const dropoffAddress = asTrimmedString(values.dropoff_address, 500);
  const recipientName = asTrimmedString(values.recipient_name, 120);
  const recipientPhone = asTrimmedString(values.recipient_phone, 32);
  const scheduledAt = asTrimmedString(values.scheduled_at, 40);
  const customerNotes = asTrimmedString(values.customer_notes, 200);
  const itemValue = asFiniteNumber(values.item_value);

  if (serviceCode) draft.service_code = serviceCode;
  if (sizeTier) draft.size_tier = sizeTier;
  if (pickupAddress) draft.pickup_address = pickupAddress;
  if (dropoffAddress) draft.dropoff_address = dropoffAddress;
  if (recipientName) draft.recipient_name = recipientName;
  if (recipientPhone) draft.recipient_phone = recipientPhone;
  if (scheduledAt) draft.scheduled_at = scheduledAt;
  if (customerNotes) draft.customer_notes = customerNotes;
  if (itemValue !== undefined) draft.item_value = itemValue;
  if (isLocationValue(values.pickup_location)) draft.pickup_location = values.pickup_location;
  if (isLocationValue(values.dropoff_location)) draft.dropoff_location = values.dropoff_location;

  return draft;
};

export const buildSafeReceiverLocationDraft = (link: ReceiverLocationLink | null) => {
  if (!link?.id) return null;
  return {
    id: link.id,
    status: link.status,
    expires_at: link.expires_at,
    created_at: link.created_at,
    url: link.url
  };
};

export const parseCustomerOrderDraft = (rawDraft: string | null): CustomerOrderDraftPayload | null => {
  if (!rawDraft) return null;

  const parsedDraft = JSON.parse(rawDraft) as Partial<CustomerOrderDraftPayload>;
  if (parsedDraft?.version !== 2) return null;
  if (!parsedDraft.form || typeof parsedDraft.form !== "object") return null;
  if (!parsedDraft.expires_at || Date.parse(parsedDraft.expires_at) <= Date.now()) return null;

  return parsedDraft as CustomerOrderDraftPayload;
};

export const mergeDraftWithCurrentValues = (
  currentValues: OrderFormValues,
  draftValues: Partial<OrderFormValues>
): OrderFormValues => ({
  ...currentValues,
  ...draftValues,
  pickup_location: isLocationValue(draftValues.pickup_location) ? draftValues.pickup_location : currentValues.pickup_location,
  dropoff_location: isLocationValue(draftValues.dropoff_location) ? draftValues.dropoff_location : currentValues.dropoff_location,
  package_details: {
    ...currentValues.package_details,
    ...(draftValues.package_details || {}),
    dimensions: {
      ...currentValues.package_details.dimensions,
      ...(draftValues.package_details?.dimensions || {})
    }
  }
});
