import { Request, Response } from 'express';
import { db } from '../db';

const numericFields = [
  'max_distance_km',
  'max_weight_kg',
  'included_distance_km',
  'service_multiplier',
  'platform_commission_percent',
  'courier_payout_percent',
  'mdr_percent',
  'ppn_percent'
];

export type DeliveryServiceProduct = {
  id?: string;
  code: string;
  name: string;
  description: string;
  service_family: string;
  route_model: 'p2p' | 'two_legs' | 'three_legs';
  is_enabled: boolean;
  display_order: number;
  vehicle_types: string[];
  exclusive_driver: boolean;
  batching_allowed: boolean;
  max_eta_minutes: number;
  max_distance_km: number | null;
  max_weight_kg: number | null;
  uses_size_tier: boolean;
  requires_dimension_scan: boolean;
  allows_manual_dimension: boolean;
  requires_pickup_verification: boolean;
  price_mode: 'final' | 'estimated_then_adjusted';
  base_fare_idr: number;
  included_distance_km: number;
  per_km_idr: number;
  service_multiplier: number;
  platform_commission_percent: number;
  courier_payout_percent: number;
  courier_min_payout_idr: number;
  mdr_percent: number;
  ppn_percent: number;
  show_customer_price_to_courier: boolean;
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
  service.display_order = Number(service.display_order || 0);
  service.max_eta_minutes = Number(service.max_eta_minutes || 0);
  service.size_tiers = Array.isArray(service.size_tiers) ? service.size_tiers : [];
  service.dimension_rules = service.dimension_rules || {};
  service.availability_rules = service.availability_rules || {};
  service.metadata = service.metadata || {};
  service.vehicle_types = Array.isArray(service.vehicle_types) ? service.vehicle_types : [];

  return service;
};

