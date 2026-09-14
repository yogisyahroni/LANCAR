import { formatCustomerOrderNumber } from './orderNumber';

describe('formatCustomerOrderNumber', () => {
  it('keeps concurrent orders unique when they share a timestamp', () => {
    const first = formatCustomerOrderNumber(1789392400000, 41);
    const second = formatCustomerOrderNumber(1789392400000, 42);

    expect(first).toBe('TMB-400000-000041');
    expect(second).toBe('TMB-400000-000042');
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(30);
  });

  it('does not truncate a sequence after the display padding width', () => {
    expect(formatCustomerOrderNumber(1789392400000, '123456789')).toBe('TMB-400000-123456789');
  });
});
