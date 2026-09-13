export type ReputationAnalyticsObservation = {
  marketCode: string;
  serviceCode: string;
  stars: number;
  period: 'CURRENT' | 'PREVIOUS';
  ruleVersion: string;
  sourceType: string;
  featureNames?: string[];
};

export type ReputationAnalyticsSegment = {
  market_code: string;
  service_code: string;
  sample_size: number;
  average_stars: number | null;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  previous_sample_size: number;
  previous_average_stars: number | null;
  drift_stars: number | null;
  drift_status: 'STABLE' | 'WATCH' | 'ALERT';
  rule_versions: string[];
  source_types: string[];
};

const PROTECTED_ATTRIBUTE_NAMES = new Set([
  'age', 'birth_date', 'disability', 'gender', 'gender_identity', 'nationality',
  'race', 'religion', 'ethnicity', 'sexual_orientation', 'health',
]);

const round = (value: number): number => Math.round(value * 100) / 100;

const average = (values: number[]): number | null => values.length
  ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
  : null;

const emptyDistribution = (): Record<'1' | '2' | '3' | '4' | '5', number> => ({
  '1': 0,
  '2': 0,
  '3': 0,
  '4': 0,
  '5': 0,
});

export const validateReputationAnalyticsObservation = (observation: ReputationAnalyticsObservation): string[] => {
  const errors: string[] = [];
  if (!observation.marketCode || !observation.serviceCode) errors.push('market_and_service_required');
  if (!Number.isInteger(observation.stars) || observation.stars < 1 || observation.stars > 5) errors.push('stars_out_of_range');
  if (!observation.ruleVersion || !observation.sourceType) errors.push('rule_and_source_provenance_required');
  for (const name of observation.featureNames || []) {
    if (PROTECTED_ATTRIBUTE_NAMES.has(String(name).trim().toLowerCase())) errors.push('protected_attribute_not_allowed');
  }
  return errors;
};

export const reputationModerationDecision = (input: { modelSuggested: boolean; humanReviewed: boolean; fallbackAvailable: boolean }) => ({
  allowed: !input.modelSuggested || input.humanReviewed,
  human_review_required: input.modelSuggested,
  fallback: input.modelSuggested && !input.humanReviewed ? (input.fallbackAvailable ? 'QUEUE_FOR_REVIEW' : 'NO_MATERIAL_ENFORCEMENT') : 'NONE',
});

export const buildReputationAnalytics = (observations: ReputationAnalyticsObservation[]): ReputationAnalyticsSegment[] => {
  const valid = observations.filter((observation) => validateReputationAnalyticsObservation(observation).length === 0);
  const keys = [...new Set(valid.map((observation) => `${observation.marketCode}:${observation.serviceCode}`))].sort();
  return keys.map((key) => {
    const [marketCode, serviceCode] = key.split(':');
    const current = valid.filter((observation) => observation.marketCode === marketCode && observation.serviceCode === serviceCode && observation.period === 'CURRENT');
    const previous = valid.filter((observation) => observation.marketCode === marketCode && observation.serviceCode === serviceCode && observation.period === 'PREVIOUS');
    const currentAverage = average(current.map((observation) => observation.stars));
    const previousAverage = average(previous.map((observation) => observation.stars));
    const drift = currentAverage == null || previousAverage == null ? null : round(currentAverage - previousAverage);
    const distribution = emptyDistribution();
    for (const observation of current) distribution[String(observation.stars) as keyof typeof distribution] += 1;
    const driftStatus = drift == null || Math.abs(drift) < 0.5 ? 'STABLE' : Math.abs(drift) < 1 ? 'WATCH' : 'ALERT';
    return {
      market_code: marketCode,
      service_code: serviceCode,
      sample_size: current.length,
      average_stars: currentAverage,
      distribution,
      previous_sample_size: previous.length,
      previous_average_stars: previousAverage,
      drift_stars: drift,
      drift_status: driftStatus,
      rule_versions: [...new Set(current.concat(previous).map((observation) => observation.ruleVersion))].sort(),
      source_types: [...new Set(current.concat(previous).map((observation) => observation.sourceType))].sort(),
    };
  });
};
