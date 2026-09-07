export const COURIER_SCORECARD_VERSION = 'courier-quality-2026-v1';

export type CourierScorecardMetricDefinition = {
  code: string;
  label: string;
  definition: string;
  window: '30d' | '90d';
  unit: 'percent' | 'rating' | 'count';
  visible_to_courier: true;
  enforcement: 'material_decision' | 'review_only';
  service_scoped: boolean;
};

export const COURIER_SCORECARD_METRICS: CourierScorecardMetricDefinition[] = [
  {
    code: 'completion_rate',
    label: 'Completion rate',
    definition: 'Pekerjaan yang selesai dibagi pekerjaan berstatus terminal yang sudah diterima kurir.',
    window: '30d',
    unit: 'percent',
    visible_to_courier: true,
    enforcement: 'material_decision',
    service_scoped: true,
  },
  {
    code: 'preventable_cancellation_rate',
    label: 'Preventable cancellation',
    definition: 'Pembatalan setelah pekerjaan diterima yang memiliki catatan pelanggaran preventable yang sudah tercatat.',
    window: '30d',
    unit: 'percent',
    visible_to_courier: true,
    enforcement: 'material_decision',
    service_scoped: true,
  },
  {
    code: 'pickup_delivery_sla',
    label: 'Pickup/delivery SLA',
    definition: 'Leg delivery selesai pada atau sebelum sla_deadline server; timestamp client tidak dipakai sebagai sumber kebenaran.',
    window: '30d',
    unit: 'percent',
    visible_to_courier: true,
    enforcement: 'material_decision',
    service_scoped: true,
  },
  {
    code: 'proof_quality',
    label: 'Proof quality',
    definition: 'Bukti delivery yang diterima server dibandingkan seluruh percobaan bukti delivery kurir.',
    window: '30d',
    unit: 'percent',
    visible_to_courier: true,
    enforcement: 'material_decision',
    service_scoped: true,
  },
  {
    code: 'customer_rating',
    label: 'Customer rating',
    definition: 'Rata-rata rating customer; rating yang terdeteksi anomali tidak otomatis menurunkan score enforcement dan wajib ditinjau.',
    window: '90d',
    unit: 'rating',
    visible_to_courier: true,
    enforcement: 'material_decision',
    service_scoped: false,
  },
  {
    code: 'safety_support_incidents',
    label: 'Safety/support incidents',
    definition: 'Insiden resolved/dismissed dalam 90 hari; hanya insiden dengan quality_impact eksplisit yang dapat menjadi sinyal review.',
    window: '90d',
    unit: 'count',
    visible_to_courier: true,
    enforcement: 'review_only',
    service_scoped: false,
  },
];

export const COURIER_SCORECARD_APPEAL_POLICY = {
  available: true,
  material_decisions_appealable: true,
  route: '/api/v1/courier/performance/appeals',
  review_timeline: 'Tim operasional meninjau bukti dan memberi keputusan pada riwayat appeal.',
  score_snapshot_server_authoritative: true,
} as const;

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const percentage = (numerator: unknown, denominator: unknown): number | null => {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return null;
  return round(Math.max(0, Math.min(100, (top / bottom) * 100)), 2);
};

export type CourierRatingSummary = {
  average_rating: number;
  score_rating: number;
  rating_count: number;
  anomalous_rating_count: number;
  anomaly_review_required: boolean;
  anomaly_policy: string;
};

/**
 * A rating anomaly is a review signal, never an opaque one-rating penalty.
 * The stable average is used for the quality score when exactly one value is
 * materially away from the cohort median. The raw average remains visible.
 */
export const summarizeCourierRatings = (values: unknown[]): CourierRatingSummary => {
  const ratings = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);

  if (ratings.length === 0) {
    return {
      average_rating: 5,
      score_rating: 5,
      rating_count: 0,
      anomalous_rating_count: 0,
      anomaly_review_required: false,
      anomaly_policy: 'Belum ada rating yang dapat dinilai.',
    };
  }

  const sorted = [...ratings].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const anomalies = ratings.filter((rating) => Math.abs(rating - median) >= 2);
  const stableRatings = anomalies.length === 1
    ? ratings.filter((rating) => Math.abs(rating - median) < 2)
    : ratings;
  const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
  const scoreAverage = stableRatings.length > 0
    ? stableRatings.reduce((sum, rating) => sum + rating, 0) / stableRatings.length
    : average;

  return {
    average_rating: round(average),
    score_rating: round(scoreAverage),
    rating_count: ratings.length,
    anomalous_rating_count: anomalies.length,
    anomaly_review_required: anomalies.length > 0,
    anomaly_policy: anomalies.length > 0
      ? 'Rating anomali ditandai untuk review dan tidak otomatis menjadi hukuman atau menurunkan score enforcement.'
      : 'Tidak ada rating anomali yang terdeteksi pada window ini.',
  };
};

