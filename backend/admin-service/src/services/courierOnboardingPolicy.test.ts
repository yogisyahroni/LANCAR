import {
  buildCourierOnboardingChecklist,
  canTransitionCourierOnboarding,
  evaluateCourierActivation,
  resolveCourierOnboardingRequirements,
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
});

