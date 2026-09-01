import { validateTowingBookingContract } from './towingBookingContract';

const validInput = () => ({
  vehicleDetails: {
    type: 'mobil',
    make: 'Toyota',
    model: 'Avanza',
    condition: 'Tidak bisa menyala',
    access_constraints: 'Masuk gang 3 meter',
  },
  recipientName: 'Bengkel Tujuan',
  recipientPhone: '+6281234567890',
  pickupAddress: 'Jl. Melati No. 10, Jakarta',
  dropoffAddress: 'Jl. Mawar No. 20, Jakarta',
  pickupLocation: { lat: -6.2, lng: 106.8 },
  dropoffLocation: { lat: -6.21, lng: 106.81 },
});

describe('validateTowingBookingContract', () => {
  it('accepts a real structured towing booking contract', () => {
    expect(validateTowingBookingContract(validInput())).toEqual({ valid: true });
  });

  it.each([
    ['vehicle details', { vehicleDetails: { type: 'mobil' } }, 'ERR_TOWING_DETAILS_REQUIRED'],
    ['destination name', { recipientName: 'x' }, 'ERR_TOWING_CONTACT_REQUIRED'],
    ['destination phone', { recipientPhone: '' }, 'ERR_TOWING_CONTACT_REQUIRED'],
    ['pickup address', { pickupAddress: 'short' }, 'ERR_ORDER_ROUTE_REQUIRED'],
    ['destination coordinates', { dropoffLocation: { lat: 0, lng: 106.81 } }, 'ERR_ORDER_ROUTE_REQUIRED'],
  ])('rejects invalid %s without accepting a placeholder fallback', (_label, override, code) => {
    const result = validateTowingBookingContract({ ...validInput(), ...override });
    expect(result).toMatchObject({ valid: false, code });
  });

  it('accepts formatted phone numbers while enforcing a real contact digit count', () => {
    expect(validateTowingBookingContract({ ...validInput(), recipientPhone: '+62 812-3456-7890' })).toEqual({ valid: true });
    expect(validateTowingBookingContract({ ...validInput(), recipientPhone: '12345' })).toMatchObject({
      valid: false,
      code: 'ERR_TOWING_CONTACT_REQUIRED',
    });
  });
});
