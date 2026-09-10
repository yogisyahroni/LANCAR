import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { StatusBadge } from './StatusBadge'

type ServiceCapability = {
  service_code: string
  service_name: string
  status: string
  price_amount?: number
}

type CourierCapabilitiesProps = {
  courierId: string
  capabilities: ServiceCapability[]
}

const availableServices = [
  { code: 'on_demand', name: 'Antar Barang (On Demand)' },
  { code: 'tambal_ban_motor', name: 'Tambal Ban Motor' },
  { code: 'tambal_ban_mobil', name: 'Tambal Ban Mobil' },
  { code: 'towing_motor', name: 'Towing Motor' },
  { code: 'towing_mobil', name: 'Towing Mobil' }
]

export default function ServiceCapabilities({ courierId, capabilities }: CourierCapabilitiesProps) {
  const queryClient = useQueryClient()
  const [selectedServices, setSelectedServices] = useState<string[]>(
    capabilities.map(c => c.service_code)
  )
  const [prices, setPrices] = useState<Record<string, number>>(
    capabilities.reduce((acc, c) => ({
      ...acc,
      [c.service_code]: c.price_amount || 0
    }), {})
  )

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/admin/couriers/${courierId}/service-capabilities`, {
        services: selectedServices,
        prices: prices
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courier', courierId] })
      toast.success('Service capabilities updated successfully')
    },
    onError: (err: any) => {
      toast.error(`Update failed: ${err.message}`)
    }
  })

  const toggleService = (code: string) => {
    setSelectedServices(prev => 
      prev.includes(code) 
        ? prev.filter(s => s !== code)
        : [...prev, code]
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground-muted flex items-center gap-2">
          <Settings size={20}  aria-hidden="true"/>
          Service Capabilities
        </h3>
        <button
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="px-4 py-2 rounded-xl bg-primary text-on-primary font-bold text-sm flex items-center gap-2 disabled:opacity-60"
        >
          {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          Save Changes
        </button>
      </div>

      <div className="space-y-3">
        {availableServices.map(service => {
          const isSelected = selectedServices.includes(service.code)
          const existingCap = capabilities.find(c => c.service_code === service.code)
          
          return (
            <div key={service.code} className="p-4 rounded-xl bg-surface/[0.02] border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleService(service.code)}
                  className="rounded border-border bg-surface-subtle text-primary focus:ring-primary"
                />
                <div>
                  <p className="text-sm font-bold text-foreground-muted">{service.name}</p>
                  {existingCap && (
                    <StatusBadge status={existingCap.status} labelPrefix="Capability status" className="mt-1 text-[10px]" />
                  )}
                </div>
              </div>
              
              {isSelected && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground-muted">Harga:</span>
                  <input
                    type="number"
                    value={prices[service.code] || ''}
                    onChange={(e) => setPrices(prev => ({
                      ...prev,
                      [service.code]: parseInt(e.target.value) || 0
                    }))}
                    placeholder="Rp"
                    className="w-32 bg-surface-subtle border border-border rounded-lg p-2 text-sm text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
