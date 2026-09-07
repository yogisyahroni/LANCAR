import { getFeatureFlag } from './featureFlags';

export const COURIER_GROWTH_POLICY_VERSION = 'courier-growth-2026-v1';
export const COURIER_GROWTH_SAFETY_POLICY_VERSION = 'courier-growth-safety-2026-v1';

export type CourierEducationModule = {
  code: string;
  title: string;
  summary: string;
  module_type: 'education' | 'operational';
  priority: number;
  source: 'courier_growth_config';
  policy_version: string;
  action: 'read_only';
  can_mutate_job_state: false;
};

const DEFAULT_MODULES: CourierEducationModule[] = [
  {
    code: 'safe-delivery-basics',
    title: 'Keselamatan saat bertugas',
    summary: 'Patuhi rambu, gunakan perlengkapan keselamatan, dan berhenti dengan aman sebelum membuka aplikasi.',
    module_type: 'education',
    priority: 10,
    source: 'courier_growth_config',
    policy_version: COURIER_GROWTH_POLICY_VERSION,
    action: 'read_only',
    can_mutate_job_state: false,
  },
  {
    code: 'proof-and-handoff',
    title: 'Bukti serah-terima yang benar',
    summary: 'Pastikan lokasi, penerima, dan foto bukti sesuai SOP sebelum menyelesaikan pekerjaan.',
    module_type: 'operational',
    priority: 20,
    source: 'courier_growth_config',
    policy_version: COURIER_GROWTH_POLICY_VERSION,
    action: 'read_only',
    can_mutate_job_state: false,
  },
];

const asText = (value: unknown, fallback: string, maxLength = 240) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
};

const asPriority = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1000, Math.trunc(parsed))) : fallback;
};

export const buildCourierEducationModules = (
  config: Record<string, unknown> | null,
  enabled = true,
): CourierEducationModule[] => {
  if (!enabled) return [];

  const configured = Array.isArray(config?.modules) ? config.modules : [];
  const modules = configured
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item, index): CourierEducationModule => ({
      code: asText(item.code, `growth-module-${index + 1}`, 80).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      title: asText(item.title, 'Materi operasional kurir', 120),
      summary: asText(item.summary, 'Ikuti SOP operasional yang berlaku.', 320),
      module_type: item.module_type === 'operational' ? 'operational' : 'education',
      priority: asPriority(item.priority, index + 1),
      source: 'courier_growth_config',
      policy_version: asText(config?.policy_version, COURIER_GROWTH_POLICY_VERSION, 80),
      action: 'read_only',
      can_mutate_job_state: false,
    }))
    .filter((item) => item.code.length > 0)
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 5);

  return modules.length > 0 ? modules : DEFAULT_MODULES;
};

export const getCourierEducationModules = async (): Promise<CourierEducationModule[]> => {
  try {
    const flag = await getFeatureFlag('courier_growth_education_modules');
    return buildCourierEducationModules(flag?.config ?? null, flag ? flag.is_enabled : true);
  } catch {
    return DEFAULT_MODULES;
  }
};

export const COURIER_INCENTIVE_SAFETY_NOTICE =
  'Target dihitung dari pekerjaan yang selesai secara sah. Jangan mengejar target dengan ngebut atau mengabaikan keselamatan.';
