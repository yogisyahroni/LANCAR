import {
  buildCourierOnboardingChecklist,
  canTransitionCourierOnboarding,
  evaluateCourierActivation,
  isCourierDocumentEligible,
  resolveCourierDocumentStatus,
  resolveCourierOnboardingRequirements,
  validateCourierVehicleProfile,
} from './courierOnboardingPolicy';

describe('courier onboarding policy', () => {
  it('varies required onboarding by application channel and capability', () => {
    const regular = resolveCourierOnboardingRequirements({
      marketCode: 'id',
      applicationChannel: 'regular',
      serviceCategories: ['regular'],
    });
    const roadside = resolveCourierOnboardingRequirements({
      marketCode: 'id',
      applicationChannel: 'regular',
      serviceCategories: ['towing_motor'],
    });
    const onDemand = resolveCourierOnboardingRequirements({
      marketCode: 'id',
      applicationChannel: 'on_demand',
      serviceCategories: ['food_delivery'],
    });

    expect(regular.requiredDocuments).toContain('selfie');
    expect(regular.requiredDocuments).not.toContain('skck');
    expect(roadside.requiredDocuments).toContain('skpd');
    expect(roadside.requiredRules).toContain('skpd_tax_active');
    expect(onDemand.requiredDocuments).toEqual(expect.arrayContaining(['skck', 'face_enrollment']));
    expect(onDemand.requiredRules).toEqual(expect.arrayContaining(['vehicle_age_max_8_years', 'face_enrolled']));
  });

  it('passes a complete on-demand checklist and fails an incomplete one', () => {
    const complete = buildCourierOnboardingChecklist({
      marketCode: 'id',
      applicationChannel: 'on_demand',
      serviceCategories: ['food_delivery'],
      vehicleType: 'matic',
      vehiclePlate: 'B 1234 XYZ',
      vehicleYear: new Date().getFullYear() - 2,
      vehicleCc: 150,
      engineType: '4_tak',
      simActive: true,
      skpdTaxActive: true,
      documents: {
        ktp: 'ktp.jpg', sim: 'sim.jpg', stnk: 'stnk.jpg', skpd: 'skpd.jpg',
        vehicle_photo: 'vehicle.jpg', skck: 'skck.jpg', bank_account: 'bank.jpg',
        face_enrollment: 'face.jpg',
      },
    });
    const incomplete = buildCourierOnboardingChecklist({
      marketCode: 'id',
      applicationChannel: 'on_demand',
      vehicleType: 'matic',
      vehiclePlate: 'B 1234 XYZ',
      vehicleYear: new Date().getFullYear() - 2,
      vehicleCc: 150,
      engineType: '4_tak',
      simActive: false,
      skpdTaxActive: true,
      documents: {},
    });

    expect(complete.passed).toBe(true);
    expect(incomplete.passed).toBe(false);
    expect(evaluateCourierActivation({ checklist: complete, hasVehicle: true }).ready).toBe(true);
    expect(evaluateCourierActivation({ checklist: incomplete, hasVehicle: false })).toEqual(expect.objectContaining({
      ready: false,
      missing: ['onboarding_checklist', 'primary_vehicle'],
    }));
  });

  it('keeps activation behind the canonical state sequence', () => {
    expect(canTransitionCourierOnboarding('SUBMITTED', 'VERIFYING')).toBe(true);
    expect(canTransitionCourierOnboarding('VERIFYING', 'ACTIVE')).toBe(true);
    expect(canTransitionCourierOnboarding('DRAFT', 'ACTIVE')).toBe(false);
    expect(canTransitionCourierOnboarding('ACTIVE', 'REJECTED')).toBe(false);
  });

  it('removes expired and revoked documents from server-side eligibility', () => {
    const now = new Date('2026-09-08T10:00:00.000Z');

    expect(isCourierDocumentEligible({ documentStatus: 'verified', expiresAt: '2026-09-30' }, now)).toBe(true);
    expect(resolveCourierDocumentStatus({ documentStatus: 'verified', expiresAt: '2026-09-01' }, now)).toBe('expired');
    expect(isCourierDocumentEligible({ documentStatus: 'verified', expiresAt: '2026-09-01' }, now)).toBe(false);
    expect(resolveCourierDocumentStatus({ documentStatus: 'revoked' }, now)).toBe('revoked');
    expect(isCourierDocumentEligible({ documentStatus: 'revoked' }, now)).toBe(false);
  });

  it('normalizes structured vehicle attributes before activation', () => {
    const result = validateCourierVehicleProfile({
      plateNumber: ' b 1234 xyz ',
      vehicleType: 'motor',
      brand: 'Honda',
      model: 'Vario',
      productionYear: 2024,
      engineCc: 150,
      maxWeightKg: 20,
    }, new Date('2026-09-08T10:00:00.000Z'));

    expect(result.valid).toBe(true);
    expect(result.normalized).toEqual(expect.objectContaining({
      plateNumber: 'B 1234 XYZ',
      vehicleType: 'motor',
      maxWeightKg: 20,
    }));
    expect(validateCourierVehicleProfile({ vehicleType: 'motor', maxWeightKg: 0 }).valid).toBe(false);
  });
});
