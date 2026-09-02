import {
  normalizeServiceCategory,
  toCanonicalOrderContract,
  withCanonicalOrderContract,
} from './orderContract';

describe('canonical order contract', () => {
  it('maps legacy service values without replacing the detail fields', () => {
    expect(normalizeServiceCategory({ service_category: 'food_delivery', service_sub_type: 'food_delivery' })).toBe('food');
    expect(normalizeServiceCategory({ service_sub_type: 'towing_mobil' })).toBe('towing');
    expect(normalizeServiceCategory({ model: 'aggregator', logistics_provider: 'jne' })).toBe('aggregator');
    expect(normalizeServiceCategory({ model: 'unknown_future_model' })).toBeNull();
  });

  it('builds typed metadata only from persisted order facts', () => {
    const contract = toCanonicalOrderContract({
      id: 'order-1',
      customer_id: 'customer-1',
      model: 'aggregator',
      service_code: 'jne_reg',
      logistics_provider: 'jne',
      logistics_service_type: 'REG',
      logistics_tariff_idr: 18000,
      logistics_net_cost_idr: 14000,
      status: 'pending_assignment',
      total_price_idr: 18000,
      state_version: 3,
    });

    expect(contract.service.category).toBe('aggregator');
    expect(contract.service.service_code).toBe('jne_reg');
    expect(contract.service.metadata.aggregator).toEqual({
      provider: 'jne',
      service_type: 'REG',
      tariff_idr: 18000,
      net_cost_idr: 14000,
      awb_number: null,
    });
    expect(contract.order_state.state_version).toBe(3);
  });

  it('keeps unknown services degraded-safe and preserves legacy response fields', () => {
    const result = withCanonicalOrderContract({ id: 'order-2', model: 'future_service', status: 'unknown' });
    expect(result.service_category).toBeNull();
    expect(result.order_contract.service.degraded).toBe(true);
    expect(result.order_contract.service.metadata).toEqual({});
    expect(result.id).toBe('order-2');
  });
});
