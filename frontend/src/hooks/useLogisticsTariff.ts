import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface TariffRequest {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  weight: number;
  dimension?: string; // e.g. "10x10x10"
}

export interface TariffResponse {
  provider_code: string;
  provider_name: string;
  service_code: string;
  service_name: string;
  description: string;
  etd: string;
  price: number;
  original_price: number;
}

export const useLogisticsTariff = (request: TariffRequest | null, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['logistics-tariff', request],
    queryFn: async () => {
      if (!request) return [];
      
      const response = await api.get('/logistics/tariff', {
        params: request,
      });
      return response.data as TariffResponse[];
    },
    enabled: enabled && !!request && !!request.origin_lat && !!request.origin_lng && !!request.dest_lat && !!request.dest_lng && !!request.weight,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};
