import { describe, expect, it } from 'vitest';
import { isCustomerWebFoodService } from './customerWebServices';

describe('isCustomerWebFoodService', () => {
  it('filters canonical food service records', () => {
    expect(isCustomerWebFoodService({ code: 'food_delivery', service_category: 'food' })).toBe(true);
    expect(isCustomerWebFoodService({ code: 'food_delivery', service_category: 'on_demand' })).toBe(true);
    expect(isCustomerWebFoodService({ code: 'tembus_food', service_category: 'on_demand' })).toBe(true);
  });

  it('keeps parcel, aggregator, and roadside services available', () => {
    expect(isCustomerWebFoodService({ code: 'tembus_instant', service_category: 'package_on_demand' })).toBe(false);
    expect(isCustomerWebFoodService({ code: 'tembus_aggregator', service_category: 'aggregator' })).toBe(false);
    expect(isCustomerWebFoodService({ code: 'tambal_ban', name: 'Tambal Ban', service_category: 'on_demand' })).toBe(false);
  });
});
