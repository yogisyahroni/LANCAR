import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export interface RuntimeConfig {
  insurance_premium_rate: number;
  insurance_min_premium: number;
  insurance_max_coverage: number;
  surge_demand_multiplier_step: number;
  surge_demand_ratio_threshold: number;
  surge_max_multiplier: number;
  tax_rate: number;
  topup_denominations?: string[];
  topup_min_amount?: number;
  withdraw_min_amount?: number;
  withdraw_fee?: number;
  [key: string]: any;
}

export function useRuntimeConfig() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchConfig() {
      try {
        const response = await api.get('/config/runtime');
        if (isMounted && response.data?.data) {
          setConfig(response.data.data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  return { config, isLoading, error };
}
