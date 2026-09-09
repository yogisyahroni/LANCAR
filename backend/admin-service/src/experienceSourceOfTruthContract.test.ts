import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import {
  createAdminBanner,
  updateAdminBanner,
  deleteAdminBanner,
} from './controllers/admin.controller';

const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const response = () => {
  const headers: Record<string, string> = {};
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: (key: string, value: string) => {
      headers[key] = value;
      return result;
    },
    status: (code: number) => {
      result.statusCode = code;
      return result;
    },
    json: (body: unknown) => {
      result.body = body;
      return result;
    },
    headers,
  } as unknown as Response & { statusCode: number; body: unknown; headers: Record<string, string> };
  return result;
};

const adminRequest = (): Request => ({
  user: { id: '00000000-0000-4000-8000-000000000001', role: 'super_admin' },
} as Request);

describe('ADMEXP-2026-018 source-of-truth cutover', () => {
  it('documents existing ownership and deterministic migration boundaries', () => {
    const contract = read('../../../docs/contracts/admin-experience-source-of-truth-2026.md');
    const migration = read('../../../database/migrations/20260909000017_admin_experience_legacy_cutover.sql');
    const app = read('../../../admin-dashboard/src/App.tsx');
    const banners = read('../../../admin-dashboard/src/pages/Banners.tsx');
    const promos = read('../../../admin-dashboard/src/pages/Promos.tsx');
    const promoEngine = read('./services/promoEngine.ts');
    const flags = read('../../../admin-dashboard/src/pages/FeatureFlags.tsx');
    const presentationPolicy = read('../../../android-app-customer/app/src/main/java/com/tembus/customer/domain/config/ExperiencePresentationPolicy.kt');

    expect(contract).toContain('promo_campaigns');
    expect(contract).toContain('feature_flags');
    expect(contract).toContain('shouldRenderLegacyGlobalBanner');
    expect(banners).toContain('to="/app-experience/campaigns"');
    expect(banners).not.toContain('/admin/banners');
    expect(promos).toContain('/admin/promos');
    expect(promoEngine).toContain('promo_campaigns');
    expect(flags).toContain('/admin/feature-flags');
    expect(presentationPolicy).toContain('snapshot.manifest.sections.isEmpty()');
    expect(migration).toContain('ON CONFLICT (manifest_id, revision) DO NOTHING');
    expect(migration).toContain("'source_table', 'global_banners'");
    expect(app).toContain('path="/banners" element={<Navigate to="/app-experience/campaigns" replace />}');
    expect(app).toContain('path="/feature-flags"');
    expect(app).toContain('to="/app-experience/feature-flags"');
  });

  it.each([
    ['create', createAdminBanner],
    ['update', updateAdminBanner],
    ['delete', deleteAdminBanner],
  ])('rejects legacy %s writes after backfill', async (_name, handler) => {
    const res = response();
    await handler(adminRequest(), res);

    expect(res.statusCode).toBe(410);
    expect((res.body as Record<string, unknown>).code).toBe('LEGACY_BANNER_WRITE_DISABLED');
    expect((res.body as Record<string, unknown>).replacement).toBe('/app-experience/campaigns');
    expect(res.headers.Deprecation).toBe('true');
  });
});
