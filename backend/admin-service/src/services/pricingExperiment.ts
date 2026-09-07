import crypto from 'crypto';

export type PricingExperimentRuntimeConfig = {
  experiment_id: string;
  service_code?: string;
  market?: string;
  enabled?: boolean;
  killed?: boolean;
  assignment_salt: string;
  traffic_percent: number;
  control_pricing_rule_version: string;
  treatment_pricing_rule_version: string;
};

export type PricingExperimentAssignment = {
  experiment_id: string;
  subject_type: 'customer' | 'courier';
  assignment_key: string;
  variant: 'control' | 'treatment';
  pricing_rule_version: string;
};

// Keep this algorithm byte-for-byte compatible with order-service:
// SHA-256(experiment_id + NUL + subject_type + NUL + subject_id + NUL + salt),
// first uint32 modulo 10000, then compare against traffic_percent * 100.
export const deterministicPricingExperimentAssignment = (
  config: PricingExperimentRuntimeConfig | null | undefined,
  subjectType: 'customer' | 'courier',
  subjectId: string,
): PricingExperimentAssignment | null => {
  if (!config || config.enabled !== true || config.killed === true) return null;
  if (!config.experiment_id || !config.assignment_salt || !subjectId) return null;
  if (!Number.isFinite(config.traffic_percent) || config.traffic_percent < 0 || config.traffic_percent > 100) return null;

  const input = [config.experiment_id, subjectType, subjectId.trim(), config.assignment_salt].join('\0');
  const digest = crypto.createHash('sha256').update(input, 'utf8').digest();
  const assignmentKey = digest.toString('hex');
  const bucket = (digest.readUInt32BE(0) % 10000) / 100;
  const treatment = bucket < config.traffic_percent;
  return {
    experiment_id: config.experiment_id,
    subject_type: subjectType,
    assignment_key: assignmentKey,
    variant: treatment ? 'treatment' : 'control',
    pricing_rule_version: treatment
      ? config.treatment_pricing_rule_version
      : config.control_pricing_rule_version,
  };
};

export const pricingExperimentConfigFromSnapshot = (
  snapshot: unknown,
  runtimeConfig: unknown,
): PricingExperimentRuntimeConfig | null => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  if (!runtimeConfig || typeof runtimeConfig !== 'object' || Array.isArray(runtimeConfig)) return null;
  const quote = snapshot as Record<string, unknown>;
  const config = runtimeConfig as Record<string, unknown>;
  if (String(quote.experiment_id || '') !== String(config.experiment_id || '')) return null;
  return config as unknown as PricingExperimentRuntimeConfig;
};
