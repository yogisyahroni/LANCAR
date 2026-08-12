import { Request, Response } from 'express';
import { db } from '../db';

const numericFields = [
  'max_distance_km',
  'max_weight_kg',
  'max_pickup_detour_km',
  'max_delivery_detour_km',
  'assignment_radius_pickup_km',
  'assignment_radius_delivery_km',
  'included_distance_km',
  'service_multiplier',
  'platform_commission_percent',
  'courier_payout_percent',
  'mdr_percent',
  'ppn_percent',
  'platform_fee_pct'
];

export type DeliveryServiceProduct = {
  id?: string;
  code: string;
  name: string;
  description: string;
  service_family: string;
  service_category: string;
  route_model: 'p2p';
  is_enabled: boolean;
  display_order: number;
  vehicle_types: string[];
  exclusive_driver: boolean;
  batching_allowed: boolean;
  max_packages_per_order: number;
  max_active_orders_regular: number;
  max_active_orders_on_demand: number;
  same_customer_batching_required: boolean;
  allow_new_offer_while_pickup: boolean;
  allow_new_offer_while_delivery: boolean;
  max_pickup_detour_km: number;
  max_delivery_detour_km: number;
  max_direction_deviation_degrees: number;
  assignment_radius_pickup_km: number;
  assignment_radius_delivery_km: number;
  traffic_aware_assignment: boolean;
  proof_geofence_radius_m: number;
  proof_min_accuracy_m: number;
  proof_gps_override_policy: Record<string, any>;
  face_verification_required: boolean;
  regular_max_reschedule_attempts: number;
  failed_delivery_policy: 'must_deliver' | 'reschedule_then_return' | 'admin_review';
  pod_label: string;
  max_eta_minutes: number;
  max_distance_km: number | null;
  max_weight_kg: number | null;
  uses_size_tier: boolean;
  requires_dimension_scan: boolean;
  allows_manual_dimension: boolean;
  requires_pickup_verification: boolean;
  price_mode: 'final' | 'estimated_then_adjusted' | 'quote';
  base_fare_idr: number;
  included_distance_km: number;
  per_km_idr: number;
  service_multiplier: number;
  platform_commission_percent: number;
  courier_payout_percent: number;
  courier_min_payout_idr: number;
  mdr_percent: number;
  ppn_percent: number;
  platform_fee_idr: number;
  platform_fee_pct: number;
  extra_dropoff_fee_idr: number;
  show_customer_price_to_courier: boolean;
  search_radii_km: number[];
  size_tiers: any[];
  dimension_rules: Record<string, any>;
  availability_rules: Record<string, any>;
  metadata: Record<string, any>;
};

const normalizeService = (row: any): DeliveryServiceProduct => {
  const service = { ...row };
  for (const field of numericFields) {
    if (service[field] !== null && service[field] !== undefined) {
      service[field] = Number(service[field]);
    }
  }

  service.base_fare_idr = Number(service.base_fare_idr || 0);
  service.per_km_idr = Number(service.per_km_idr || 0);
  service.courier_min_payout_idr = Number(service.courier_min_payout_idr || 0);
  service.platform_fee_idr = Number(service.platform_fee_idr || 0);
  service.extra_dropoff_fee_idr = Number(service.extra_dropoff_fee_idr || 0);
  service.display_order = Number(service.display_order || 0);
  service.max_eta_minutes = Number(service.max_eta_minutes || 0);
  service.max_packages_per_order = Number(service.max_packages_per_order || 1);
  service.max_active_orders_regular = Number(service.max_active_orders_regular || 3);
  service.max_active_orders_on_demand = Number(service.max_active_orders_on_demand || 1);
  service.max_direction_deviation_degrees = Number(service.max_direction_deviation_degrees || 45);
  service.proof_geofence_radius_m = Number(service.proof_geofence_radius_m || 10);
  service.proof_min_accuracy_m = Number(service.proof_min_accuracy_m || 50);
  service.regular_max_reschedule_attempts = Number(service.regular_max_reschedule_attempts || 3);
  service.size_tiers = Array.isArray(service.size_tiers) ? service.size_tiers : [];
  service.dimension_rules = service.dimension_rules || {};
  service.availability_rules = service.availability_rules || {};
  service.metadata = service.metadata || {};
  service.proof_gps_override_policy = service.proof_gps_override_policy || {};
  service.vehicle_types = Array.isArray(service.vehicle_types) ? service.vehicle_types : [];
  service.service_category = service.service_category || 'on_demand';
  service.service_family = service.service_family || 'regular';
  service.failed_delivery_policy = service.failed_delivery_policy || (service.service_category === 'regular' ? 'reschedule_then_return' : 'must_deliver');
  service.pod_label = service.pod_label || 'POD';
  service.search_radii_km = Array.isArray(service.search_radii_km) ? service.search_radii_km.map(Number) : [3, 5, 10];

  return service;
};

