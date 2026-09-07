import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('COURIER-2026-007 growth contract', () => {
  it('exposes progress/readiness and read-only education modules', () => {
    const controller = read('controllers/courier/courierRouting.controller.ts');
    const model = read('../../../android-app/app/src/main/java/com/tembus/courier/data/model/Models.kt');

    expect(controller).toContain('progress_status');
    expect(controller).toContain('operational_modules');
    expect(controller).toContain('job_state_mutation_allowed: false');
    expect(model).toContain('can_mutate_job_state');
  });

  it('labels demand insight as an estimate with freshness and source', () => {
    const controller = read('controllers/courier/courierServices.controller.ts');
    const model = read('../../../android-app/app/src/main/java/com/tembus/courier/data/model/Models.kt');

    expect(controller).toContain("TRUE AS demand_estimate");
    expect(controller).toContain("'server_demand_rollup' AS demand_source");
    expect(controller).toContain('AS freshness');
    expect(model).toContain('demandEstimate');
    expect(model).toContain('demandSource');
    expect(model).toContain('freshness');
  });

  it('keeps growth and incentive mutations on existing protected routes', () => {
    const routes = read('routes/courier.routes.ts');
    const migration = fs.readFileSync(
      path.resolve(__dirname, '../../../database/migrations/20260908000006_courier_growth_safety_education.sql'),
      'utf8',
    );

    expect(routes).toContain("get('/api/v1/courier/performance', requireMobileOrWebAuth");
    expect(routes).not.toContain("post('/api/v1/courier/performance'");
    expect(migration).toContain('courier incentive cannot reward unsafe driving');
    expect(migration).toContain("mechanic NOT IN ('delivery_count', 'completion_quality')");
  });
});
