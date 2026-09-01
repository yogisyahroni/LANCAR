import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface TariffRequest {
  provider?: string;
  origin_code?: string;
  destination_code?: string;
  weight_kg?: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  item_value_idr?: number;
  category?: string;
  insurance?: boolean;
  cod?: boolean;
  // Legacy coordinate fields remain optional for existing callers.
  origin_lat?: number;
  origin_lng?: number;
  dest_lat?: number;
  dest_lng?: number;
  weight?: number;
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
  quote_id?: string;
  eta_source?: string;
  customer_tariff_idr?: number;
}

export const useLogisticsTariff = (request: TariffRequest | null, enabled: boolean = true) => {
  return useQuery<TariffResponse[]>({
    queryKey: ['logistics-tariff', request],
    queryFn: async () => {
      if (!request) return [];
      
      const response = await api.get('/logistics/tariff', {
        params: request,
      });
      const payload = response.data?.data ?? response.data;
      const services = Array.isArray(payload) ? payload : payload?.services || [];
      return services.map((service: any) => ({
        provider_code: request.provider || payload?.provider || '',
        provider_name: payload?.provider || request.provider || '',
        service_code: service.service_code,
        service_name: service.service_name,
        description: service.service_name || '',
        etd: service.etd || service.estimated_days || '',
        eta_source: service.eta_source || service.etd_source || '',
        price: Number(service.customer_tariff_idr || service.tariff_gross || service.price || 0),
        original_price: Number(service.tariff_gross || service.original_price || 0),
        customer_tariff_idr: Number(service.customer_tariff_idr || service.price || 0),
        quote_id: service.quote_id,
      } as TariffResponse));
    },
    enabled: enabled && !!request && (!!request.origin_code || !!request.origin_lat) && (!!request.destination_code || !!request.dest_lat) && !!(request.weight_kg || request.weight),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};
