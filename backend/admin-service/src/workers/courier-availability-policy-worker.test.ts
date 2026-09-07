import {
  runCourierAvailabilityPolicyTick,
  AvailabilityPolicyQueryable,
} from './courier-availability-policy-worker';

describe('courier availability policy worker', () => {
  it('persists stale heartbeat/location transitions through the database policy function', async () => {
    const queryable: AvailabilityPolicyQueryable = {
      query: jest.fn().mockResolvedValue({ rows: [{ transitioned: 3 }] }),
    };

    await expect(runCourierAvailabilityPolicyTick(queryable, 90)).resolves.toEqual({
      staleAfterSeconds: 90,
      transitioned: 3,
    });
    expect(queryable.query).toHaveBeenCalledWith(
      'SELECT mark_stale_couriers_unavailable($1)::int AS transitioned',
      [90],
    );
  });

  it('reports a clean tick without manufacturing a transition', async () => {
    const queryable: AvailabilityPolicyQueryable = {
      query: jest.fn().mockResolvedValue({ rows: [{ transitioned: 0 }] }),
    };

    await expect(runCourierAvailabilityPolicyTick(queryable, 120)).resolves.toEqual({
      staleAfterSeconds: 120,
      transitioned: 0,
    });
  });
});
