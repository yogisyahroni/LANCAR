import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

type MapsRuntimeConfig = {
  active_provider: string
  fallback_provider?: string
  reason?: string | null
  ttl_seconds?: number
  tomtom_maps?: {
    browser_api_key?: string | null
    browser_key_configured?: boolean
    map_id?: string | null
    sdk_enabled?: boolean
  }
  openstreetmap?: {
    tile_url_template?: string | null
    attribution?: string | null
  }
}

export const TOMTOM_RASTER_ATTRIBUTION = '&copy; <a href="https://www.tomtom.com/" rel="noreferrer">TomTom</a>'
export const CARTO_DARK_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
export const CARTO_DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

export type TomTomRasterStyle = 'main' | 'night'

export function tomTomRasterTileUrl(apiKey: string, style: TomTomRasterStyle = 'night') {
  return `https://api.tomtom.com/map/1/tile/basic/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`
}

export function useMapsRuntimeConfig(scope: string) {
  return useQuery({
    queryKey: ['public-maps-runtime-config', scope],
    queryFn: async () => {
      const response = await api.get('/maps/config', { params: { scope } })
      return response.data as MapsRuntimeConfig
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1
  })
}

export function isTomTomRuntimeReady(config?: MapsRuntimeConfig | null) {
  return Boolean(
    config?.active_provider === 'tomtom_maps' &&
    config.tomtom_maps?.sdk_enabled &&
    config.tomtom_maps?.browser_api_key
  )
}

export function TomTomRuntimeUnavailable({ message }: { message?: string }) {
  return (
    <div className="absolute inset-x-4 top-20 z-[1000] rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100 shadow-lg shadow-black/20 backdrop-blur-xl">
      {message || 'Peta sedang dialihkan ke mode aman. Data koordinat dan kontrol operasional tetap tersedia.'}
    </div>
  )
}
