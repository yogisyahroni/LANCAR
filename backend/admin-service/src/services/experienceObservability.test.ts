import {
  evaluateExperienceGuardrail,
  getExperienceObservability,
} from './experienceObservability';
import { rollbackExperienceManifest } from './experienceConfig';

jest.mock('./experienceConfig', () => ({
  rollbackExperienceManifest: jest.fn(),
}));

const rollbackMock = rollbackExperienceManifest as jest.MockedFunction<typeof rollbackExperienceManifest>;

describe('experience observability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns reliability metrics separately from marketing metrics and groups by release dimensions', async () => {
    const queryable = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{
            total_events: '24',
            manifest_fetch_success: '18',
            manifest_fetch_failure: '2',
            manifest_cache_hit: '4',
            manifest_parse_failure: '0',
            manifest_schema_fallback: '0',
            section_render_failure: '0',
            broken_asset: '0',
            deeplink_failure: '0',
            startup_regression: '0',
            network_regression: '0',
            reliability_total: '24',
            reliability_failures: '2',
            fetch_latency_avg_ms: '120.5',
            fetch_latency_p95_ms: '210.4',
            impressions: '10',
            clicks: '3',
            dismissals: '1',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            manifest_id: 'manifest-1',
            manifest_revision: 7,
            market_code: 'id-jk',
            app_version: '2.4.0',
            total_events: '24',
            reliability_total: '24',
            reliability_failures: '2',
            impressions: '10',
            clicks: '3',
            dismissals: '1',
            fetch_latency_avg_ms: '120.5',
          }],
        }),
    };

    const result = await getExperienceObservability({
      from: new Date('2026-09-09T00:00:00.000Z'),
      to: new Date('2026-09-09T01:00:00.000Z'),
    }, queryable);

    expect(result.summary.reliability_failure_rate_pct).toBe(8.33);
    expect(result.summary.impressions).toBe(10);
    expect(result.breakdown[0]).toEqual(expect.objectContaining({
      manifest_id: 'manifest-1',
      manifest_revision: 7,
      app_version: '2.4.0',
      reliability_failure_rate_pct: 8.33,
    }));
    expect(result.guardrail_policy).toEqual(expect.objectContaining({
      min_events: 20,
      max_failure_rate_pct: 10,
      marketing_metrics_excluded: true,
    }));
    expect(queryable.query).toHaveBeenCalledTimes(2);
    expect(queryable.query.mock.calls[0][0]).toContain('marketing_events');
  });

  it('does not trip the guardrail when the reliability sample is below the minimum', async () => {
    const queryable = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ manifest_id: 'manifest-1', revision: 9, requires_approval: true, previous_revision: 8 }] })
        .mockResolvedValueOnce({ rows: [{ reliability_total: '19', reliability_failures: '19' }] }),
    };

    const result = await evaluateExperienceGuardrail(
      '550e8400-e29b-41d4-a716-446655440000',
      'correlation-1',
      queryable,
    );

    expect(result).toEqual(expect.objectContaining({
      evaluated: true,
      tripped: false,
      action: 'none',
      reliability_total: 19,
      reliability_failures: 19,
    }));
    expect(rollbackMock).not.toHaveBeenCalled();
  });

  it('automatically rolls back a high-impact revision after the threshold trips', async () => {
    rollbackMock.mockResolvedValue({ revision: 8 } as Awaited<ReturnType<typeof rollbackExperienceManifest>>);
    const queryable = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ manifest_id: 'manifest-1', revision: 9, requires_approval: true, previous_revision: 8 }] })
        .mockResolvedValueOnce({ rows: [{ reliability_total: '20', reliability_failures: '3' }] }),
    };

    const result = await evaluateExperienceGuardrail(
      '550e8400-e29b-41d4-a716-446655440000',
      'correlation-2',
      queryable,
    );

    expect(result).toEqual(expect.objectContaining({
      tripped: true,
      action: 'auto_rollback',
      rollback_target_revision: 8,
      rolled_back_revision: 8,
    }));
    expect(rollbackMock).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      8,
      '00000000-0000-4000-8000-000000000000',
      expect.stringContaining('automated high-impact guardrail rollback'),
      'correlation-2',
    );
  });
});
