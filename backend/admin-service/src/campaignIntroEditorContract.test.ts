import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('ADMEXP-2026-007 campaign intro editor contract', () => {
  it('labels post-splash preview and exposes bounded campaign controls', () => {
    const editor = read('admin-dashboard/src/pages/AppExperienceEditor.tsx');
    expect(editor).toContain('Post-native-splash campaign intro');
    expect(editor).toContain('Primary image / animation asset');
    expect(editor).toContain('Low-bandwidth fallback asset');
    expect(editor).toContain('Localized headline fallback');
    expect(editor).toContain('Target display duration (seconds)');
    expect(editor).toContain('Hard maximum duration (seconds)');
    expect(editor).toContain('Asset prefetch window (hours)');
    expect(editor).toContain('Network fetch is never a startup prerequisite');
    expect(editor).toContain('Pause/kill is controlled by the authorized release controls above');

    const preview = read('admin-dashboard/src/components/experience/ExperiencePreview.tsx');
    expect(preview).toContain('Post-native-splash campaign intro · not the OS launch splash');

    const schema = read('backend/admin-service/src/services/experienceConfig.ts');
    expect(schema).toContain('campaign_name: text(160).optional()');
    expect(schema).toContain('display_duration_seconds');
    expect(schema).toContain('max_duration_seconds');
    expect(schema).toContain('prefetch_window_hours');
    expect(schema).toContain('Campaign intro display duration must not exceed max duration');
  });

  it('keeps startup non-blocking and delivery policy fail-safe', () => {
    const startup = read('android-app-customer/app/src/main/java/com/tembus/customer/domain/config/AppStartupCoordinator.kt');
    expect(startup).toContain('experienceConfigManager.start()');
    expect(startup).toContain('startupCampaignCoordinator.start()');

    const policy = read('android-app-customer/app/src/main/java/com/tembus/customer/domain/config/StartupCampaignPolicy.kt');
    expect(policy).toContain('displayDurationSeconds');
    expect(policy).toContain('if (displayDurationSeconds > maxDurationSeconds) return null');
    expect(policy).toContain('assetReference');

    const prefetch = read('android-app-customer/app/src/main/java/com/tembus/customer/data/config/ExperienceAssetPrefetchPolicy.kt');
    expect(prefetch).toContain('campaignPrefetchWindowMillis');
    expect(prefetch).toContain('coerceIn(1L, 24L)');
    const worker = read('android-app-customer/app/src/main/java/com/tembus/customer/worker/ExperienceAssetPrefetchWorker.kt');
    expect(worker).toContain('NetworkType.UNMETERED');
    expect(worker).toContain('Result.retry()');
  });

  it('keeps emergency kill action on the authorized manifest lifecycle', () => {
    const app = read('admin-dashboard/src/pages/AppExperience.tsx');
    expect(app).toContain('EXPERIENCE_CAPABILITIES.killSwitchExecute');
    expect(app).toContain("actionManifest.kill_switch_active ? 'Resume' : 'Pause'");
    expect(app).toContain('experienceCampaignStatus');
  });
});