export type CourierQualityScorecardInput = {
  completion_rate_pct: number | null;
  preventable_cancellation_rate_pct: number | null;
  pickup_delivery_sla_pct: number | null;
  proof_quality_pct: number | null;
  ratings: unknown[];
  reviewed_safety_incidents: number;
  quality_impact_safety_incidents: number;
};

export type CourierQualityScorecard = {
  version: string;
  score: number | null;
  status: 'advisory' | 'review_required' | 'insufficient_data';
  enforcement_eligible: boolean;
  material_decision_requires_review: boolean;
  rating: CourierRatingSummary;
  reviewed_safety_incidents: number;
  quality_impact_safety_incidents: number;
  metrics: Array<CourierScorecardMetricDefinition & { value: number | null; eligible: boolean }>;
  appeal_policy: typeof COURIER_SCORECARD_APPEAL_POLICY;
};

export const buildCourierQualityScorecard = (
  input: CourierQualityScorecardInput,
): CourierQualityScorecard => {
  const rating = summarizeCourierRatings(input.ratings);
  const values: Record<string, number | null> = {
    completion_rate: input.completion_rate_pct,
    preventable_cancellation_rate: input.preventable_cancellation_rate_pct,
    pickup_delivery_sla: input.pickup_delivery_sla_pct,
    proof_quality: input.proof_quality_pct,
    customer_rating: rating.rating_count > 0 ? rating.score_rating : null,
    safety_support_incidents: input.reviewed_safety_incidents,
  };
  const weights: Record<string, number> = {
    completion_rate: 25,
    preventable_cancellation_rate: 20,
    pickup_delivery_sla: 20,
    proof_quality: 15,
    customer_rating: 20,
  };
  const scoredMetrics = Object.entries(weights)
    .map(([code, weight]) => ({
      code,
      weight,
      value: code === 'preventable_cancellation_rate' && values[code] !== null
        ? 100 - values[code]!
        : code === 'customer_rating' && values[code] !== null
          ? values[code]! * 20
          : values[code],
    }))
    .filter((metric) => metric.value !== null && Number.isFinite(metric.value));
  const weightTotal = scoredMetrics.reduce((sum, metric) => sum + metric.weight, 0);
  const score = weightTotal > 0
    ? round(scoredMetrics.reduce((sum, metric) => sum + (metric.value! * metric.weight), 0) / weightTotal)
    : null;
  const reviewRequired = rating.anomaly_review_required;

  return {
    version: COURIER_SCORECARD_VERSION,
    score,
    status: reviewRequired ? 'review_required' : score === null ? 'insufficient_data' : 'advisory',
    enforcement_eligible: score !== null && !reviewRequired,
    material_decision_requires_review: reviewRequired,
    rating,
    reviewed_safety_incidents: input.reviewed_safety_incidents,
    quality_impact_safety_incidents: input.quality_impact_safety_incidents,
    metrics: COURIER_SCORECARD_METRICS.map((definition) => ({
      ...definition,
      value: values[definition.code] ?? null,
      eligible: values[definition.code] !== null && Number.isFinite(values[definition.code] as number),
    })),
    appeal_policy: COURIER_SCORECARD_APPEAL_POLICY,
  };
};

export type CourierServiceMetricRow = {
  service_code: string;
  service_label?: string;
  total_assignments: unknown;
  completed_deliveries: unknown;
  cancelled_deliveries: unknown;
  preventable_cancellations: unknown;
  sla_eligible: unknown;
  sla_met: unknown;
  proof_attempts: unknown;
  proof_accepted: unknown;
};

const serviceLabel = (serviceCode: string) => {
  const labels: Record<string, string> = {
    food_delivery: 'Food delivery',
    on_demand: 'On-demand',
    regular: 'Regular delivery',
    tambal_ban: 'Tambal ban',
    towing: 'Towing',
  };
  return labels[serviceCode] || serviceCode.replace(/[_-]+/g, ' ');
};

export const buildCourierServiceMetrics = (rows: CourierServiceMetricRow[]) => rows.map((row) => ({
  service_code: String(row.service_code || 'delivery'),
  service_label: row.service_label || serviceLabel(String(row.service_code || 'delivery')),
  window: '30d' as const,
  total_assignments: Number(row.total_assignments || 0),
  completion_rate_pct: percentage(row.completed_deliveries, Number(row.completed_deliveries || 0) + Number(row.cancelled_deliveries || 0)),
  preventable_cancellation_rate_pct: percentage(row.preventable_cancellations, row.cancelled_deliveries),
  pickup_delivery_sla_pct: percentage(row.sla_met, row.sla_eligible),
  proof_quality_pct: percentage(row.proof_accepted, row.proof_attempts),
  metric_definitions: COURIER_SCORECARD_METRICS.filter((metric) => metric.service_scoped),
}));
