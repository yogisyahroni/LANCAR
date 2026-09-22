import { customerOrderStatusLabel } from './statusLabels';

describe('customerOrderStatusLabel', () => {
  it('uses technician vocabulary when only the canonical roadside category is present', () => {
    expect(customerOrderStatusLabel('accepted', null, 'tambal_ban')).toBe('Teknisi menerima order');
    expect(customerOrderStatusLabel('picking_up', null, 'tambal_ban')).toBe('Teknisi menuju lokasi');
    expect(customerOrderStatusLabel('completed', null, 'tambal_ban')).toBe('Layanan selesai');
  });

  it('uses towing vocabulary when the subtype identifies a towing order', () => {
    expect(customerOrderStatusLabel('accepted', 'towing_mobil')).toBe('Driver towing menerima order');
    expect(customerOrderStatusLabel('in_transit', 'towing_mobil')).toBe('Kendaraan dalam proses towing');
  });

  it('preserves parcel and food vocabulary for their own services', () => {
    expect(customerOrderStatusLabel('accepted', 'instant_package')).toBe('Kurir menerima order');
    expect(customerOrderStatusLabel('picking_up', 'food_delivery')).toBe('Kurir menuju merchant');
  });
});
