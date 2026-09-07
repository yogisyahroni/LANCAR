export const COURIER_ONBOARDING_POLICY_VERSION = 'courier-profile-v1';

export const COURIER_ONBOARDING_STATES = [
  'DRAFT',
  'SUBMITTED',
  'VERIFYING',
  'ACTIVE',
  'REJECTED',
  'NEEDS_UPDATE',
  'SUSPENDED',
  'DEACTIVATED',
] as const;

export type CourierOnboardingState = typeof COURIER_ONBOARDING_STATES[number];

export const COURIER_ONBOARDING_TRANSITIONS: Record<CourierOnboardingState, readonly CourierOnboardingState[]> = {
  DRAFT: ['DRAFT', 'SUBMITTED', 'DEACTIVATED'],
  SUBMITTED: ['SUBMITTED', 'VERIFYING', 'REJECTED', 'NEEDS_UPDATE'],
  VERIFYING: ['VERIFYING', 'ACTIVE', 'REJECTED', 'NEEDS_UPDATE'],
  ACTIVE: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'],
  REJECTED: ['REJECTED', 'DRAFT', 'SUBMITTED', 'NEEDS_UPDATE'],
  NEEDS_UPDATE: ['NEEDS_UPDATE', 'DRAFT', 'SUBMITTED', 'REJECTED'],
  SUSPENDED: ['SUSPENDED', 'ACTIVE', 'DEACTIVATED'],
  DEACTIVATED: ['DEACTIVATED'],
};

const BASE_REQUIRED_DOCUMENTS = ['ktp', 'sim', 'stnk', 'vehicle_photo', 'bank_account'] as const;
const ON_DEMAND_REQUIRED_DOCUMENTS = ['skpd', 'skck', 'face_enrollment'] as const;
const REGULAR_REQUIRED_DOCUMENTS = ['selfie'] as const;

export type CourierOnboardingInput = {
  marketCode?: unknown;
  applicationChannel?: unknown;
  serviceCategories?: unknown;
  vehicleCategory?: unknown;
  vehicleType?: unknown;
  vehiclePlate?: unknown;
  vehicleYear?: unknown;
  vehicleCc?: unknown;
  engineType?: unknown;
  simActive?: unknown;
  skpdTaxActive?: unknown;
  documents?: Record<string, unknown> | null;
};

export type CourierOnboardingRequirements = {
  marketCode: string;
  applicationChannel: 'on_demand' | 'regular';
  serviceCategories: string[];
  requiredDocuments: string[];
  requiredRules: string[];
};

const normalizedString = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const normalizedServiceCategories = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(values.map(normalizedString).filter(Boolean)));
};

export const resolveCourierOnboardingRequirements = (input: CourierOnboardingInput): CourierOnboardingRequirements => {
  const marketCode = normalizedString(input.marketCode) || 'id';
  const applicationChannel = normalizedString(input.applicationChannel) === 'regular' ? 'regular' : 'on_demand';
  const serviceCategories = normalizedServiceCategories(input.serviceCategories);
  if (serviceCategories.length === 0) {
    serviceCategories.push(applicationChannel);
  }

  const requiredDocuments = new Set<string>(BASE_REQUIRED_DOCUMENTS);
  const requiredRules = new Set<string>(['vehicle_plate_present', 'vehicle_type_supported', 'market_supported']);

  if (applicationChannel === 'on_demand') {
    ON_DEMAND_REQUIRED_DOCUMENTS.forEach((documentType) => requiredDocuments.add(documentType));
    requiredRules.add('sim_active');
  } else {
    REGULAR_REQUIRED_DOCUMENTS.forEach((documentType) => requiredDocuments.add(documentType));
  }

  const isRoadside = serviceCategories.some((category) =>
    category.startsWith('tambal_ban') || category.startsWith('towing') || category === 'roadside'
  );
  if (isRoadside) {
    requiredDocuments.add('skpd');
    requiredRules.add('skpd_tax_active');
  }

  const isFood = serviceCategories.some((category) => category === 'food_delivery' || category === 'food');
  if (isFood) {
    requiredDocuments.add('face_enrollment');
    requiredRules.add('face_enrolled');
  }

  if (applicationChannel === 'on_demand') {
    requiredRules.add('vehicle_age_max_8_years');
    requiredRules.add('vehicle_cc_max_250');
    requiredRules.add('four_stroke_engine');
    requiredRules.add('not_trail_sport_touring');
  }

  return {
    marketCode,
    applicationChannel,
    serviceCategories,
    requiredDocuments: Array.from(requiredDocuments),
    requiredRules: Array.from(requiredRules),
  };
};

