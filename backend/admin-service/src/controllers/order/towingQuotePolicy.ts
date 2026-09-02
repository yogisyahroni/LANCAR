export type TowingQuoteConsentInput = {
  submittedTotalIdr: number;
  trustedTotalIdr: number;
  quoteGeneratedAt: string | null | undefined;
  submittedSnapshotHash?: string | null;
  trustedSnapshotHash?: string | null;
  consent: boolean;
  nowMs?: number;
};

export type TowingQuoteConsentResult = {
  requiresConsent: boolean;
  priceDeltaIdr: number;
  expired: boolean;
  routeChanged: boolean;
};

export const evaluateTowingQuoteConsent = ({
  submittedTotalIdr,
  trustedTotalIdr,
  quoteGeneratedAt,
  submittedSnapshotHash,
  trustedSnapshotHash,
  consent,
  nowMs = Date.now(),
}: TowingQuoteConsentInput): TowingQuoteConsentResult => {
  const priceDeltaIdr = Math.max(0, trustedTotalIdr - submittedTotalIdr);
  const generatedAtMs = Date.parse(String(quoteGeneratedAt || ''));
  const expired = !Number.isFinite(generatedAtMs) || nowMs - generatedAtMs > 10 * 60 * 1000;
  const routeChanged = Boolean(
    submittedSnapshotHash && trustedSnapshotHash && submittedSnapshotHash !== trustedSnapshotHash
  );
  const materialIncreaseThreshold = Math.max(10000, Math.round(Math.max(1, submittedTotalIdr || trustedTotalIdr) * 0.1));

  return {
    requiresConsent: !consent && (priceDeltaIdr >= materialIncreaseThreshold || expired || routeChanged),
    priceDeltaIdr,
    expired,
    routeChanged,
  };
};
