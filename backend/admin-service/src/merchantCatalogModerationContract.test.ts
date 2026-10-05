import fs from 'fs';
import path from 'path';

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

describe('MWEB-PORTAL-P0-004 catalog moderation contract', () => {
  it('keeps moderation decisions in the admin route with step-up and idempotency', () => {
    const routes = read('routes/admin.routes.ts');
    expect(routes).toContain("'/admin/catalog/moderation'");
    expect(routes).toContain("requireTotp, requireIdempotencyKey('admin.catalog.moderation.review')");
  });

  it('locks pending catalog rows and writes an immutable actor/audit decision', () => {
    const controller = read('controllers/merchantCatalogModeration.controller.ts');
    expect(controller).toContain('FOR UPDATE');
    expect(controller).toContain("moderation_status = 'pending'");
    expect(controller).toContain("admin.catalog.moderation.reviewed");
    expect(controller).toContain('server_authoritative: true');
  });
});
