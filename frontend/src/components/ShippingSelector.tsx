import React from 'react';
import { useLogisticsTariff, TariffRequest, TariffResponse } from '../hooks/useLogisticsTariff';
import { Loader2 } from 'lucide-react';

interface ShippingSelectorProps {
  request: TariffRequest | null;
  onSelect: (tariff: TariffResponse) => void;
  selectedCode?: string;
  className?: string;
}

export const ShippingSelector: React.FC<ShippingSelectorProps> = ({ request, onSelect, selectedCode, className = '' }) => {
  const { data: tariffs, isLoading, error } = useLogisticsTariff(request);

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <h3 className="text-sm font-medium text-foreground-muted">Pilih Layanan Kurir</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4 flex items-center space-x-4 animate-pulse">
              <div className="w-12 h-12 bg-surface-subtle rounded-md"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-surface-subtle rounded w-1/2"></div>
                <div className="h-3 bg-surface-subtle rounded w-1/3"></div>
              </div>
              <div className="h-5 bg-surface-subtle rounded w-1/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-error text-on-error rounded-lg text-sm ${className}`}>
        Gagal memuat layanan kurir. Silakan coba lagi.
      </div>
    );
  }

  if (!tariffs || tariffs.length === 0) {
    return (
      <div className={`p-4 bg-surface-subtle text-foreground-muted rounded-lg text-sm text-center ${className}`}>
        {request ? 'Tidak ada layanan kurir yang tersedia untuk rute ini.' : 'Isi alamat penjemputan dan pengiriman terlebih dahulu untuk melihat tarif.'}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-sm font-medium text-foreground-muted">Pilih Layanan Kurir</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tariffs.map((tariff) => {
          const isSelected = selectedCode === tariff.service_code;
          return (
            <div
              key={tariff.service_code}
              onClick={() => onSelect(tariff)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(tariff);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`Pilih layanan ${tariff.service_name}`}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-info'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-surface rounded flex items-center justify-center p-1 border shadow-sm">
                    {/* Render logo based on provider */}
                    {tariff.provider_code === 'JNE' ? (
                      <span className="text-info font-bold text-xs">JNE</span>
                    ) : tariff.provider_code === 'JNT' ? (
                      <span className="text-error font-bold text-xs">J&T</span>
                    ) : (
                      <span className="text-foreground-muted font-bold text-xs">{tariff.provider_code}</span>
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground-muted">{tariff.service_name}</h4>
                    <p className="text-xs text-foreground-muted mt-1">Estimasi: {tariff.etd}</p>
                    <p className="text-xs text-foreground-muted mt-0.5 line-clamp-1" title={tariff.description}>{tariff.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  {tariff.original_price > tariff.price && (
                    <p className="text-xs text-foreground-muted line-through mb-1">
                      Rp {tariff.original_price.toLocaleString('id-ID')}
                    </p>
                  )}
                  <p className="font-bold text-foreground-muted">
                    Rp {tariff.price.toLocaleString('id-ID')}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
