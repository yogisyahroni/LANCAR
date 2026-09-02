type CoordinateLike = {
  lat?: unknown;
  lng?: unknown;
};

export type TowingBookingContractInput = {
  vehicleDetails?: Record<string, unknown> | null;
  recipientName?: unknown;
  recipientPhone?: unknown;
  pickupAddress?: unknown;
  dropoffAddress?: unknown;
  pickupLocation?: CoordinateLike | null;
  dropoffLocation?: CoordinateLike | null;
};

export type TowingBookingContractResult =
  | { valid: true }
  | { valid: false; code: string; message: string };

const requiredVehicleFields = ['type', 'make', 'model', 'condition', 'access_constraints'] as const;

const nonBlankString = (value: unknown, minimumLength: number) =>
  typeof value === 'string' && value.trim().length >= minimumLength;

const validCoordinate = (value: CoordinateLike | null | undefined) => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

const validPhone = (value: unknown) => {
  if (typeof value !== 'string') return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
};

export const validateTowingBookingContract = (
  input: TowingBookingContractInput,
): TowingBookingContractResult => {
  const vehicleDetails = input.vehicleDetails;
  const hasStructuredVehicleDetails = Boolean(vehicleDetails) && requiredVehicleFields.every((field) =>
    nonBlankString(vehicleDetails?.[field], 2)
  );
  if (!hasStructuredVehicleDetails) {
    return {
      valid: false,
      code: 'ERR_TOWING_DETAILS_REQUIRED',
      message: 'Detail kendaraan terstruktur wajib diisi untuk towing',
    };
  }

  if (!nonBlankString(input.recipientName, 2) || !validPhone(input.recipientPhone)) {
    return {
      valid: false,
      code: 'ERR_TOWING_CONTACT_REQUIRED',
      message: 'Nama dan nomor kontak tujuan wajib diisi untuk towing',
    };
  }

  if (!nonBlankString(input.pickupAddress, 6) || !nonBlankString(input.dropoffAddress, 6)) {
    return {
      valid: false,
      code: 'ERR_ORDER_ROUTE_REQUIRED',
      message: 'Alamat pickup dan tujuan towing wajib valid',
    };
  }

  if (!validCoordinate(input.pickupLocation) || !validCoordinate(input.dropoffLocation)) {
    return {
      valid: false,
      code: 'ERR_ORDER_ROUTE_REQUIRED',
      message: 'Koordinat pickup dan tujuan towing wajib valid',
    };
  }

  return { valid: true };
};
