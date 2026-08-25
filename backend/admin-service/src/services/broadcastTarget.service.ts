import { readDb } from '../db';
import { securityLog } from '../security/logRedaction';

export interface BroadcastTargetFilter {
  zone_ids?: string[];
  roles?: string[];
  capabilities?: string[];
  account_status?: string;
  online_now?: boolean;
  user_ids?: string[];
}

export type BroadcastTargetType = 'all' | 'online' | 'filter' | 'manual';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_ACCOUNT_STATUS = new Set(['active', 'inactive', 'suspended', 'pending_verification']);
const ALLOWED_TARGET_ROLES = new Set(['customer', 'courier']);

const normalizeUuidArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && UUID_PATTERN.test(item.trim())) {
      seen.add(item.trim().toLowerCase());
    }
  }
  if (seen.size === 0 && value.length > 0) {
    throw Object.assign(new Error(`${label} does not contain any valid uuid`), { statusCode: 400 });
  }
  return Array.from(seen);
};

const normalizeStringArray = (
  value: unknown,
  allowed: Set<string> | null,
  label: string,
): string[] => {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim().toLowerCase();
    if (!normalized) continue;
    if (allowed && !allowed.has(normalized)) {
      throw Object.assign(new Error(`Invalid ${label} value: ${normalized}`), { statusCode: 400 });
    }
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
};

interface PredicateParts {
  predicate: string;
  params: unknown[];
}

/**
 * Build WHERE predicates over `users u` for the given target segment.
 * Presence source: courier_profiles.is_online (courier duty toggle).
 * Zones resolve via courier_zones, capabilities via
 * courier_service_capabilities(status='enabled').
 */
const buildPredicate = (
  targetType: BroadcastTargetType,
  rawFilter: unknown,
): PredicateParts => {
  const clauses: string[] = ['u.deleted_at IS NULL'];
  const params: unknown[] = [];
  const push = (clause: string, ...values: unknown[]) => {
    for (const value of values) {
      params.push(value);
      clauses.push(clause.replace('?', `$${params.length}`));
    }
  };

  const filter =
    rawFilter && typeof rawFilter === 'object' && !Array.isArray(rawFilter)
      ? (rawFilter as BroadcastTargetFilter)
      : null;

  const accountStatus =
    filter?.account_status && ALLOWED_ACCOUNT_STATUS.has(filter.account_status)
      ? filter.account_status
      : null;
  if (accountStatus) push('u.status = ?', accountStatus);

  const roles = normalizeStringArray(filter?.roles, ALLOWED_TARGET_ROLES, 'roles');
  if (roles.length > 0) push('u.role = ANY(?::text[])', roles);

  if (targetType === 'online' || filter?.online_now === true) {
    clauses.push(
      'EXISTS (SELECT 1 FROM courier_profiles cp WHERE cp.user_id = u.id AND cp.is_online = TRUE)',
    );
  }

  const zoneIds = normalizeUuidArray(filter?.zone_ids, 'zone_ids');
  if (zoneIds.length > 0) {
    clauses.push(
      `EXISTS (
         SELECT 1
         FROM courier_zones cz
         JOIN courier_profiles czp ON czp.id = cz.courier_profile_id
         WHERE czp.user_id = u.id
           AND cz.removed_at IS NULL
           AND cz.zone_id = ANY(?::uuid[])
       )`,
    );
    params.push(zoneIds);
  }

  const capabilities = normalizeStringArray(filter?.capabilities, null, 'capabilities');
  if (capabilities.length > 0) {
    clauses.push(
      `EXISTS (
         SELECT 1
         FROM courier_service_capabilities csc
         JOIN courier_profiles ccp ON ccp.id = csc.courier_profile_id
         WHERE ccp.user_id = u.id
           AND csc.status = 'enabled'
           AND csc.service_code = ANY(?::text[])
       )`,
    );
    params.push(capabilities);
  }

  if (targetType === 'manual') {
    const userIds = normalizeUuidArray(filter?.user_ids, 'user_ids');
    if (userIds.length > 0) {
      clauses.push('u.id = ANY(?::uuid[])');
      params.push(userIds);
    } else {
      clauses.push('FALSE');
    }
  }

  return { predicate: clauses.join('\n   AND '), params };
};

/** COUNT(*) with the exact same predicates used by iterateTargetBatches. */
export const estimateCount = async (
  targetType: BroadcastTargetType,
  targetFilter: unknown,
): Promise<number> => {
  const { predicate, params } = buildPredicate(targetType, targetFilter);
  const result = await readDb.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM users u WHERE ${predicate}`,
    params,
  );
  return Number.parseInt(result.rows[0]?.count || '0', 10);
};

const MAX_BATCH_SIZE = 5000;
export const DEFAULT_TARGET_BATCH_SIZE = 500;

/**
 * Batched keyset iterator over matching user ids. Yields arrays of at most
 * `batchSize` uuids so large audiences never load fully into memory.
 */
export async function* iterateTargetBatches(
  targetType: BroadcastTargetType,
  targetFilter: unknown,
  batchSize: number = DEFAULT_TARGET_BATCH_SIZE,
): AsyncGenerator<string[]> {
  const { predicate, params } = buildPredicate(targetType, targetFilter);
  const safeBatchSize = Math.min(Math.max(Number(batchSize) || DEFAULT_TARGET_BATCH_SIZE, 1), MAX_BATCH_SIZE);
  let lastId: string | null = null;

  for (;;) {
    // Filter params occupy $1..$n; LIMIT and keyset cursor follow.
    const limitParam: number = params.length + 1;
    const cursorParam: number = params.length + 2;
    const cursorClause: string = lastId ? `AND u.id > $${cursorParam}::uuid` : '';
    const queryParams: unknown[] = lastId
      ? [...params, safeBatchSize, lastId]
      : [...params, safeBatchSize];

    interface KeysetRow { id: string }
    const result = await readDb.query<KeysetRow>(
      `SELECT u.id::text AS id
       FROM users u
       WHERE ${predicate}
         ${cursorClause}
       ORDER BY u.id ASC
       LIMIT $${limitParam}`,
      queryParams,
    );

    if (result.rows.length === 0) return;
    yield result.rows.map((row: KeysetRow) => row.id);
    lastId = result.rows[result.rows.length - 1].id;
  }
}

export const logTargetResolutionError = (broadcastId: string, error: unknown) => {
  securityLog.error('[Broadcast] Target resolution failed', {
    broadcast_id: broadcastId,
    error,
  });
};
