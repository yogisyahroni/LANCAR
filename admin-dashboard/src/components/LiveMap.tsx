import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import { api } from '../lib/api'
import { TomTomMapCanvas, TomTomRuntimeUnavailable, isTomTomRuntimeReady, useMapsRuntimeConfig } from './TomTomMapsRuntime'

// Fix for default marker icons in Leaflet + React
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom Marker for Couriers
const courierIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #22C55E; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #22C55E;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

export default function LiveMap() {
  const { data: courierPoints = [], isLoading, isError } = useQuery({
    queryKey: ['admin-live-courier-heat-data'],
    queryFn: async () => {
      const res = await api.get('/admin/analytics/heat-data')
      return Array.isArray(res.data) ? res.data : []
    },
    refetchInterval: 15000
  })
  const center = useMemo<[number, number]>(() => {
    const firstPoint = courierPoints.find((point: any) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)))
    return firstPoint ? [Number(firstPoint.lat), Number(firstPoint.lng)] : [-2.5489, 118.0149]
  }, [courierPoints])
  const { data: mapsRuntimeConfig } = useMapsRuntimeConfig('tracking')
  const TomTomMarkers = useMemo(() => courierPoints
    .map((point: any, index: number) => ({
      id: `${point.id || index}`,
      lat: Number(point.lat),
      lng: Number(point.lng),
      title: 'Lokasi kurir',
      snippet: `Weight: ${Number(point.weight || 0).toFixed(1)}`
    }))
    .filter((point: any) => Number.isFinite(point.lat) && Number.isFinite(point.lng)), [courierPoints])
  const shouldRenderTomTom = isTomTomRuntimeReady(mapsRuntimeConfig)

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden relative border border-white/5 shadow-2xl">
      {shouldRenderTomTom ? (
        <TomTomMapCanvas
          apiKey={mapsRuntimeConfig?.tomtom_maps?.browser_api_key || ''}
          mapId={mapsRuntimeConfig?.tomtom_maps?.map_id}
          center={{ lat: center[0], lng: center[1] }}
          zoom={13}
          markers={TomTomMarkers}
        />
      ) : (
        <>
          <MapContainer
            center={center}
            zoom={13}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%', background: '#09090b' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {courierPoints.map((point: any, index: number) => {
              const lat = Number(point.lat)
              const lng = Number(point.lng)
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
              return (
                <Marker key={`${lat}:${lng}:${index}`} position={[lat, lng]} icon={courierIcon}>
                  <Popup>
                    <div className="text-zinc-900 font-sans">
                      <p className="font-bold">Courier location</p>
                      <p className="text-xs">Weight: {Number(point.weight || 0).toFixed(1)}</p>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>

          {mapsRuntimeConfig?.active_provider === 'tomtom_maps' && (
            <TomTomRuntimeUnavailable message="TomTom Maps aktif, tetapi browser key runtime belum tersedia. Admin memakai fallback map sementara." />
          )}
        </>
      )}

      {!isLoading && !isError && courierPoints.length === 0 && (
        <div className="absolute inset-x-4 top-20 z-[1000] glass-card rounded-2xl border-white/10 p-4 text-sm text-zinc-300">
          Belum ada lokasi kurir aktif dari database.
        </div>
      )}
      {isError && (
        <div className="absolute inset-x-4 top-20 z-[1000] rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
          Lokasi kurir belum bisa dimuat.
        </div>
      )}

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-[1000] glass-card p-3 rounded-xl text-xs space-y-2 border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary-light" />
          <span>Aktif & Online</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-zinc-500" />
          <span>Offline</span>
        </div>
      </div>
    </div>
  )
}
