export interface MarketplaceFairnessSnapshot {
  courierEarningsP10Idr: number;
  courierEarningsP50Idr: number;
  courierEarningsP95Idr: number;
  merchantTopSharePct: number;
  merchantHHI: number;
  noSupplyRatePct: number;
  customerPriceP50Idr: number;
  customerPriceP95Idr: number;
  cancellationRatePct: number;
  acceptanceRatePct: number;
  newSmallMerchantDiscoverySharePct: number;
  sampleSize: number;
}

export interface MarketplaceFairnessPolicy {
  version: string;
  maxCourierP10DropPct: number;
  maxMerchantTopSharePct: number;
  maxMerchantHHI: number;
  maxNoSupplyRatePct: number;
  maxCustomerPriceP95IncreasePct: number;
  maxCancellationIncreasePp: number;
  maxAcceptanceDropPp: number;
  minNewSmallMerchantDiscoverySharePct: number;
}

export const DEFAULT_MARKETPLACE_FAIRNESS_POLICY: MarketplaceFairnessPolicy = {
  version: 'marketplace-fairness-2026-v1',
  maxCourierP10DropPct: 10,
  maxMerchantTopSharePct: 45,
  maxMerchantHHI: 2500,
  maxNoSupplyRatePct: 20,
  maxCustomerPriceP95IncreasePct: 15,
  maxCancellationIncreasePp: 5,
  maxAcceptanceDropPp: 5,
  minNewSmallMerchantDiscoverySharePct: 10,
};

export interface FairnessViolation {
  metric: string;
  observed: number;
  threshold: number;
  direction: 'above' | 'below';
}

export interface MarketplaceExperimentDecision {
  approved: boolean;
  revenueUpliftPct: number;
  policyVersion: string;
  violations: FairnessViolation[];
}

const finiteNonNegative = (value: number, field: string): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return value;
};

const validateSnapshot = (snapshot: MarketplaceFairnessSnapshot, name: string): void => {
  if (!snapshot || !Number.isInteger(snapshot.sampleSize) || snapshot.sampleSize < 1) {
    throw new Error(`${name} requires a positive sample size`);
  }
  finiteNonNegative(snapshot.courierEarningsP10Idr, `${name}.courierEarningsP10Idr`);
  finiteNonNegative(snapshot.courierEarningsP50Idr, `${name}.courierEarningsP50Idr`);
  finiteNonNegative(snapshot.courierEarningsP95Idr, `${name}.courierEarningsP95Idr`);
  finiteNonNegative(snapshot.merchantTopSharePct, `${name}.merchantTopSharePct`);
  finiteNonNegative(snapshot.merchantHHI, `${name}.merchantHHI`);
  finiteNonNegative(snapshot.noSupplyRatePct, `${name}.noSupplyRatePct`);
  finiteNonNegative(snapshot.customerPriceP50Idr, `${name}.customerPriceP50Idr`);
  finiteNonNegative(snapshot.customerPriceP95Idr, `${name}.customerPriceP95Idr`);
  finiteNonNegative(snapshot.cancellationRatePct, `${name}.cancellationRatePct`);
  finiteNonNegative(snapshot.acceptanceRatePct, `${name}.acceptanceRatePct`);
  finiteNonNegative(snapshot.newSmallMerchantDiscoverySharePct, `${name}.newSmallMerchantDiscoverySharePct`);
};

const percentageIncrease = (baseline: number, candidate: number): number => {
  if (baseline <= 0) return candidate > 0 ? Number.POSITIVE_INFINITY : 0;
  return ((candidate - baseline) / baseline) * 100;
};

const percentageDrop = (baseline: number, candidate: number): number => {
  if (baseline <= 0) return 0;
  return ((baseline - candidate) / baseline) * 100;
};

/** Revenue is informational and can never override a failed harm guardrail. */
export const evaluateMarketplaceExperiment = (
  baseline: MarketplaceFairnessSnapshot,
  candidate: MarketplaceFairnessSnapshot,
  revenueUpliftPct: number,
  policy: MarketplaceFairnessPolicy = DEFAULT_MARKETPLACE_FAIRNESS_POLICY,
): MarketplaceExperimentDecision => {
  validateSnapshot(baseline, 'baseline');
  validateSnapshot(candidate, 'candidate');
  finiteNonNegative(revenueUpliftPct, 'revenueUpliftPct');

  const violations: FairnessViolation[] = [];
  const courierP10DropPct = percentageDrop(baseline.courierEarningsP10Idr, candidate.courierEarningsP10Idr);
  if (courierP10DropPct > policy.maxCourierP10DropPct) {
    violations.push({ metric: 'courier_earnings_p10_drop_pct', observed: courierP10DropPct, threshold: policy.maxCourierP10DropPct, direction: 'above' });
  }
  if (candidate.merchantTopSharePct > policy.maxMerchantTopSharePct) {
    violations.push({ metric: 'merchant_top_share_pct', observed: candidate.merchantTopSharePct, threshold: policy.maxMerchantTopSharePct, direction: 'above' });
  }
  if (candidate.merchantHHI > policy.maxMerchantHHI) {
    violations.push({ metric: 'merchant_hhi', observed: candidate.merchantHHI, threshold: policy.maxMerchantHHI, direction: 'above' });
  }
  if (candidate.noSupplyRatePct > policy.maxNoSupplyRatePct) {
    violations.push({ metric: 'no_supply_rate_pct', observed: candidate.noSupplyRatePct, threshold: policy.maxNoSupplyRatePct, direction: 'above' });
  }

  const customerPriceP95IncreasePct = percentageIncrease(baseline.customerPriceP95Idr, candidate.customerPriceP95Idr);
  if (customerPriceP95IncreasePct > policy.maxCustomerPriceP95IncreasePct) {
    violations.push({ metric: 'customer_price_p95_increase_pct', observed: customerPriceP95IncreasePct, threshold: policy.maxCustomerPriceP95IncreasePct, direction: 'above' });
  }
  const cancellationIncreasePp = candidate.cancellationRatePct - baseline.cancellationRatePct;
  if (cancellationIncreasePp > policy.maxCancellationIncreasePp) {
    violations.push({ metric: 'cancellation_rate_increase_pp', observed: cancellationIncreasePp, threshold: policy.maxCancellationIncreasePp, direction: 'above' });
  }
  const acceptanceDropPp = baseline.acceptanceRatePct - candidate.acceptanceRatePct;
  if (acceptanceDropPp > policy.maxAcceptanceDropPp) {
    violations.push({ metric: 'acceptance_rate_drop_pp', observed: acceptanceDropPp, threshold: policy.maxAcceptanceDropPp, direction: 'above' });
  }
  if (candidate.newSmallMerchantDiscoverySharePct < policy.minNewSmallMerchantDiscoverySharePct) {
    violations.push({ metric: 'new_small_merchant_discovery_share_pct', observed: candidate.newSmallMerchantDiscoverySharePct, threshold: policy.minNewSmallMerchantDiscoverySharePct, direction: 'below' });
  }

  return { approved: violations.length === 0, revenueUpliftPct, policyVersion: policy.version, violations };
};
