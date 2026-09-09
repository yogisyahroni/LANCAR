import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('ADMEXP-2026-006 banner and promo content editor contract', () => {
  it('exposes field-level presentation controls and keeps promo economics separate', () => {
    const editor = read('admin-dashboard/src/pages/AppExperienceEditor.tsx');
    expect(editor).toContain('Internal campaign name');
    expect(editor).toContain('Localized title pack key');
    expect(editor).toContain('Localized subtitle/body pack key');
    expect(editor).toContain('Deep link (allowlisted)');
    expect(editor).toContain('External URL (first-party)');
    expect(editor).toContain('<AssetPicker');
    expect(editor).toContain('Placement');
    expect(editor).toContain('Percentage rollout');
    expect(editor).toContain('frequency_cap_hours');
    expect(editor).toContain('max_impressions');
    expect(editor).toContain('placementForComponent');
    expect(editor).toContain('Promo/Pricing');

    const app = read('admin-dashboard/src/pages/AppExperience.tsx');
    expect(app).toContain('Duplicate');
    expect(app).toContain('/retire');
    expect(app).toContain("{actionManifest.kill_switch_active ? 'Resume' : 'Pause'}");
    expect(app).toContain('experienceCampaignStatus');

    const promo = read('admin-dashboard/src/pages/Promos.tsx');
    expect(promo).toMatch(/backend|authoritative|eligibility|discount/i);

    const schema = read('backend/admin-service/src/services/experienceConfig.ts');
    expect(schema).toContain("campaign_name: text(160).optional()");
    expect(schema).toContain("alt_label: text(160).optional()");
    expect(schema).toContain('rollout_percentage: z.coerce.number().int().min(0).max(100).default(100)');
    expect(schema).toContain('const isIncludedInRollout');
    expect(schema).toContain('const retireExperienceManifest');
    expect(schema).toContain('validateAssetReferences');

    const migration = read('database/migrations/20260909000018_experience_percentage_rollout.sql');
    expect(migration).toContain('rollout_percentage SMALLINT NOT NULL DEFAULT 100');
    expect(migration).toContain('experience_manifest_rollout_percentage_ck');
  });

  it('keeps native banner analytics tied to campaign identity and revision', () => {
    const header = read('android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicHeaderBanner.kt');
    const promo = read('android-app-customer/app/src/main/java/com/tembus/customer/ui/experience/components/DynamicPromoCard.kt');
    expect(header).toContain('campaignId');
    expect(header).toContain('manifestRevision');
    expect(header).toContain('contentDescription = altLabel ?: title');
    expect(promo).toContain('campaignId');
    expect(promo).toContain('manifestRevision');
    expect(promo).toContain('contentDescription = item.altLabel ?: item.title');
  });
});
