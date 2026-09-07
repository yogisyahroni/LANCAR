import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('COURIER-2026-008 quality scorecard contract', () => {
  it('exposes definitions, windows and service-specific metrics from the mobile performance contract', () => {
    const controller = read('controllers/courier/courierRouting.controller.ts');
    const scorecard = read('services/courierQualityScorecard.ts');
    const model = read('../../../android-app/app/src/main/java/com/tembus/courier/data/model/Models.kt');

    expect(scorecard).toContain('COURIER_SCORECARD_VERSION');
    expect(scorecard).toContain('visible_to_courier');
    expect(scorecard).toContain("window: '30d'");
    expect(controller).toContain('scorecard_metrics: qualityScorecard.metrics');
    expect(controller).toContain('service_metrics: serviceMetrics');
    expect(model).toContain('scorecardMetrics');
    expect(model).toContain('serviceMetrics');
  });

  it('requires review before a material decision after a rating anomaly and provides a persisted appeal route', () => {
    const scorecard = read('services/courierQualityScorecard.ts');
    const controller = read('controllers/courier/courierRouting.controller.ts');
    const routes = read('routes/courier.routes.ts');
    const adminRoutes = read('routes/admin.routes.ts');
    const migration = fs.readFileSync(
      path.resolve(__dirname, '../../../database/migrations/20260908000007_courier_quality_scorecard_appeals.sql'),
      'utf8',
    );

    expect(scorecard).toContain('anomaly_review_required');
    expect(scorecard).toContain('enforcement_eligible: score !== null && !reviewRequired');
    expect(controller).toContain('ERR_SCORECARD_VERSION_CHANGED');
    expect(controller).toContain('score_snapshot_server_authoritative: true');
    expect(routes).toContain("post('/api/v1/courier/performance/appeals', requireMobileOrWebAuth");
    expect(adminRoutes).toContain("get('/admin/courier-quality-scorecard/appeals'");
    expect(adminRoutes).toContain("patch('/admin/courier-quality-scorecard/appeals/:id'");
    expect(migration).toContain('uq_courier_quality_score_appeals_open');
    expect(migration).toContain("status IN ('submitted', 'in_review')");
  });
});