const lookupVersion = (rows: any[]): string | null => {
  const latest = rows.reduce((max, row) => {
    const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    return Math.max(max, updatedAt);
  }, 0);
  return latest > 0 ? new Date(latest).toISOString() : null;
};

const writeDeliveryServiceAudit = async (
  actorId: string | undefined,
  action: string,
  payload: Record<string, unknown>
) => {
  if (!actorId) {
    throw new Error('Authenticated admin actor is required for delivery service changes');
  }
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1, $2, NULL, $3)`,
    [actorId, action, JSON.stringify(payload)]
  );
};

const normalizeRouteModel = (value: unknown): 'p2p' => {
  const routeModel = String(value || 'p2p').trim().toLowerCase();
  if (routeModel !== 'p2p') {
    const error = new Error('Only p2p route_model is supported for new delivery services');
    (error as any).statusCode = 400;
    throw error;
  }
  return 'p2p';
};

const positiveInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const nonNegativeNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const normalizeFailedDeliveryPolicy = (value: unknown, serviceCategory: string): DeliveryServiceProduct['failed_delivery_policy'] => {
  const policy = String(value || '').trim().toLowerCase();
  if (policy === 'reschedule_then_return' || policy === 'admin_review' || policy === 'must_deliver') {
    return policy;
  }
  return serviceCategory === 'regular' ? 'reschedule_then_return' : 'must_deliver';
};

export const customerFacingService = (service: DeliveryServiceProduct) => ({
  code: service.code,
  name: service.name,
  description: service.description,
  service_family: service.service_family,
  service_category: service.service_category,
  route_model: service.route_model,
  is_enabled: service.is_enabled,
  display_order: service.display_order,
  vehicle_types: service.vehicle_types,
  exclusive_driver: service.exclusive_driver,
  batching_allowed: service.batching_allowed,
  max_packages_per_order: service.max_packages_per_order,
  max_active_orders_regular: service.max_active_orders_regular,
  max_active_orders_on_demand: service.max_active_orders_on_demand,
  same_customer_batching_required: service.same_customer_batching_required,
  allow_new_offer_while_pickup: service.allow_new_offer_while_pickup,
  allow_new_offer_while_delivery: service.allow_new_offer_while_delivery,
  max_pickup_detour_km: service.max_pickup_detour_km,
  max_delivery_detour_km: service.max_delivery_detour_km,
  max_direction_deviation_degrees: service.max_direction_deviation_degrees,
  assignment_radius_pickup_km: service.assignment_radius_pickup_km,
  assignment_radius_delivery_km: service.assignment_radius_delivery_km,
  traffic_aware_assignment: service.traffic_aware_assignment,
  proof_geofence_radius_m: service.proof_geofence_radius_m,
  proof_min_accuracy_m: service.proof_min_accuracy_m,
  proof_gps_override_policy: service.proof_gps_override_policy,
  face_verification_required: service.face_verification_required,
  regular_max_reschedule_attempts: service.regular_max_reschedule_attempts,
  failed_delivery_policy: service.failed_delivery_policy,
  pod_label: service.pod_label,
  max_eta_minutes: service.max_eta_minutes,
  max_distance_km: service.max_distance_km,
  max_weight_kg: service.max_weight_kg,
  uses_size_tier: service.uses_size_tier,
  requires_dimension_scan: service.requires_dimension_scan,
  allows_manual_dimension: service.allows_manual_dimension,
  requires_pickup_verification: service.requires_pickup_verification,
  price_mode: service.price_mode,
  base_fare_idr: service.base_fare_idr,
  included_distance_km: service.included_distance_km,
  per_km_idr: service.per_km_idr,
  service_multiplier: service.service_multiplier,
  size_tiers: service.size_tiers,
  dimension_rules: service.dimension_rules,
  availability_rules: service.availability_rules,
  metadata: service.metadata
});

export const calculateServiceSettlement = (
  service: DeliveryServiceProduct,
  totalPriceIdr: number,
  insuranceReserveIdr = 0
) => {
  const mdr = Math.ceil(totalPriceIdr * (service.mdr_percent / 100));
  const ppn = Math.ceil(totalPriceIdr * (service.ppn_percent / 100));
  const operationalPool = Math.max(0, totalPriceIdr - mdr - ppn - insuranceReserveIdr);
  const desiredPlatformCommission = Math.ceil(operationalPool * (service.platform_commission_percent / 100));
  const minimumCourierByPercent = Math.ceil(operationalPool * (service.courier_payout_percent / 100));
  const payoutAfterPlatformCut = Math.max(0, operationalPool - desiredPlatformCommission);
  const courierPayout = Math.max(
    service.courier_min_payout_idr,
    minimumCourierByPercent,
    payoutAfterPlatformCut
  );
  const platformCommission = Math.max(0, operationalPool - courierPayout);

  return {
    mdr_idr: mdr,
    ppn_idr: ppn,
    insurance_reserve_idr: insuranceReserveIdr,
    net_operational_idr: operationalPool,
    courier_payout_estimate_idr: courierPayout,
    platform_commission_idr: platformCommission,
    settlement_snapshot: {
      service_code: service.code,
      service_name: service.name,
      platform_commission_percent: service.platform_commission_percent,
      courier_payout_percent: service.courier_payout_percent,
      courier_min_payout_idr: service.courier_min_payout_idr,
      mdr_percent: service.mdr_percent,
      ppn_percent: service.ppn_percent,
      show_customer_price_to_courier: service.show_customer_price_to_courier
    }
  };
};

export const findDeliveryServiceByCode = async (
  code?: string,
  options: { includeDisabled?: boolean } = {}
): Promise<DeliveryServiceProduct | null> => {
  const serviceCode = code || 'tembus_instant';
  const { rows } = await db.query(
    `SELECT *
     FROM delivery_service_products
     WHERE code = $1
       AND route_model = 'p2p'
       ${options.includeDisabled ? '' : 'AND is_enabled = TRUE'}
     LIMIT 1`,
    [serviceCode]
  );

  return rows[0] ? normalizeService(rows[0]) : null;
};

export const listEnabledDeliveryServicesForCustomer = async (): Promise<DeliveryServiceProduct[]> => {
  const { rows } = await db.query(
    `SELECT *
     FROM delivery_service_products
     WHERE is_enabled = TRUE
       AND (route_model = 'p2p' AND service_category IN ('on_demand', 'regular', 'food_delivery')
        OR service_category = 'aggregator')
     ORDER BY display_order ASC, name ASC`
  );

  return rows.map(normalizeService);
};

export const listCustomerDeliveryServices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const services = await listEnabledDeliveryServicesForCustomer();
    res.json({
      success: true,
      services: services.map(customerFacingService),
      cache_ttl_seconds: 300,
      version: lookupVersion(services)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const listAdminDeliveryServices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await db.query(
      `SELECT *
       FROM delivery_service_products
       ORDER BY display_order ASC, name ASC`
    );

    res.json({
      success: true,
      services: rows.map(normalizeService),
      cache_ttl_seconds: 300,
      version: lookupVersion(rows)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

const servicePayload = (body: any) => ({
  code: String(body.code || '').trim(),
  name: String(body.name || '').trim(),
  description: String(body.description || '').trim(),
  service_family: body.service_family || 'regular',
  service_category: body.service_category || 'on_demand',
  route_model: normalizeRouteModel(body.route_model),
  is_enabled: Boolean(body.is_enabled),
  display_order: Number(body.display_order || 100),
  vehicle_types: Array.isArray(body.vehicle_types) ? body.vehicle_types : ['motor'],
  exclusive_driver: Boolean(body.exclusive_driver),
  batching_allowed: Boolean(body.batching_allowed),
  max_packages_per_order: positiveInt(body.max_packages_per_order, body.batching_allowed ? 2 : 1, 1, 100),
  max_active_orders_regular: positiveInt(body.max_active_orders_regular, 3, 1, 50),
  max_active_orders_on_demand: positiveInt(body.max_active_orders_on_demand, body.batching_allowed ? 2 : 1, 1, 20),
  same_customer_batching_required: body.same_customer_batching_required !== false,
  allow_new_offer_while_pickup: Boolean(body.allow_new_offer_while_pickup),
  allow_new_offer_while_delivery: Boolean(body.allow_new_offer_while_delivery),
  max_pickup_detour_km: nonNegativeNumber(body.max_pickup_detour_km, 1),
  max_delivery_detour_km: nonNegativeNumber(body.max_delivery_detour_km, 2),
  max_direction_deviation_degrees: positiveInt(body.max_direction_deviation_degrees, 45, 0, 180),
  assignment_radius_pickup_km: nonNegativeNumber(body.assignment_radius_pickup_km, 2),
  assignment_radius_delivery_km: nonNegativeNumber(body.assignment_radius_delivery_km, 3),
  traffic_aware_assignment: body.traffic_aware_assignment !== false,
  proof_geofence_radius_m: positiveInt(body.proof_geofence_radius_m, 10, 1, 100),
  proof_min_accuracy_m: positiveInt(body.proof_min_accuracy_m, 50, 1, 500),
  proof_gps_override_policy: body.proof_gps_override_policy || {
    enabled: true,
    soft_radius_m: 25,
    max_accuracy_m: 100,
    requires_reason: true,
    manual_review_required: true
  },
  face_verification_required: body.face_verification_required !== false,
  regular_max_reschedule_attempts: positiveInt(body.regular_max_reschedule_attempts, 3, 0, 10),
  failed_delivery_policy: normalizeFailedDeliveryPolicy(body.failed_delivery_policy, body.service_category || 'on_demand'),
  pod_label: String(body.pod_label || 'POD').trim().slice(0, 20) || 'POD',
  max_eta_minutes: Number(body.max_eta_minutes || 240),
  max_distance_km: body.max_distance_km === '' || body.max_distance_km === null ? null : Number(body.max_distance_km),
  max_weight_kg: body.max_weight_kg === '' || body.max_weight_kg === null ? null : Number(body.max_weight_kg),
  uses_size_tier: Boolean(body.uses_size_tier),
  requires_dimension_scan: Boolean(body.requires_dimension_scan),
  allows_manual_dimension: Boolean(body.allows_manual_dimension),
  requires_pickup_verification: body.requires_pickup_verification !== false,
  price_mode: body.price_mode || 'final',
  base_fare_idr: nonNegativeNumber(body.base_fare_idr, 8000),
  included_distance_km: nonNegativeNumber(body.included_distance_km, 1),
  per_km_idr: nonNegativeNumber(body.per_km_idr, 3200),
  service_multiplier: nonNegativeNumber(body.service_multiplier, 1),
  platform_commission_percent: nonNegativeNumber(body.platform_commission_percent, 20),
  courier_payout_percent: nonNegativeNumber(body.courier_payout_percent, 80),
  courier_min_payout_idr: nonNegativeNumber(body.courier_min_payout_idr, 8000),
  mdr_percent: nonNegativeNumber(body.mdr_percent, 0),
  ppn_percent: nonNegativeNumber(body.ppn_percent, 0),
  platform_fee_idr: nonNegativeNumber(body.platform_fee_idr, 0),
  platform_fee_pct: nonNegativeNumber(body.platform_fee_pct, 0),
  extra_dropoff_fee_idr: nonNegativeNumber(body.extra_dropoff_fee_idr, 0),
  show_customer_price_to_courier: Boolean(body.show_customer_price_to_courier),
  search_radii_km: Array.isArray(body.search_radii_km) ? body.search_radii_km.map(Number).filter((n: number) => !isNaN(n) && n > 0) : [3, 5, 10],
  size_tiers: Array.isArray(body.size_tiers) ? body.size_tiers : [],
  dimension_rules: body.dimension_rules || {},
  availability_rules: body.availability_rules || {},
  metadata: body.metadata || {}
});

export const createAdminDeliveryService = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = servicePayload(req.body);
    if (!payload.code || !payload.name) {
      res.status(400).json({ error: 'code and name are required' });
      return;
    }

    const { rows } = await db.query(
      `INSERT INTO delivery_service_products (
        code, name, description, service_family, service_category, route_model, is_enabled, display_order,
        vehicle_types, exclusive_driver, batching_allowed, max_eta_minutes, max_distance_km, max_weight_kg,
        max_packages_per_order, max_active_orders_regular, max_active_orders_on_demand,
        same_customer_batching_required, allow_new_offer_while_pickup, allow_new_offer_while_delivery,
        max_pickup_detour_km, max_delivery_detour_km, max_direction_deviation_degrees,
        assignment_radius_pickup_km, assignment_radius_delivery_km, traffic_aware_assignment,
        proof_geofence_radius_m, proof_min_accuracy_m, proof_gps_override_policy,
        face_verification_required, regular_max_reschedule_attempts, failed_delivery_policy, pod_label,
        uses_size_tier, requires_dimension_scan, allows_manual_dimension, requires_pickup_verification,
        price_mode, base_fare_idr, included_distance_km, per_km_idr, service_multiplier,
        platform_commission_percent, courier_payout_percent, courier_min_payout_idr,
        mdr_percent, ppn_percent, platform_fee_idr, platform_fee_pct, extra_dropoff_fee_idr, show_customer_price_to_courier, search_radii_km,
        size_tiers, dimension_rules, availability_rules, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17,
        $18, $19, $20,
        $21, $22, $23,
        $24, $25, $26,
        $27, $28, $29,
        $30, $31, $32, $33,
        $34, $35, $36, $37,
        $38, $39, $40, $41, $42,
        $43, $44, $45,
        $46, $47, $48, $49, $50, $51, $52,
        $53, $54,
        $55, $56
      )
      RETURNING *`,
      [
        payload.code, payload.name, payload.description, payload.service_family, payload.service_category, payload.route_model,
        payload.is_enabled, payload.display_order, payload.vehicle_types, payload.exclusive_driver,
        payload.batching_allowed, payload.max_eta_minutes, payload.max_distance_km, payload.max_weight_kg,
        payload.max_packages_per_order, payload.max_active_orders_regular, payload.max_active_orders_on_demand,
        payload.same_customer_batching_required, payload.allow_new_offer_while_pickup, payload.allow_new_offer_while_delivery,
        payload.max_pickup_detour_km, payload.max_delivery_detour_km, payload.max_direction_deviation_degrees,
        payload.assignment_radius_pickup_km, payload.assignment_radius_delivery_km, payload.traffic_aware_assignment,
        payload.proof_geofence_radius_m, payload.proof_min_accuracy_m, JSON.stringify(payload.proof_gps_override_policy),
        payload.face_verification_required, payload.regular_max_reschedule_attempts, payload.failed_delivery_policy, payload.pod_label,
        payload.uses_size_tier, payload.requires_dimension_scan, payload.allows_manual_dimension,
        payload.requires_pickup_verification, payload.price_mode, payload.base_fare_idr,
        payload.included_distance_km, payload.per_km_idr, payload.service_multiplier,
        payload.platform_commission_percent, payload.courier_payout_percent,
        payload.courier_min_payout_idr, payload.mdr_percent, payload.ppn_percent,
        payload.platform_fee_idr, payload.platform_fee_pct, payload.extra_dropoff_fee_idr,
        payload.show_customer_price_to_courier, JSON.stringify(payload.search_radii_km),
        JSON.stringify(payload.size_tiers), JSON.stringify(payload.dimension_rules),
        JSON.stringify(payload.availability_rules), JSON.stringify(payload.metadata)
      ]
    );

    await writeDeliveryServiceAudit(req.user?.id, 'lookup.delivery_service.created', { after: rows[0] });
    res.status(201).json({ success: true, service: normalizeService(rows[0]) });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const updateAdminDeliveryService = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = servicePayload({ ...req.body, code: req.params.code });
    const { rows } = await db.query(
      `UPDATE delivery_service_products SET
        name = $2,
        description = $3,
        service_family = $4,
        service_category = $5,
        route_model = $6,
        is_enabled = $7,
        display_order = $8,
        vehicle_types = $9,
        exclusive_driver = $10,
        batching_allowed = $11,
        max_eta_minutes = $12,
        max_distance_km = $13,
        max_weight_kg = $14,
        max_packages_per_order = $15,
        max_active_orders_regular = $16,
        max_active_orders_on_demand = $17,
        same_customer_batching_required = $18,
        allow_new_offer_while_pickup = $19,
        allow_new_offer_while_delivery = $20,
        max_pickup_detour_km = $21,
        max_delivery_detour_km = $22,
        max_direction_deviation_degrees = $23,
        assignment_radius_pickup_km = $24,
        assignment_radius_delivery_km = $25,
        traffic_aware_assignment = $26,
        proof_geofence_radius_m = $27,
        proof_min_accuracy_m = $28,
        proof_gps_override_policy = $29,
        face_verification_required = $30,
        regular_max_reschedule_attempts = $31,
        failed_delivery_policy = $32,
        pod_label = $33,
        uses_size_tier = $34,
        requires_dimension_scan = $35,
        allows_manual_dimension = $36,
        requires_pickup_verification = $37,
        price_mode = $38,
        base_fare_idr = $39,
        included_distance_km = $40,
        per_km_idr = $41,
        service_multiplier = $42,
        platform_commission_percent = $43,
        courier_payout_percent = $44,
        courier_min_payout_idr = $45,
        mdr_percent = $46,
        ppn_percent = $47,
        platform_fee_idr = $48,
        platform_fee_pct = $49,
        extra_dropoff_fee_idr = $50,
        show_customer_price_to_courier = $51,
        search_radii_km = $52,
        size_tiers = $53,
        dimension_rules = $54,
        availability_rules = $55,
        metadata = $56,
        updated_at = NOW()
      WHERE code = $1
      RETURNING *`,
      [
        payload.code, payload.name, payload.description, payload.service_family, payload.service_category, payload.route_model,
        payload.is_enabled, payload.display_order, payload.vehicle_types, payload.exclusive_driver,
        payload.batching_allowed, payload.max_eta_minutes, payload.max_distance_km, payload.max_weight_kg,
        payload.max_packages_per_order, payload.max_active_orders_regular, payload.max_active_orders_on_demand,
        payload.same_customer_batching_required, payload.allow_new_offer_while_pickup, payload.allow_new_offer_while_delivery,
        payload.max_pickup_detour_km, payload.max_delivery_detour_km, payload.max_direction_deviation_degrees,
        payload.assignment_radius_pickup_km, payload.assignment_radius_delivery_km, payload.traffic_aware_assignment,
        payload.proof_geofence_radius_m, payload.proof_min_accuracy_m, JSON.stringify(payload.proof_gps_override_policy),
        payload.face_verification_required, payload.regular_max_reschedule_attempts, payload.failed_delivery_policy, payload.pod_label,
        payload.uses_size_tier, payload.requires_dimension_scan, payload.allows_manual_dimension,
        payload.requires_pickup_verification, payload.price_mode, payload.base_fare_idr,
        payload.included_distance_km, payload.per_km_idr, payload.service_multiplier,
        payload.platform_commission_percent, payload.courier_payout_percent,
        payload.courier_min_payout_idr, payload.mdr_percent, payload.ppn_percent,
        payload.platform_fee_idr, payload.platform_fee_pct, payload.extra_dropoff_fee_idr,
        payload.show_customer_price_to_courier, JSON.stringify(payload.search_radii_km),
        JSON.stringify(payload.size_tiers), JSON.stringify(payload.dimension_rules),
        JSON.stringify(payload.availability_rules), JSON.stringify(payload.metadata)
      ]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Delivery service not found' });
      return;
    }

    await writeDeliveryServiceAudit(req.user?.id, 'lookup.delivery_service.updated', { after: rows[0] });
    res.json({ success: true, service: normalizeService(rows[0]) });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const deleteAdminDeliveryService = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.params.code;
    const { rows } = await db.query(
      `DELETE FROM delivery_service_products
       WHERE code = $1
       RETURNING *`,
      [code]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Delivery service not found' });
      return;
    }

    await writeDeliveryServiceAudit(req.user?.id, 'lookup.delivery_service.deleted', { before: rows[0] });
    res.json({ success: true, message: 'Delivery service deleted successfully' });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const toggleAdminDeliveryService = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.params.code;
    const is_enabled = Boolean(req.body.is_enabled);
    const { rows } = await db.query(
      `UPDATE delivery_service_products
       SET is_enabled = $2, updated_at = NOW()
       WHERE code = $1
       RETURNING *`,
      [code, is_enabled]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Delivery service not found' });
      return;
    }

    await writeDeliveryServiceAudit(req.user?.id, 'lookup.delivery_service.toggled', { after: rows[0] });
    res.json({ success: true, service: normalizeService(rows[0]) });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};
