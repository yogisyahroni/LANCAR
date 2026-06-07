import { AttributionControl, MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Moon, Sun } from 'lucide-react'
import L from 'leaflet'
import { api } from '../lib/api'
import {
  CARTO_DARK_ATTRIBUTION,
  CARTO_DARK_TILE_URL,
  TOMTOM_RASTER_ATTRIBUTION,
  TomTomRuntimeUnavailable,
  isTomTomRuntimeReady,
  tomTomRasterTileUrl,
  useMapsRuntimeConfig
} from './TomTomMapsRuntime'

// Fix for default marker icons in Leaflet + React
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

type CourierPoint = {
  account_id?: string | null
  courier_profile_id?: string | null
  lat: number | string | null
  lng: number | string | null
  weight?: number | string | null
  status?: 'online' | 'offline' | string | null
  is_online?: boolean | string | null
  last_location_at?: string | null
}

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const onlineCourierIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #22C55E; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #22C55E;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const offlineCourierIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #71717A; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(113, 113, 122, 0.55);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const isCourierOnline = (point: CourierPoint) => {
  if (typeof point.status === 'string' && point.status.length > 0) {
    return point.status === 'online'
  }

  return point.is_online === true || point.is_online === 'true'
}

const getCourierPointKey = (point: CourierPoint, index: number) => {
  if (point.account_id) return `account:${point.account_id}`
  if (point.courier_profile_id) return `profile:${point.courier_profile_id}`
  return `coordinate:${point.lat}:${point.lng}:${index}`
}

const getLocationTimestamp = (point: CourierPoint) => {
  if (!point.last_location_at) return 0
  const timestamp = Date.parse(point.last_location_at)
  return Number.isFinite(timestamp) ? timestamp : 0
}

const shouldUseNextCourierPoint = (current: CourierPoint, next: CourierPoint) => {
  const currentOnline = isCourierOnline(current)
  const nextOnline = isCourierOnline(next)
  if (currentOnline !== nextOnline) return nextOnline
  return getLocationTimestamp(next) > getLocationTimestamp(current)
}

export default function LiveMap() {
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark')
  const { data: courierPoints = [], isLoading, isError } = useQuery({
    queryKey: ['admin-live-courier-heat-data'],
    queryFn: async () => {
      const res = await api.get('/admin/analytics/heat-data')
      return Array.isArray(res.data) ? res.data : []
    },
    refetchInterval: 15000
  })
  const uniqueCourierPoints = useMemo(() => {
    const pointsByAccount = new Map<string, CourierPoint>()

    courierPoints.forEach((point: CourierPoint, index: number) => {
      const lat = Number(point.lat)
      const lng = Number(point.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

      const accountKey = getCourierPointKey(point, index)
      const currentPoint = pointsByAccount.get(accountKey)
      if (!currentPoint || shouldUseNextCourierPoint(currentPoint, point)) {
        pointsByAccount.set(accountKey, point)
      }
    })

    return Array.from(pointsByAccount.values())
  }, [courierPoints])
  const center = useMemo<[number, number]>(() => {
    const firstPoint =
      uniqueCourierPoints.find((point: CourierPoint) => isCourierOnline(point) && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) ||
      uniqueCourierPoints.find((point: CourierPoint) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)))
    return firstPoint ? [Number(firstPoint.lat), Number(firstPoint.lng)] : [-2.5489, 118.0149]
  }, [uniqueCourierPoints])
  const onlineCourierCount = useMemo(
    () => uniqueCourierPoints.filter((point: CourierPoint) => isCourierOnline(point)).length,
    [uniqueCourierPoints]
  )
  const offlineCourierCount = Math.max(uniqueCourierPoints.length - onlineCourierCount, 0)
  const { data: mapsRuntimeConfig } = useMapsRuntimeConfig('tracking')
  const shouldRenderTomTom = isTomTomRuntimeReady(mapsRuntimeConfig)
  const tileUrl = shouldRenderTomTom
    ? tomTomRasterTileUrl(mapsRuntimeConfig?.tomtom_maps?.browser_api_key || '', mapTheme === 'dark' ? 'night' : 'main')
    : CARTO_DARK_TILE_URL
  const tileAttribution = shouldRenderTomTom
    ? TOMTOM_RASTER_ATTRIBUTION
    : CARTO_DARK_ATTRIBUTION

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden relative border border-white/5 shadow-2xl">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%', background: '#09090b' }}
      >
        <AttributionControl prefix={false} />
        <TileLayer
          attribution={tileAttribution}
          url={tileUrl}
        />

        {uniqueCourierPoints.map((point: CourierPoint, index: number) => {
          const lat = Number(point.lat)
          const lng = Number(point.lng)
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
          const online = isCourierOnline(point)
          return (
            <Marker key={getCourierPointKey(point, index)} position={[lat, lng]} icon={online ? onlineCourierIcon : offlineCourierIcon}>
              <Popup>
                <div className="text-zinc-900 font-sans">
                  <p className="font-bold">{online ? 'Kurir siap menerima order' : 'Kurir tidak aktif'}</p>
                  <p className="text-xs">Weight: {Number(point.weight || 0).toFixed(1)}</p>
                  {point.last_location_at && (
                    <p className="text-xs">Lokasi terakhir: {new Date(point.last_location_at).toLocaleTimeString()}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {mapsRuntimeConfig?.active_provider === 'tomtom_maps' && !shouldRenderTomTom && (
        <TomTomRuntimeUnavailable message="TomTom Maps aktif, tetapi browser key runtime belum tersedia. Admin memakai fallback map sementara." />
      )}

      {!isLoading && !isError && onlineCourierCount === 0 && (
        <div className="absolute inset-x-4 top-20 z-[1000] glass-card rounded-2xl border-white/10 p-4 text-sm text-zinc-300">
          Belum ada kurir duty aktif. Peta tetap memantau lokasi terakhir yang tersedia.
        </div>
      )}
      {isError && (
        <div className="absolute inset-x-4 top-20 z-[1000] rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
          Lokasi kurir belum bisa dimuat.
        </div>
      )}

      {shouldRenderTomTom && (
        <div className="absolute right-4 top-4 z-[1000] rounded-2xl border border-white/10 bg-zinc-950/80 p-1 shadow-xl shadow-black/30 backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setMapTheme('dark')}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] ${
                mapTheme === 'dark'
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              <Moon size={13} />
              Dark
            </button>
            <button
              type="button"
              onClick={() => setMapTheme('light')}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] ${
                mapTheme === 'light'
                  ? 'bg-white text-zinc-950 shadow-lg shadow-white/10'
                  : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              <Sun size={13} />
              Light
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-[1000] glass-card p-3 rounded-xl text-xs space-y-2 border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary-light" />
          <span>Siap menerima order ({onlineCourierCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-zinc-500" />
          <span>Tidak aktif ({offlineCourierCount})</span>
        </div>
      </div>
    </div>
  )
}
