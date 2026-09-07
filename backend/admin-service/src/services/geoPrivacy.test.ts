import {
  PUBLIC_LOCATION_GRID_DEGREES,
  coarsenCoordinate,
  coarsenLocationRow,
  configuredGeoMarket,
} from './geoPrivacy';

describe('geo privacy controls', () => {
  it('coarsens public coordinates to the configured privacy grid', () => {
    expect(coarsenCoordinate(-6.20884)).toBe(-6.209);
    expect(coarsenCoordinate(106.84562)).toBe(106.846);
    expect(PUBLIC_LOCATION_GRID_DEGREES).toBe(0.001);
  });

  it('coarsens every coordinate field in a public row', () => {
    expect(coarsenLocationRow({
      pickup_latitude: -6.20884,
      pickup_longitude: 106.84562,
      courier_latitude: -6.21044,
      courier_longitude: 106.84711,
      unrelated: 'kept',
    })).toEqual({
      pickup_latitude: -6.209,
      pickup_longitude: 106.846,
      courier_latitude: -6.21,
      courier_longitude: 106.847,
      unrelated: 'kept',
    });
  });

  it('uses a safe market default when configuration is malformed', () => {
    const previous = process.env.MARKET_CODE;
    process.env.MARKET_CODE = 'not a market';
    expect(configuredGeoMarket()).toBe('ID-JK');
    process.env.MARKET_CODE = previous;
  });
});