export const customerFacingService = (service: DeliveryServiceProduct) => ({
  code: service.code,
  name: service.name,
  description: service.description,
  service_family: service.service_family,
  route_model: service.route_model,
  is_enabled: service.is_enabled,
  display_order: service.display_order,
  vehicle_types: service.vehicle_types,
  exclusive_driver: service.exclusive_driver,
  batching_allowed: service.batching_allowed,
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
  const serviceCode = code || 'lancar_instant';
  const { rows } = await db.query(
    `SELECT *
     FROM delivery_service_products
     WHERE code = $1 ${options.includeDisabled ? '' : 'AND is_enabled = TRUE'}
     LIMIT 1`,
    [serviceCode]
  );

  return rows[0] ? normalizeService(rows[0]) : null;
};

export const listCustomerDeliveryServices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await db.query(
      `SELECT *
       FROM delivery_service_products
       WHERE is_enabled = TRUE
       ORDER BY display_order ASC, name ASC`
    );

    res.json({ success: true, services: rows.map(normalizeService).map(customerFacingService) });
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

    res.json({ success: true, services: rows.map(normalizeService) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

const servicePayload = (body: any) => ({
  code: String(body.code || '').trim(),
  name: String(body.name || '').trim(),
  description: String(body.description || '').trim(),
  service_family: body.service_family || 'p2p',
  route_model: body.route_model || 'p2p',
  is_enabled: Boolean(body.is_enabled),
  display_order: Number(body.display_order || 100),
  vehicle_types: Array.isArray(body.vehicle_types) ? body.vehicle_types : ['motor'],
  exclusive_driver: Boolean(body.exclusive_driver),
  batching_allowed: Boolean(body.batching_allowed),
  max_eta_minutes: Number(body.max_eta_minutes || 240),
  max_distance_km: body.max_distance_km === '' || body.max_distance_km === null ? null : Number(body.max_distance_km),
  max_weight_kg: body.max_weight_kg === '' || body.max_weight_kg === null ? null : Number(body.max_weight_kg),
  uses_size_tier: Boolean(body.uses_size_tier),
  requires_dimension_scan: Boolean(body.requires_dimension_scan),
  allows_manual_dimension: Boolean(body.allows_manual_dimension),
  requires_pickup_verification: body.requires_pickup_verification !== false,
  price_mode: body.price_mode || 'final',
  base_fare_idr: Number(body.base_fare_idr || 0),
  included_distance_km: Number(body.included_distance_km || 1),
  per_km_idr: Number(body.per_km_idr || 0),
  service_multiplier: Number(body.service_multiplier || 1),
  platform_commission_percent: Number(body.platform_commission_percent ?? 20),
  courier_payout_percent: Number(body.courier_payout_percent ?? 75),
  courier_min_payout_idr: Number(body.courier_min_payout_idr ?? 8000),
  mdr_percent: Number(body.mdr_percent ?? 0.7),
  ppn_percent: Number(body.ppn_percent ?? 11),
  show_customer_price_to_courier: Boolean(body.show_customer_price_to_courier),
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
        code, name, description, service_family, route_model, is_enabled, display_order,
        vehicle_types, exclusive_driver, batching_allowed, max_eta_minutes, max_distance_km, max_weight_kg,
        uses_size_tier, requires_dimension_scan, allows_manual_dimension, requires_pickup_verification,
        price_mode, base_fare_idr, included_distance_km, per_km_idr, service_multiplier,
        platform_commission_percent, courier_payout_percent, courier_min_payout_idr,
        mdr_percent, ppn_percent, show_customer_price_to_courier,
        size_tiers, dimension_rules, availability_rules, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21, $22,
        $23, $24, $25,
        $26, $27, $28,
        $29, $30, $31, $32
      )
      RETURNING *`,
      [
        payload.code, payload.name, payload.description, payload.service_family, payload.route_model,
        payload.is_enabled, payload.display_order, payload.vehicle_types, payload.exclusive_driver,
        payload.batching_allowed, payload.max_eta_minutes, payload.max_distance_km, payload.max_weight_kg,
        payload.uses_size_tier, payload.requires_dimension_scan, payload.allows_manual_dimension,
        payload.requires_pickup_verification, payload.price_mode, payload.base_fare_idr,
        payload.included_distance_km, payload.per_km_idr, payload.service_multiplier,
        payload.platform_commission_percent, payload.courier_payout_percent,
        payload.courier_min_payout_idr, payload.mdr_percent, payload.ppn_percent,
        payload.show_customer_price_to_courier,
        JSON.stringify(payload.size_tiers), JSON.stringify(payload.dimension_rules),
        JSON.stringify(payload.availability_rules), JSON.stringify(payload.metadata)
      ]
    );

    res.status(201).json({ success: true, service: normalizeService(rows[0]) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
        route_model = $5,
        is_enabled = $6,
        display_order = $7,
        vehicle_types = $8,
        exclusive_driver = $9,
        batching_allowed = $10,
        max_eta_minutes = $11,
        max_distance_km = $12,
        max_weight_kg = $13,
        uses_size_tier = $14,
        requires_dimension_scan = $15,
        allows_manual_dimension = $16,
        requires_pickup_verification = $17,
        price_mode = $18,
        base_fare_idr = $19,
        included_distance_km = $20,
        per_km_idr = $21,
        service_multiplier = $22,
        platform_commission_percent = $23,
        courier_payout_percent = $24,
        courier_min_payout_idr = $25,
        mdr_percent = $26,
        ppn_percent = $27,
        show_customer_price_to_courier = $28,
        size_tiers = $29,
        dimension_rules = $30,
        availability_rules = $31,
        metadata = $32,
        updated_at = NOW()
      WHERE code = $1
      RETURNING *`,
      [
        payload.code, payload.name, payload.description, payload.service_family, payload.route_model,
        payload.is_enabled, payload.display_order, payload.vehicle_types, payload.exclusive_driver,
        payload.batching_allowed, payload.max_eta_minutes, payload.max_distance_km, payload.max_weight_kg,
        payload.uses_size_tier, payload.requires_dimension_scan, payload.allows_manual_dimension,
        payload.requires_pickup_verification, payload.price_mode, payload.base_fare_idr,
        payload.included_distance_km, payload.per_km_idr, payload.service_multiplier,
        payload.platform_commission_percent, payload.courier_payout_percent,
        payload.courier_min_payout_idr, payload.mdr_percent, payload.ppn_percent,
        payload.show_customer_price_to_courier,
        JSON.stringify(payload.size_tiers), JSON.stringify(payload.dimension_rules),
        JSON.stringify(payload.availability_rules), JSON.stringify(payload.metadata)
      ]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Delivery service not found' });
      return;
    }

    res.json({ success: true, service: normalizeService(rows[0]) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