const toBoolean = (value: unknown): boolean => value === true || value === 'true' || value === 1 || value === '1';

export const buildCourierOnboardingChecklist = (input: CourierOnboardingInput): Record<string, unknown> => {
  const requirements = resolveCourierOnboardingRequirements(input);
  const registrationYear = new Date().getFullYear();
  const vehicleYear = Number(input.vehicleYear || 0);
  const vehicleCc = Number(input.vehicleCc || 0);
  const vehicleCategory = normalizedString(input.vehicleCategory);
  const vehicleType = normalizedString(input.vehicleType);
  const engineType = normalizedString(input.engineType);
  const documents = input.documents || {};
  const vehicleAge = vehicleYear > 0 ? registrationYear - vehicleYear : null;

  const documentChecks = Object.fromEntries(
    requirements.requiredDocuments.map((documentType) => [documentType, Boolean(documents[documentType])])
  );
  const rules: Record<string, boolean> = {
    vehicle_plate_present: Boolean(normalizedString(input.vehiclePlate)),
    vehicle_type_supported: Boolean(vehicleType || vehicleCategory),
    market_supported: requirements.marketCode === 'id' || requirements.marketCode.startsWith('id-'),
    sim_active: toBoolean(input.simActive),
    skpd_tax_active: toBoolean(input.skpdTaxActive),
    vehicle_age_max_8_years: vehicleAge !== null && vehicleAge >= 0 && vehicleAge <= 8,
    vehicle_cc_max_250: vehicleCc > 0 && vehicleCc <= 250,
    four_stroke_engine: ['4_tak', '4tak', '4 stroke', '4-stroke'].includes(engineType),
    not_trail_sport_touring: !['trail', 'sport', 'touring'].includes(vehicleCategory),
    face_enrolled: Boolean(documents.face_enrollment),
  };

  const passed = requirements.requiredDocuments.every((documentType) => documentChecks[documentType] === true)
    && requirements.requiredRules.every((rule) => rules[rule] === true);

  return {
    policy_version: COURIER_ONBOARDING_POLICY_VERSION,
    market_code: requirements.marketCode,
    application_channel: requirements.applicationChannel,
    service_categories: requirements.serviceCategories,
    required_documents: requirements.requiredDocuments,
    required_rules: requirements.requiredRules,
    documents: documentChecks,
    rules,
    passed,
    summary: {
      registration_year: registrationYear,
      vehicle_age_years: vehicleAge,
      vehicle_cc: vehicleCc,
      vehicle_category: vehicleCategory,
      engine_type: engineType,
    },
  };
};

export const isCourierChecklistPassed = (checklist: any): boolean => {
  if (checklist?.passed === true) return true;
  const requiredDocuments = Array.isArray(checklist?.required_documents) ? checklist.required_documents : [];
  const requiredRules = Array.isArray(checklist?.required_rules) ? checklist.required_rules : [];
  const documents = checklist?.documents || {};
  const rules = checklist?.rules || {};
  return requiredDocuments.length > 0
    && requiredRules.length > 0
    && requiredDocuments.every((documentType: string) => documents[documentType] === true)
    && requiredRules.every((rule: string) => rules[rule] === true);
};

export type CourierActivationInput = {
  checklist: unknown;
  hasVehicle: boolean;
  hasHomeOrOperatingZone?: boolean;
};

export const evaluateCourierActivation = (input: CourierActivationInput) => {
  const missing: string[] = [];
  if (!isCourierChecklistPassed(input.checklist)) missing.push('onboarding_checklist');
  if (!input.hasVehicle) missing.push('primary_vehicle');
  return {
    ready: missing.length === 0,
    missing,
    remediation: missing.length > 0
      ? 'Lengkapi onboarding sesuai market dan capability lalu kirim ulang untuk review.'
      : null,
  };
};

export const canTransitionCourierOnboarding = (
  from: CourierOnboardingState,
  to: CourierOnboardingState
): boolean => COURIER_ONBOARDING_TRANSITIONS[from]?.includes(to) === true;
