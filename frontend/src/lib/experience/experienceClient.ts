import { api } from '@/lib/api';
import { clientLog } from '@/lib/clientLogger';

export type ExperienceProperties = Record<string, unknown>;

export interface ExperienceSection {
  id: string;
  component: string;
  properties: ExperienceProperties;
}

export interface ExperienceManifest {
  manifest_id: string;
  revision: number;
  market_code: string;
  locale: string;
  resolved_locale?: string | null;
  surface: 'customer_web';
  sections: ExperienceSection[];
  asset_references?: Array<{ asset_id: string; uri: string; kind?: string }>;
  checksum: string;
}

interface ExperienceManifestResponse {
  success?: boolean;
  data?: ExperienceManifest;
}

const CUSTOMER_COMPONENTS = new Set([
  'hero_banner',
  'campaign_strip',
  'promo_carousel',
  'service_grid',
  'info_card',
  'quick_actions',
  'notice',
  'spacer',
  'campaign_intro',
  'design_tokens',
]);

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || '0.1.0';
const marketCode = process.env.NEXT_PUBLIC_MARKET_CODE?.trim().toLowerCase() || 'id-jk';

const isUsableManifest = (manifest: ExperienceManifest | undefined): manifest is ExperienceManifest => {
  if (!manifest || manifest.surface !== 'customer_web' || !manifest.manifest_id || manifest.revision < 1) return false;
  return manifest.sections.every((section) => CUSTOMER_COMPONENTS.has(section.component));
};

export async function fetchCustomerExperience(options: {
  locale?: string;
  cohort?: string | null;
  experimentRef?: string | null;
  experimentAssignment?: string | null;
} = {}): Promise<ExperienceManifest | null> {
  try {
    const response = await api.get<ExperienceManifestResponse>('/experience/manifest', {
      params: {
        market_code: marketCode,
        locale: options.locale || undefined,
        surface: 'customer_web',
        app_version: appVersion,
        cohort: options.cohort || undefined,
        experiment_ref: options.experimentRef || undefined,
        experiment_assignment: options.experimentAssignment || undefined,
      },
    });
    const manifest = response.data?.data;
    return isUsableManifest(manifest) ? manifest : null;
  } catch (error) {
    clientLog.experience('manifest_fetch_failure', {
      component: 'customer_web',
      error: error instanceof Error ? error.message : 'request_failed',
    });
    return null;
  }
}
