import { z } from 'zod';
import { db, readDb } from '../db';

const MARKET_CODE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const ROLE_CODES = ['customer', 'courier', 'merchant'] as const;

export type ComplianceRole = typeof ROLE_CODES[number];

type QueryExecutor = {
  query: (text: string, values?: readonly unknown[]) => Promise<{ rows: any[] }>;
};

export class ComplianceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ComplianceError';
  }
}

const consentInputSchema = z.object({
  market_code: z.string().trim().toLowerCase().regex(MARKET_CODE),
  requirement_code: z.string().trim().min(1).max(64),
  document_type: z.string().trim().min(1).max(64),
  document_version: z.string().trim().min(1).max(64),
  locale: z.string().trim().min(2).max(35),
  purpose: z.string().trim().min(1).max(120),
  consent: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ComplianceConsentInput = z.infer<typeof consentInputSchema>;

export type CompliancePolicy = {
  market_code: string;
  config_version: number;
  default_locale: string;
  requirements: any[];
  data_policies: any[];
  artifact_policies: any[];
  service_categories: any[];
  readiness: any;
};

const normalizeMarketCode = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!MARKET_CODE.test(normalized)) {
    throw new ComplianceError('INVALID_MARKET_CODE', 400, 'market_code has an invalid format');
  }
  return normalized;
};

const normalizeRole = (value: unknown): ComplianceRole => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'merchant_admin') return 'merchant';
  if (!(ROLE_CODES as readonly string[]).includes(normalized)) {
    throw new ComplianceError('INVALID_COMPLIANCE_ROLE', 400, 'A customer, courier, or merchant role is required');
  }
  return normalized as ComplianceRole;
};

const parseConsentInput = (body: unknown): ComplianceConsentInput => {
  const result = consentInputSchema.safeParse(body);
  if (!result.success) {
    throw new ComplianceError(
      'INVALID_COMPLIANCE_CONSENT',
      400,
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return result.data;
};

const policyRows = async (marketCode: string, executor: QueryExecutor): Promise<CompliancePolicy> => {
  const market = await executor.query(
    `SELECT market_code, config_version, default_locale
       FROM market_configs
      WHERE market_code = $1`,
    [marketCode],
  );
  if (market.rows.length === 0) {
    throw new ComplianceError('MARKET_NOT_CONFIGURED', 404, `Market '${marketCode}' is not configured`);
  }

  const requirements = await executor.query(
    `SELECT role_code, requirement_code, requirement_kind, document_type,
            document_version, locale, purpose, is_required, policy_version,
            effective_from, effective_to
       FROM market_compliance_requirements
      WHERE market_code = $1
        AND is_active = TRUE
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR NOW() < effective_to)
      ORDER BY role_code, requirement_code`,
    [marketCode],
  );
  const dataPolicies = await executor.query(
    `SELECT data_class, retention_days, export_mode, deletion_mode,
            policy_version, effective_from, effective_to, legal_basis
       FROM market_compliance_data_policies
      WHERE market_code = $1
        AND is_active = TRUE
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR NOW() < effective_to)
      ORDER BY data_class`,
    [marketCode],
  );
  const artifactPolicies = await executor.query(
    `SELECT role_code, artifact_type, storage_access_class, retention_days,
            export_mode, deletion_mode, policy_version, effective_from,
            effective_to
       FROM market_compliance_artifact_policies
      WHERE market_code = $1
        AND is_active = TRUE
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR NOW() < effective_to)
      ORDER BY role_code, artifact_type`,
    [marketCode],
  );
  const serviceCategories = await executor.query(
    `SELECT city_code, service_code, is_enabled, service_hours, policy_refs,
            config_version, effective_from
       FROM market_service_availability
      WHERE market_code = $1
        AND effective_from <= NOW()
      ORDER BY city_code, service_code`,
    [marketCode],
  );
  const readiness = await executor.query(
    `SELECT market_code, is_ready, reason_codes
       FROM market_config_readiness($1)`,
    [marketCode],
  );

  return {
    market_code: market.rows[0].market_code,
    config_version: Number(market.rows[0].config_version),
    default_locale: market.rows[0].default_locale,
    requirements: requirements.rows,
    data_policies: dataPolicies.rows,
    artifact_policies: artifactPolicies.rows,
    service_categories: serviceCategories.rows,
    readiness: readiness.rows[0] || { market_code: marketCode, is_ready: false, reason_codes: ['readiness_unavailable'] },
  };
};

export const getCompliancePolicy = async (marketCode: string, executor: QueryExecutor = readDb) =>
  policyRows(normalizeMarketCode(marketCode), executor);

export const parseComplianceConsent = parseConsentInput;

const activeConsentRequirement = async (input: ComplianceConsentInput, role: ComplianceRole, executor: QueryExecutor) => {
  const result = await executor.query(
    `SELECT requirement_code, document_type, document_version, locale, purpose
       FROM market_compliance_requirements
      WHERE market_code = $1
        AND role_code = $2
        AND requirement_code = $3
        AND requirement_kind = 'consent'
        AND is_required = TRUE
        AND is_active = TRUE
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR NOW() < effective_to)
      LIMIT 1`,
    [input.market_code, role, input.requirement_code],
  );
  const requirement = result.rows[0];
  if (!requirement || requirement.document_type !== input.document_type
    || requirement.document_version !== input.document_version
    || requirement.locale !== input.locale || requirement.purpose !== input.purpose) {
    throw new ComplianceError('COMPLIANCE_REQUIREMENT_NOT_ACTIVE', 409, 'Consent does not match the active market policy');
  }
};

export const recordComplianceConsent = async (
  body: unknown,
  actor: { id: string; role: string },
  requestContext: { ipAddress?: string | null; userAgent?: string | null } = {},
) => {
  const input = parseConsentInput(body);
  const role = normalizeRole(actor.role);
  await activeConsentRequirement(input, role, db);

  const decision = input.consent ? 'granted' : 'withdrawn';
  const result = await db.query(
    `INSERT INTO market_compliance_consent_events (
       subject_id, subject_role, market_code, requirement_code,
       document_type, document_version, locale, purpose, decision,
       actor_id, actor_type, source, ip_address, user_agent, metadata
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid,
               'self', 'api', NULLIF($11, '')::inet, $12, $13::jsonb)
     RETURNING id, subject_role, market_code, requirement_code, document_type,
               document_version, locale, purpose, decision, consented_at,
               actor_id, actor_type, source`,
    [
      actor.id, role, input.market_code, input.requirement_code,
      input.document_type, input.document_version, input.locale, input.purpose,
      decision, actor.id, requestContext.ipAddress || '', requestContext.userAgent || '',
      JSON.stringify(input.metadata || {}),
    ],
  );

  return result.rows[0] || null;
};

export const listOwnComplianceConsents = async (actor: { id: string; role: string }) => {
  const role = normalizeRole(actor.role);
  const result = await readDb.query(
    `SELECT id, subject_role, market_code, requirement_code, document_type,
            document_version, locale, purpose, decision, consented_at,
            actor_id, actor_type, source
       FROM market_compliance_consent_events
      WHERE subject_id = $1::uuid AND subject_role = $2
      ORDER BY consented_at DESC`,
    [actor.id, role],
  );
  return result.rows;
};
