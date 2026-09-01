import { towingBeforeProofIsLocked } from './courierProof.controller';

describe('towing before-condition proof policy', () => {
  it('locks before proof at transit and all downstream stages', () => {
    for (const status of ['in_transit', 'arrived_dropoff', 'unloading', 'completed', 'delivered']) {
      expect(towingBeforeProofIsLocked(status)).toBe(true);
    }
  });

  it('allows before proof before transit starts', () => {
    for (const status of ['assigned', 'accepted', 'pickup_arrived', 'loading']) {
      expect(towingBeforeProofIsLocked(status)).toBe(false);
    }
  });
});
