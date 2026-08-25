import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';

import { db } from '../../db';
import { createNotification } from '../../notifications';

import crypto from 'crypto';
import axios from 'axios';

import { evaluateCourierPayoutRisk } from '../../services/payoutRiskEngine';
import { decoratePayoutRequest, payoutMobileMessage } from '../../services/payoutStatusPolicy';

import { evaluatePayoutAlerts, writePayoutAuditEvent } from '../../utils/payoutObservability';
import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../../services/onDemandRealtime';

import { evaluateOnDemandRealtimeAlerts } from '../../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot } from '../../services/mapsProviderConfig';

import { isFeatureFlagEnabled } from '../../services/featureFlags';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';

import {
  AuthProtectionError,
  assertAuthAttemptAllowed,
  getRequestIpAddress,
  recordAuthFailure,
  recordAuthSuccess,
  sendAuthProtectionError,
} from '../../security/bruteForceProtection';




export const listAdminCourierGrowthConfigs = async (_req: Request, res: Response) => {
  try {
    const [tiers, incentives] = await Promise.all([
      db.query(
        `SELECT id, tier_code, tier_name, min_rating, min_completion_rate, min_deliveries_30d,
                benefit_summary, display_order, is_active, updated_at
         FROM courier_tier_configs
         ORDER BY display_order ASC`
      ),
      db.query(
        `SELECT id, code, title, description, target_deliveries, reward_idr,
                starts_at, ends_at, is_active, metadata, updated_at
         FROM courier_incentive_campaigns
         ORDER BY is_active DESC, reward_idr DESC, ends_at DESC`
      ),
    ]);
    res.json({ success: true, data: { tiers: tiers.rows, incentives: incentives.rows } });
  } catch (error) {
    securityLog.error('List courier growth configs error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error' });
  }
};



export const updateAdminCourierTierConfig = async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body || {};
  try {
    const result = await db.query(
      `UPDATE courier_tier_configs
       SET tier_name = COALESCE(NULLIF($1, ''), tier_name),
           min_rating = COALESCE($2, min_rating),
           min_completion_rate = COALESCE($3, min_completion_rate),
           min_deliveries_30d = COALESCE($4, min_deliveries_30d),
           benefit_summary = COALESCE(NULLIF($5, ''), benefit_summary),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        body.tier_name,
        body.min_rating ?? null,
        body.min_completion_rate ?? null,
        body.min_deliveries_30d ?? null,
        body.benefit_summary,
        typeof body.is_active === 'boolean' ? body.is_active : null,
        id,
      ]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, data: null, message: 'Tier config tidak ditemukan.' });
      return;
    }
    res.json({ success: true, data: result.rows[0], message: 'Tier config updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};



export const updateAdminCourierIncentive = async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body || {};
  try {
    const result = await db.query(
      `UPDATE courier_incentive_campaigns
       SET title = COALESCE(NULLIF($1, ''), title),
           description = COALESCE($2, description),
           target_deliveries = COALESCE($3, target_deliveries),
           reward_idr = COALESCE($4, reward_idr),
           starts_at = COALESCE($5, starts_at),
           ends_at = COALESCE($6, ends_at),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        body.title,
        body.description ?? null,
        body.target_deliveries ?? null,
        body.reward_idr ?? null,
        body.starts_at ?? null,
        body.ends_at ?? null,
        typeof body.is_active === 'boolean' ? body.is_active : null,
        id,
      ]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, data: null, message: 'Campaign tidak ditemukan.' });
      return;
    }
    res.json({ success: true, data: result.rows[0], message: 'Incentive campaign updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};


