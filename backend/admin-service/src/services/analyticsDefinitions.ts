export type CanonicalAnalyticsDefinition = {
  name: string;
  description: string;
  unit: string;
  numerator_event: string;
  denominator_event: string;
  source_of_truth: string;
  exclusions: string;
};

// This is the admin-service representation of the governed contract in
// docs/contracts/analytics-definitions-2026.md. Values are event-derived and
// must never be replaced with ad-hoc transactional-table queries by consumers.
export const CANONICAL_ANALYTICS_DEFINITIONS: readonly CanonicalAnalyticsDefinition[] = [
  {
    name: 'gmv',
    description: 'Gross customer order value for completed orders before refunds.',
    unit: 'minor currency units by market',
    numerator_event: 'order.completed.order_total_minor',
    denominator_event: 'order.completed',
    source_of_truth: 'canonical event stream',
    exclusions: 'cancelled orders and non-authoritative quote values',
  },
  {
    name: 'completed_order',
    description: 'Unique orders with one authoritative completed event.',
    unit: 'orders',
    numerator_event: 'order.completed',
    denominator_event: 'none',
    source_of_truth: 'canonical event stream',
    exclusions: 'duplicate event_id or replayed dedupe_key',
  },
  {
    name: 'cancellation_rate',
    description: 'Unique cancelled orders divided by created orders in the same cohort window.',
    unit: 'percent',
    numerator_event: 'order.cancelled',
    denominator_event: 'order.created',
    source_of_truth: 'canonical event stream',
    exclusions: 'duplicate events and cancellations after completion',
  },
  {
    name: 'refund_rate',
    description: 'Orders with an authoritative completed refund divided by completed orders.',
    unit: 'percent',
    numerator_event: 'refund.created with status=completed',
    denominator_event: 'order.completed',
    source_of_truth: 'canonical payment/refund event stream',
    exclusions: 'failed, pending, or duplicated refunds',
  },
  {
    name: 'active_courier',
    description: 'Distinct couriers whose latest canonical activity interval is active at the observation time.',
    unit: 'couriers',
    numerator_event: 'courier.active minus courier.inactive',
    denominator_event: 'none',
    source_of_truth: 'canonical event stream',
    exclusions: 'stale intervals beyond the market activity window',
  },
  {
    name: 'active_merchant',
    description: 'Distinct merchants whose latest canonical operating interval is active at the observation time.',
    unit: 'merchants',
    numerator_event: 'merchant.active minus merchant.inactive',
    denominator_event: 'none',
    source_of_truth: 'canonical event stream',
    exclusions: 'stale intervals beyond the market activity window',
  },
  {
    name: 'sla_compliance',
    description: 'Eligible completed service events delivered at or before their market SLA deadline.',
    unit: 'percent',
    numerator_event: 'sla.measured with met=true',
    denominator_event: 'sla.measured with eligible=true',
    source_of_truth: 'canonical event stream',
    exclusions: 'ineligible records, duplicate measurements, and missing deadlines',
  },
];
