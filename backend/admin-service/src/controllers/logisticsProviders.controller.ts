import { Request, Response } from 'express';
import axios from 'axios';
import { securityLog } from '../security/logRedaction';
import { db, readDb } from '../db';

const INTEGRATION_GATEWAY_URL = process.env.INTEGRATION_GATEWAY_URL || 'http://integration-gateway:8085';

const sortCustomerServices = (services: any[], dbPresentationServices: any[]): any[] => {
  const displayOrder = new Map(
    dbPresentationServices.map((service, index) => [
      String(service?.code || service?.service_code || '').trim().toLowerCase(),
      index,
    ]),
  );

  return [...services].sort((left, right) => {
    const leftCode = String(left?.code || left?.service_code || '').trim().toLowerCase();
    const rightCode = String(right?.code || right?.service_code || '').trim().toLowerCase();
    const leftOrder = displayOrder.get(leftCode) ?? 1000;
    const rightOrder = displayOrder.get(rightCode) ?? 1000;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    return String(left?.name || left?.service_name || leftCode)
      .localeCompare(String(right?.name || right?.service_name || rightCode));
  });
};

export const listCustomerLogisticsProviders = async (_req: Request, res: Response): Promise<void> => {
  let gatewayProviders: any[] = [];
  try {
    const response = await axios.get(`${INTEGRATION_GATEWAY_URL.replace(/\/$/, '')}/api/internal/logistics/providers`, {
      headers: { 'X-Internal-Api-Key': process.env.INTERNAL_API_KEY || '' },
      timeout: 3000,
    });
    if (response.data && response.data.success && Array.isArray(response.data.providers) && response.data.providers.length > 0) {
      gatewayProviders = response.data.providers;
    }
  } catch (error: any) {
    securityLog.warn('Integration gateway logistics providers unavailable, falling back to database registry:', error?.message);
  }

  try {
    const result = await readDb.query(`
      SELECT lp.code, lp.name, lp.is_active as available,
             lp.priority,
             lp.customer_badge, lp.customer_service_label,
             lp.customer_rating, lp.customer_rating_label,
             CASE WHEN lp.is_active THEN ARRAY['tariff', 'tracking', 'pickup', 'dropoff']::text[] ELSE ARRAY[]::text[] END as capabilities,
             CASE WHEN lp.is_active THEN 'webhook_and_poll' ELSE '' END as tracking_mode,
             false as tracking_degraded,
             CASE WHEN lp.is_active THEN NULL ELSE 'provider_disabled' END as availability_reason,
             COALESCE(
               json_agg(
                 json_build_object('code', ps.service_code, 'name', ps.service_name)
                 ORDER BY COALESCE(ps.customer_display_order, 1000) ASC,
                          ps.base_rate ASC,
                          ps.service_name ASC
               ) FILTER (WHERE ps.id IS NOT NULL),
               '[]'::json
             ) as services
      FROM logistics_providers lp
      LEFT JOIN provider_services ps ON ps.provider_id = lp.id AND ps.is_active = true
      GROUP BY lp.id, lp.code, lp.name, lp.is_active, lp.priority
      ORDER BY lp.priority ASC, lp.name ASC
    `);

    const dbProviders = result.rows;
    if (gatewayProviders.length === 0 && dbProviders.length === 0) {
      res.status(503).json({
        success: false,
        error: 'Daftar provider logistics belum dapat dimuat dari server.',
        code: 'LOGISTICS_PROVIDER_REGISTRY_UNAVAILABLE',
      });
      return;
    }

    // The integration gateway is authoritative for executable capability and
    // availability. The DB registry supplies the complete catalog so the
    // customer can see configured-but-unavailable providers as disabled,
    // matching the design without inventing selectable providers in the app.
    const merged = new Map<string, any>();
    for (const provider of gatewayProviders) {
      const code = String(provider?.code || '').trim().toLowerCase();
      if (code) merged.set(code, provider);
    }
    for (const provider of dbProviders) {
      const code = String(provider?.code || '').trim().toLowerCase();
      if (!code) continue;
      const gatewayProvider = merged.get(code);
      if (!gatewayProvider) {
        merged.set(code, provider);
        continue;
      }
      const disabledByCatalog = provider.available === false;
      const dbPresentationServices = Array.isArray(provider.services) ? provider.services : [];
      const gatewayServices = Array.isArray(gatewayProvider.services) ? gatewayProvider.services : [];
      merged.set(code, {
        ...provider,
        ...gatewayProvider,
        // Provider presentation order is an admin/DB setting. Keep it when
        // the gateway contributes executable capability data so the customer
        // rail opens on the same provider as the approved design state.
        priority: provider.priority ?? gatewayProvider.priority ?? 0,
        customer_badge: gatewayProvider.customer_badge || provider.customer_badge || null,
        customer_service_label: gatewayProvider.customer_service_label || provider.customer_service_label || null,
        customer_rating: gatewayProvider.customer_rating ?? provider.customer_rating ?? null,
        customer_rating_label: gatewayProvider.customer_rating_label || provider.customer_rating_label || null,
        available: disabledByCatalog ? false : gatewayProvider.available !== false,
        capabilities: disabledByCatalog ? [] : gatewayProvider.capabilities,
        availability_reason: disabledByCatalog
          ? 'provider_disabled'
          : gatewayProvider.availability_reason || provider.availability_reason || null,
        services: gatewayServices.length > 0
          ? sortCustomerServices(gatewayServices, dbPresentationServices)
          : dbPresentationServices,
      });
    }

    res.json({
      success: true,
      providers: Array.from(merged.values()).sort((left, right) => {
        const availabilityOrder = Number(Boolean(right.available)) - Number(Boolean(left.available));
        if (availabilityOrder !== 0) return availabilityOrder;
        const priorityOrder = Number(right.priority || 0) - Number(left.priority || 0);
        if (priorityOrder !== 0) return priorityOrder;
        return String(left.name || left.code).localeCompare(String(right.name || right.code));
      }),
    });
  } catch (dbError: any) {
    securityLog.error('Error fetching registered logistics providers from DB:', dbError);
    if (gatewayProviders.length > 0) {
      res.json({ success: true, providers: gatewayProviders });
      return;
    }
    res.status(503).json({
      success: false,
      error: 'Daftar provider logistics belum dapat dimuat dari server.',
      code: 'LOGISTICS_PROVIDER_REGISTRY_UNAVAILABLE',
    });
  }
};

