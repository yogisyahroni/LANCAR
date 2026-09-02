export const ORDER_CONTRACT_VERSION = '2026-09-01';

export const CANONICAL_SERVICE_CATEGORIES = [
  'package_on_demand',
  'food',
  'tambal_ban',
  'aggregator',
  'towing',
] as const;

export type CanonicalServiceCategory = typeof CANONICAL_SERVICE_CATEGORIES[number];

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
  roadside?: {
    service_sub_type?: string | null;
    vehicle_details?: Record<string, unknown> | null;
  };
  aggregator?: {
    provider?: string | null;
    service_type?: string | null;
    tariff_idr?: number | null;
    net_cost_idr?: number | null;
    awb_number?: string | null;
  };
  towing?: {
    service_sub_type?: string | null;
    vehicle_details?: Record<string, unknown> | null;
  };
}

export interface CanonicalOrderContract {
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

const clean = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const objectOrNull = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

export const normalizeServiceCategory = (row: Record<string, any>): CanonicalServiceCategory | null => {
  const raw = clean(row.service_category)?.toLowerCase();
  if (raw === 'food_delivery' || raw === 'food') return 'food';
  if (raw === 'tambal_ban') return 'tambal_ban';
  if (raw === 'towing') return 'towing';
  if (raw === 'aggregator') return 'aggregator';
  if (raw === 'package_on_demand' || raw === 'on_demand' || raw === 'regular' || raw === 'network') return 'package_on_demand';

  const subtype = clean(row.service_sub_type)?.toLowerCase();
  if (subtype === 'food_delivery') return 'food';
  if (subtype?.startsWith('tambal_ban')) return 'tambal_ban';
  if (subtype?.startsWith('towing')) return 'towing';
  if (clean(row.logistics_provider) || clean(row.model)?.toLowerCase() === 'aggregator') return 'aggregator';

  // Legacy p2p/two-leg orders are known parcel orders. Unknown models remain
  // degraded instead of being assigned a made-up service category.
  if (['p2p', 'two_legs', 'three_legs', 'hub_and_spoke'].includes(clean(row.model)?.toLowerCase() || '')) {
    return 'package_on_demand';
  }
  return null;
};

export const buildOrderServiceMetadata = (
  row: Record<string, any>,
  category: CanonicalServiceCategory | null = normalizeServiceCategory(row),
): OrderServiceMetadata => {
  const persistedMetadata = objectOrNull(row.service_metadata);
  if (persistedMetadata && Object.keys(persistedMetadata).length > 0) {
    return persistedMetadata as OrderServiceMetadata;
  }
  const packageDetails = objectOrNull(row.package_details) || {};
  const dimensions = objectOrNull(packageDetails.dimensions) || {};
  const vehicleDetails = objectOrNull(packageDetails.vehicle_details);
  const metadata: OrderServiceMetadata = {};

  if (category === 'package_on_demand') {
    metadata.parcel = {
      category: clean(packageDetails.category || packageDetails.item_category),
      item_description: clean(packageDetails.item_description || row.item_description),
      item_image_url: clean(row.item_image_url),
      dimensions: {
        length_cm: numberOrNull(packageDetails.length_cm ?? dimensions.length),
        width_cm: numberOrNull(packageDetails.width_cm ?? dimensions.width),
        height_cm: numberOrNull(packageDetails.height_cm ?? dimensions.height),
      },
      weight_kg: numberOrNull(packageDetails.weight_kg ?? row.weight),
      package_count: numberOrNull(packageDetails.package_count),
    };
  }

  if (category === 'food') {
    const items = Array.isArray(row.food_items) ? row.food_items : null;
    metadata.food = {
      merchant_id: clean(row.merchant_id),
      merchant_name: clean(row.merchant_name),
      item_count: items ? items.length : null,
      prep_time_minutes: numberOrNull(row.prep_time_minutes),
      contactless: typeof row.contactless === 'boolean' ? row.contactless : null,
    };
  }

  if (category === 'tambal_ban' || category === 'towing') {
    metadata.roadside = {
      service_sub_type: clean(row.service_sub_type),
      vehicle_details: vehicleDetails,
    };
  }

  if (category === 'towing') {
    metadata.towing = {
      service_sub_type: clean(row.service_sub_type),
      vehicle_details: vehicleDetails,
    };
  }

  if (category === 'aggregator') {
    metadata.aggregator = {
      provider: clean(row.logistics_provider),
      service_type: clean(row.logistics_service_type),
      tariff_idr: numberOrNull(row.logistics_tariff_idr),
      net_cost_idr: numberOrNull(row.logistics_net_cost_idr),
      awb_number: clean(row.awb_number),
    };
  }
  return metadata;
};

export const toCanonicalOrderContract = (row: Record<string, any>): CanonicalOrderContract => {
  const category = normalizeServiceCategory(row);
  const stateVersion = Math.max(1, Math.trunc(numberOrNull(row.state_version) || 1));
  const contract: CanonicalOrderContract = {
    contract_version: clean(row.contract_version) || ORDER_CONTRACT_VERSION,
    id: clean(row.id) || '',
    customer: { id: clean(row.customer_id) },
    service: {
      category,
      service_code: clean(row.service_code),
      service_sub_type: clean(row.service_sub_type),
      metadata: buildOrderServiceMetadata(row, category),
      degraded: category === null || (category !== 'package_on_demand' && !clean(row.service_sub_type) && !clean(row.service_code)),
    },
    order_state: { status: clean(row.status), state_version: stateVersion },
    money_state: {
      currency: 'IDR',
      total_price_idr: numberOrNull(row.total_price_idr ?? row.total_amount),
      payment_status: clean(row.payment_status) || 'unrecorded',
    },
    timestamps: {
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    },
    actor_ownership: {
      customer_id: clean(row.customer_id),
      merchant_id: clean(row.merchant_id),
      courier_id: clean(row.courier_id),
    },
    quote_id: clean(row.quote_id),
    correlation_id: clean(row.correlation_id),
  };
  return contract;
};

/** Adds canonical fields while preserving the legacy flat response contract. */
export const withCanonicalOrderContract = <T extends Record<string, any>>(row: T): T & {
  service_category: CanonicalServiceCategory | null;
  contract_version: string;
  state_version: number;
  order_contract: CanonicalOrderContract;
  service_metadata: OrderServiceMetadata;
} => {
  const orderContract = toCanonicalOrderContract(row);
  return {
    ...row,
    service_category: orderContract.service.category,
    contract_version: orderContract.contract_version,
    state_version: orderContract.order_state.state_version,
    order_contract: orderContract,
    service_metadata: orderContract.service.metadata,
  };
};
