import {
  buildCourierEducationModules,
  COURIER_GROWTH_POLICY_VERSION,
} from './courierGrowthPolicy';

describe('courier growth education policy', () => {
  it('returns safe read-only fallback modules', () => {
    const modules = buildCourierEducationModules(null);

    expect(modules.length).toBeGreaterThan(0);
    expect(modules.every((module) => module.action === 'read_only')).toBe(true);
    expect(modules.every((module) => module.can_mutate_job_state === false)).toBe(true);
    expect(modules[0].policy_version).toBe(COURIER_GROWTH_POLICY_VERSION);
  });

  it('sanitizes dynamic modules and cannot accept a state-mutating action', () => {
    const modules = buildCourierEducationModules({
      policy_version: 'operator-growth-v2',
      modules: [
        {
          code: 'safe SOP',
          title: ' SOP keselamatan ',
          summary: ' Jangan terburu-buru. ',
          module_type: 'operational',
          priority: 4,
          action: 'cancel_order',
          can_mutate_job_state: true,
        },
      ],
    });

    expect(modules).toEqual([expect.objectContaining({
      code: 'safe-sop',
      title: 'SOP keselamatan',
      module_type: 'operational',
      policy_version: 'operator-growth-v2',
      action: 'read_only',
      can_mutate_job_state: false,
    })]);
  });

  it('supports an explicit disabled flag without exposing modules', () => {
    expect(buildCourierEducationModules({ modules: [{ code: 'hidden' }] }, false)).toEqual([]);
  });
});