export const getLogisticsProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT code, name, is_active, priority, discount_pct, markup_pct, discount_notes,
             created_at, updated_at
      FROM logistics_providers
      ORDER BY priority ASC, name ASC
    `);
    res.json(result.rows);
  } catch (error: any) {
    securityLog.error('Error fetching logistics providers:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateLogisticsProvider = async (req: Request, res: Response): Promise<void> => {
  const { code } = req.params;
  const { discount_pct, markup_pct, discount_notes, is_active, priority } = req.body;

  if (isNaN(discount_pct) || isNaN(markup_pct)) {
    res.status(400).json({ error: 'Invalid percentage values: NaN' });
    return;
  }

  if (discount_pct < 0 || discount_pct > 100 || markup_pct < 0 || markup_pct > 100) {
    res.status(400).json({ error: 'Percentage values must be between 0 and 100' });
    return;
  }

  try {
    const result = await db.query(
      `UPDATE logistics_providers 
       SET discount_pct = $1, markup_pct = $2, discount_notes = $3, 
           is_active = COALESCE($4, is_active), priority = COALESCE($5, priority), updated_at = NOW() 
       WHERE code = $6 
       RETURNING code, name, is_active, priority, discount_pct, markup_pct, discount_notes`,
      [discount_pct, markup_pct, discount_notes || null, is_active, priority, code]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: `Provider '${code}' not found` });
      return;
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    securityLog.error('Error updating logistics provider:', error);
    res.status(500).json({ error: error.message });
  }
};
