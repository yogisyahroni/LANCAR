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
        <h3 className="text-sm font-medium text-gray-700">Pilih Layanan Kurir</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4 flex items-center space-x-4 animate-pulse">
              <div className="w-12 h-12 bg-gray-200 rounded-md"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
              <div className="h-5 bg-gray-200 rounded w-1/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 text-red-600 rounded-lg text-sm ${className}`}>
        Gagal memuat layanan kurir. Silakan coba lagi.
      </div>
    );
  }

  if (!tariffs || tariffs.length === 0) {
    return (
      <div className={`p-4 bg-gray-50 text-gray-500 rounded-lg text-sm text-center ${className}`}>
        {request ? 'Tidak ada layanan kurir yang tersedia untuk rute ini.' : 'Isi alamat penjemputan dan pengiriman terlebih dahulu untuk melihat tarif.'}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-sm font-medium text-gray-700">Pilih Layanan Kurir</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tariffs.map((tariff) => {
          const isSelected = selectedCode === tariff.service_code;
          return (
            <div
              key={tariff.service_code}
              onClick={() => onSelect(tariff)}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-white rounded flex items-center justify-center p-1 border shadow-sm">
                    {/* Render logo based on provider */}
                    {tariff.provider_code === 'JNE' ? (
                      <span className="text-blue-800 font-bold text-xs">JNE</span>
                    ) : tariff.provider_code === 'JNT' ? (
                      <span className="text-red-600 font-bold text-xs">J&T</span>
                    ) : (
                      <span className="text-gray-500 font-bold text-xs">{tariff.provider_code}</span>
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{tariff.service_name}</h4>
                    <p className="text-xs text-gray-500 mt-1">Estimasi: {tariff.etd}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{tariff.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  {tariff.original_price > tariff.price && (
                    <p className="text-xs text-gray-400 line-through mb-1">
                      Rp {tariff.original_price.toLocaleString('id-ID')}
                    </p>
                  )}
                  <p className="font-bold text-gray-900">
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
