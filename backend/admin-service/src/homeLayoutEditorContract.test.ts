import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('ADMEXP-2026-005 Home Layout editor contract', () => {
  it('keeps the editor aligned with the registered Home Layout schema and preview flow', () => {
    const editor = read('admin-dashboard/src/pages/AppExperienceEditor.tsx');
    const homeLayoutComponents = editor.match(/const HOME_LAYOUT_COMPONENTS = \[([\s\S]*?)\n\] as const/)?.[1];
    const registeredHomeComponents = homeLayoutComponents
      ? Array.from(homeLayoutComponents.matchAll(/\['([^']+)'/g)).map((match) => match[1])
      : [];

    expect(registeredHomeComponents).toEqual([
      'hero_banner',
      'campaign_strip',
      'promo_carousel',
      'service_grid',
      'quick_actions',
      'info_card',
      'notice',
      'spacer',
    ]);
    expect(editor).toContain('const componentOptions = homeLayoutMode ? HOME_LAYOUT_COMPONENTS : EXTENDED_COMPONENTS');
    expect(editor).toContain('onDrop={() =>');
    expect(editor).toContain('const moveSection = (from: number, to: number)');
    expect(editor).toContain('const enabledCount = value.sections.filter((section) => section.enabled !== false).length');
    expect(editor).toContain('value.sections.length <= 1');

    const app = read('admin-dashboard/src/pages/AppExperience.tsx');
    expect(app).toContain('homeLayoutMode={activeSection === \'Home Layout\'}');
    expect(app).toContain('previewAudience.app_version');
    expect(app).toContain('/preview');

    const preview = read('admin-dashboard/src/components/experience/ExperiencePreview.tsx');
    expect(preview).toContain('sections.filter((section) => section.enabled !== false)');
  });
});
