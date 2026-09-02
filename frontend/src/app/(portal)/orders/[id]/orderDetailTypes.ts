export interface Event {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
}

export interface CarrierEvent {
  id: string;
  provider: string;
  awb_number: string;
  canonical_status: string;
  provider_status?: string | null;
  provider_status_code?: string | null;
  provider_status_description?: string | null;
  provider_location?: string | null;
  provider_timestamp?: string | null;
  occurred_at?: string | null;
  received_at: string;
}

export type CanonicalServiceCategory = 'package_on_demand' | 'food' | 'tambal_ban' | 'aggregator' | 'towing';

export interface OrderServiceMetadata {
  parcel?: {
    category?: string | null;
    item_description?: string | null;
    item_image_url?: string | null;
    dimensions?: { length_cm?: number | null; width_cm?: number | null; height_cm?: number | null } | null;
    weight_kg?: number | null;
    package_count?: number | null;
  };
  food?: {
    merchant_id?: string | null;
    merchant_name?: string | null;
    item_count?: number | null;
    prep_time_minutes?: number | null;
    contactless?: boolean | null;
  };
  roadside?: { service_sub_type?: string | null; vehicle_details?: Record<string, unknown> | null };
  aggregator?: {
    provider?: string | null;
    service_type?: string | null;
    tariff_idr?: number | null;
    net_cost_idr?: number | null;
    awb_number?: string | null;
  };
  towing?: { service_sub_type?: string | null; vehicle_details?: Record<string, unknown> | null };
}

export interface OrderContract {
  contract_version: string;
  id: string;
  customer: { id: string | null };
  service: {
    category: CanonicalServiceCategory | null;
    service_code: string | null;
    service_sub_type: string | null;
    metadata: OrderServiceMetadata;
    degraded: boolean;
  };
  order_state: { status: string | null; state_version: number };
  money_state: { currency: 'IDR'; total_price_idr: number | null; payment_status: string | null };
  timestamps: { created_at: string | null; updated_at: string | null };
  actor_ownership: { customer_id: string | null; merchant_id: string | null; courier_id: string | null };
  quote_id: string | null;
  correlation_id: string | null;
}

export interface Order {
  id: string;
  order_number: string;
  pickup_address: string;
  dropoff_address: string;
  recipient_name: string;
  recipient_phone_masked: string;
  model: string;
  customer_id?: string | null;
  contract_version?: string;
  service_category?: CanonicalServiceCategory | null;
  service_code?: string | null;
  state_version?: number;
  quote_id?: string | null;
  correlation_id?: string | null;
  service_metadata?: OrderServiceMetadata;
  order_contract?: OrderContract;
  service_snapshot?: {
    name?: string | null;
    service_name?: string | null;
    category?: string | null;
    service_category?: string | null;
  } | null;
  status: string;
  payment_status?: string | null;
  distance_km: number;
  base_price_idr: number;
  volumetric_surcharge_idr: number;
  insurance_premium_idr: number;
  total_price_idr: number;
  has_insurance: boolean;
  insured_value_idr: number;
  package_details: any;
  customer_notes: string;
  schedule_type: string;
  scheduled_at: string;
  created_at: string;
  courier_name?: string;
  courier_vehicle?: string;
  courier_plate?: string;
  courier_rating?: number;
  route_snapshot?: RouteSnapshot | null;
  route_provider?: string | null;
  route_profile?: string | null;
  route_polyline?: string | null;
  route_distance_meters?: number | null;
  route_duration_seconds?: number | null;
  service_sub_type?: string | null;
  tambal_ban_report?: TambalBanReport | null;
  towing_report?: TowingReport | null;
  food_items?: FoodOrderItem[];
  logistics_provider?: string | null;
  logistics_service_type?: string | null;
  logistics_tariff_idr?: number | null;
  logistics_net_cost_idr?: number | null;
  pickup_city?: string | null;
  dropoff_city?: string | null;
}

export interface FoodOrderItemVariantSnapshot {
  variant_name?: string | null;
  option_name?: string | null;
  price_delta?: number | string | null;
}

export interface FoodOrderItem {
  name?: string | null;
  item_name?: string | null;
  quantity?: number | string | null;
  notes?: string | null;
  price?: number | string | null;
  item_price?: number | string | null;
  subtotal?: number | string | null;
  variants?: FoodOrderItemVariantSnapshot[];
}

export interface TambalBanReport {
  tire_condition_before?: string | null;
  tire_photo_before_url?: string | null;
  tire_condition_after?: string | null;
  tire_photo_after_url?: string | null;
  materials_used?: string | null;
  notes?: string | null;
  completed_at?: string | null;
}

export interface TowingReport {
  vehicle_condition_before?: string | null;
  vehicle_photo_before_url?: string | null;
  loading_photo_url?: string | null;
  unloading_photo_url?: string | null;
  completion_photo_url?: string | null;
  signature_url?: string | null;
  odometer_reading?: number | null;
  odometer_after?: number | null;
  notes?: string | null;
  completed_at?: string | null;
}

export interface RouteSnapshot {
  generated_at?: string;
  provider?: string;
  requested_provider?: string;
  active_provider?: string;
  scope?: string;
  route_profile?: string;
  vehicle_type?: string;
  service_code?: string;
  distance_km?: number;
  distance_meters?: number;
  duration_seconds?: number;
  eta?: string;
  eta_minutes?: number;
  route_polyline?: string;
  traffic_aware?: boolean;
  confidence?: string;
  fallback_reason?: string | null;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  message_type: string;
  created_at: string;
  order_id?: string;
}

let clientMessageFallbackCounter = 0;

const createClientMessageId = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const entropy = new Uint32Array(2);
    window.crypto.getRandomValues(entropy);
    return `web-${Date.now()}-${entropy[0].toString(36)}${entropy[1].toString(36)}`;
  }
  clientMessageFallbackCounter += 1;
  return `web-${Date.now()}-${clientMessageFallbackCounter}`;
};

export interface TrackingData {
  courier_id: string;
  location?: {
    latitude: number;
    longitude: number;
    heading?: number;
    timestamp?: string;
  };
  eta?: string;
  eta_minutes?: number;
  eta_source?: string | null;
  location_stale?: boolean;
  location_age_seconds?: number | null;
  location_stale_reason?: 'location_unavailable' | 'timestamp_invalid' | 'location_expired' | string | null;
  quality?: {
    source?: string;
    customer_visible?: boolean;
    is_stale?: boolean;
    age_seconds?: number | null;
    stale_reason?: string | null;
  };
  route_provider?: string;
  route_polyline?: string;
  order_route_snapshot?: RouteSnapshot | null;
  order_route_provider?: string | null;
  order_route_profile?: string | null;
  order_route_polyline?: string | null;
  order_route_distance_meters?: number | null;
  order_route_duration_seconds?: number | null;
  order_route_snapshot_hash?: string | null;
  order_route_version?: string | null;
}

export interface TrackingProof {
  id: string;
  scan_type?: string | null;
  proof_label?: string | null;
  proof_category?: 'pickup' | 'pod' | 'cancellation' | 'operational' | string | null;
  photo_url?: string | null;
  image_urls?: string[] | null;
  override_reason?: string | null;
  reason_code?: string | null;
  reason_note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  recorded_at?: string | null;
}

export interface OnDemandRealtimePayload {
  event: string;
  order_id: string;
  status?: string;
  stage?: string;
  location?: TrackingData['location'];
  chat?: ChatMessage;
}
