import { useEffect, useMemo, useRef, useState } from 'react'
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

export type TomTomLatLng = {
  lat: number
  lng: number
}

export type RuntimeTomTomMarker = TomTomLatLng & {
  id: string
  title?: string
  snippet?: string
}

export type RuntimeTomTomPolygon = {
  id: string
  path: TomTomLatLng[]
  selected?: boolean
  strokeColor?: string
  fillColor?: string
}

type TomTomSdk = {
  map: (options: Record<string, unknown>) => any
  Marker: new (options?: Record<string, unknown>) => any
  Popup: new (options?: Record<string, unknown>) => any
  LngLatBounds: new () => any
}

declare global {
  interface Window {
    tt?: TomTomSdk
    __tembusTomTomMapsLoader?: Promise<TomTomSdk>
  }
}

const TOMTOM_WEB_SDK_VERSION = '6.25.0'
const TOMTOM_WEB_SDK_SCRIPT = `https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/${TOMTOM_WEB_SDK_VERSION}/maps/maps-web.min.js`
const TOMTOM_WEB_SDK_STYLE = `https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/${TOMTOM_WEB_SDK_VERSION}/maps/maps.css`

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

const ensureTomTomStylesheet = () => {
  if (typeof document === 'undefined') return
  if (document.querySelector(`link[data-tembus-tomtom-sdk="${TOMTOM_WEB_SDK_VERSION}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = TOMTOM_WEB_SDK_STYLE
  link.dataset.tembusTomtomSdk = TOMTOM_WEB_SDK_VERSION
  document.head.appendChild(link)
}

const loadTomTomMapsSdk = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('browser_runtime_required'))
  }
  if (window.tt?.map) {
    return Promise.resolve(window.tt)
  }
  if (window.__tembusTomTomMapsLoader) {
    return window.__tembusTomTomMapsLoader
  }

  ensureTomTomStylesheet()
  window.__tembusTomTomMapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TOMTOM_WEB_SDK_SCRIPT
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.tt?.map) {
        resolve(window.tt)
        return
      }
      reject(new Error('tomtom_sdk_missing_global'))
    }
    script.onerror = () => reject(new Error('tomtom_sdk_script_failed'))
    document.head.appendChild(script)
  })

  return window.__tembusTomTomMapsLoader
}

const safeLayerId = (prefix: string, id: string) => (
  `${prefix}-${id}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 96)
)

export function TomTomMapCanvas({
  apiKey,
  mapId,
  center,
  zoom = 13,
  markers = [],
  polygons = [],
  className = 'h-full w-full',
  onPolygonClick
}: {
  apiKey: string
  mapId?: string | null
  center: TomTomLatLng
  zoom?: number
  markers?: RuntimeTomTomMarker[]
  polygons?: RuntimeTomTomPolygon[]
  className?: string
  onPolygonClick?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRefs = useRef<any[]>([])
  const polygonCleanupRefs = useRef<Array<() => void>>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading')

  const stableMarkers = useMemo(
    () => markers.filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lng)),
    [markers]
  )
  const stablePolygons = useMemo(
    () => polygons
      .map((polygon) => ({
        ...polygon,
        path: polygon.path.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      }))
      .filter((polygon) => polygon.path.length >= 3),
    [polygons]
  )

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')

    loadTomTomMapsSdk()
      .then((tt) => {
        if (cancelled || !containerRef.current) return
        const mapOptions: Record<string, unknown> = {
          key: apiKey,
          container: containerRef.current,
          center: [center.lng, center.lat],
          zoom,
          dragPan: true,
          scrollZoom: true
        }
        if (mapId) mapOptions.style = mapId
        mapRef.current = tt.map(mapOptions)
        mapRef.current.once?.('load', () => {
          if (!cancelled) setLoadState('ready')
        })
        setTimeout(() => {
          if (!cancelled && mapRef.current) setLoadState('ready')
        }, 1500)
      })
      .catch(() => {
        if (!cancelled) setLoadState('failed')
      })

    return () => {
      cancelled = true
      markerRefs.current.forEach((marker) => marker.remove?.())
      polygonCleanupRefs.current.forEach((cleanup) => cleanup())
      markerRefs.current = []
      polygonCleanupRefs.current = []
      mapRef.current?.remove?.()
      mapRef.current = null
    }
  }, [apiKey, mapId])

  useEffect(() => {
    if (!mapRef.current || loadState !== 'ready') return
    mapRef.current.setCenter?.([center.lng, center.lat])
    mapRef.current.setZoom?.(zoom)
  }, [center, loadState, zoom])

  useEffect(() => {
    const map = mapRef.current
    const tt = window.tt
    if (!map || !tt || loadState !== 'ready') return

    markerRefs.current.forEach((marker) => marker.remove?.())
    polygonCleanupRefs.current.forEach((cleanup) => cleanup())
    markerRefs.current = []
    polygonCleanupRefs.current = []

    stableMarkers.forEach((marker) => {
      const tomTomMarker = new tt.Marker({ color: '#0d5c2f' })
        .setLngLat([marker.lng, marker.lat])
      if (marker.title || marker.snippet) {
        const content = [
          marker.title ? `<strong>${marker.title}</strong>` : '',
          marker.snippet ? `<span>${marker.snippet}</span>` : ''
        ].filter(Boolean).join('<br />')
        tomTomMarker.setPopup(new tt.Popup({ offset: 24 }).setHTML(content))
      }
      tomTomMarker.addTo(map)
      markerRefs.current.push(tomTomMarker)
    })

    stablePolygons.forEach((polygon) => {
      const sourceId = safeLayerId('zone-source', polygon.id)
      const fillLayerId = safeLayerId('zone-fill', polygon.id)
      const lineLayerId = safeLayerId('zone-line', polygon.id)
      const coordinates = polygon.path.map((point) => [point.lng, point.lat])
      const first = coordinates[0]
      const last = coordinates[coordinates.length - 1]
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        coordinates.push(first)
      }

      map.addSource?.(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { id: polygon.id },
          geometry: { type: 'Polygon', coordinates: [coordinates] }
        }
      })
      map.addLayer?.({
        id: fillLayerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': polygon.fillColor || '#10b981',
          'fill-opacity': polygon.selected ? 0.32 : 0.1
        }
      })
      map.addLayer?.({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': polygon.strokeColor || '#10b981',
          'line-width': polygon.selected ? 4 : 2,
          'line-opacity': polygon.selected ? 1 : 0.82
        }
      })

      const clickHandler = () => onPolygonClick?.(polygon.id)
      if (onPolygonClick) {
        map.on?.('click', fillLayerId, clickHandler)
        map.on?.('mouseenter', fillLayerId, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on?.('mouseleave', fillLayerId, () => { map.getCanvas().style.cursor = '' })
      }
      polygonCleanupRefs.current.push(() => {
        if (onPolygonClick) map.off?.('click', fillLayerId, clickHandler)
        if (map.getLayer?.(lineLayerId)) map.removeLayer(lineLayerId)
        if (map.getLayer?.(fillLayerId)) map.removeLayer(fillLayerId)
        if (map.getSource?.(sourceId)) map.removeSource(sourceId)
      })
    })

    const selectedPolygon = stablePolygons.find((polygon) => polygon.selected)
    if (selectedPolygon) {
      const bounds = new tt.LngLatBounds()
      selectedPolygon.path.forEach((point) => bounds.extend([point.lng, point.lat]))
      map.fitBounds?.(bounds, { padding: 64, maxZoom: 14 })
    }
  }, [loadState, onPolygonClick, stableMarkers, stablePolygons])

  return (
    <div className={`relative overflow-hidden bg-zinc-950 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {loadState === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-zinc-900" />
      )}
      {loadState === 'failed' && (
        <TomTomRuntimeUnavailable />
      )}
    </div>
  )
}
