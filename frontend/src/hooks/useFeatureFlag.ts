'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  evaluateFeatureFlag,
  evaluateFeatureFlagVariant,
  getCachedFeatureFlags,
  loadFeatureFlags,
  type FeatureFlagStateMap,
  type FeatureFlagVariant,
} from '../lib/featureFlags';

export interface UseFeatureFlagResult {
  enabled: boolean;
  variant: FeatureFlagVariant | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export const useFeatureFlag = (
  key: string,
  defaultValue = false
): UseFeatureFlagResult => {
  const [flags, setFlags] = useState<FeatureFlagStateMap>(() => getCachedFeatureFlags());
  const [isLoading, setIsLoading] = useState<boolean>(() => Object.keys(getCachedFeatureFlags()).length === 0);

  useEffect(() => {
    let active = true;

    loadFeatureFlags().then((result) => {
      if (!active) return;
      setFlags(result);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await loadFeatureFlags({ forceRefresh: true });
      setFlags(result);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    enabled: evaluateFeatureFlag(flags, key, defaultValue),
    variant: evaluateFeatureFlagVariant(flags, key),
    isLoading,
    refresh,
  };
};
