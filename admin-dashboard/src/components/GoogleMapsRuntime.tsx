import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

type MapsRuntimeConfig = {
  active_provider: string
  fallback_provider?: string
  reason?: string | null
  ttl_seconds?: number
  google_maps?: {
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

export type GoogleLatLng = {
  lat: number
  lng: number
}

export type RuntimeGoogleMarker = GoogleLatLng & {
  id: string
  title?: string
  snippet?: string
}

export type RuntimeGooglePolygon = {
  id: string
  path: GoogleLatLng[]
  selected?: boolean
  strokeColor?: string
  fillColor?: string
}

declare global {
  interface Window {
    google?: any
    __tembusGoogleMapsLoaders?: Partial<Record<string, Promise<any>>>
  }
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

export function isGoogleRuntimeReady(config?: MapsRuntimeConfig | null) {
  return Boolean(
    config?.active_provider === 'google_maps' &&
    config.google_maps?.sdk_enabled &&
    config.google_maps?.browser_api_key
  )
}

export function GoogleRuntimeUnavailable({ message }: { message?: string }) {
  return (
    <div className="absolute inset-x-4 top-20 z-[1000] rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100 shadow-lg shadow-black/20 backdrop-blur-xl">
      {message || 'Google Maps belum siap. Cek browser key, referrer restriction, dan billing Google Cloud.'}
    </div>
  )
}

const loadGoogleMapsSdk = (apiKey: string) => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('browser_runtime_required'))
  }
  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps)
  }

  window.__tembusGoogleMapsLoaders = window.__tembusGoogleMapsLoaders || {}
  if (window.__tembusGoogleMapsLoaders[apiKey]) {
    return window.__tembusGoogleMapsLoaders[apiKey]
  }

  window.__tembusGoogleMapsLoaders[apiKey] = new Promise((resolve, reject) => {
    const callbackName = `__tembusGoogleMapsReady_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    const searchParams = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      libraries: 'marker',
      auth_referrer_policy: 'origin',
      callback: callbackName
    })

    ;(window as any)[callbackName] = () => {
      delete (window as any)[callbackName]
      resolve(window.google?.maps)
    }

    script.src = `https://maps.googleapis.com/maps/api/js?${searchParams.toString()}`
    script.async = true
    script.defer = true
    script.onerror = () => {
      delete (window as any)[callbackName]
      reject(new Error('google_maps_script_failed'))
    }
    document.head.appendChild(script)
  })

  return window.__tembusGoogleMapsLoaders[apiKey]
}

export function GoogleMapCanvas({
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
  center: GoogleLatLng
  zoom?: number
  markers?: RuntimeGoogleMarker[]
  polygons?: RuntimeGooglePolygon[]
  className?: string
  onPolygonClick?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRefs = useRef<any[]>([])
  const polygonRefs = useRef<any[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')

    loadGoogleMapsSdk(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current || !maps?.Map) return
        const mapOptions: Record<string, any> = {
          center,
          zoom,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
          backgroundColor: '#09090b',
          styles: [
            { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] }
          ]
        }
        if (mapId) {
          mapOptions.mapId = mapId
        }
        mapRef.current = new maps.Map(containerRef.current, mapOptions)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('failed')
      })

    return () => {
      cancelled = true
      markerRefs.current.forEach((marker) => marker.setMap?.(null))
      polygonRefs.current.forEach((polygon) => polygon.setMap?.(null))
      markerRefs.current = []
      polygonRefs.current = []
      mapRef.current = null
    }
  }, [apiKey, mapId])

  useEffect(() => {
    if (!mapRef.current || loadState !== 'ready') return
    mapRef.current.setCenter(center)
    mapRef.current.setZoom(zoom)
  }, [center, loadState, zoom])

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
    if (!mapRef.current || loadState !== 'ready' || !window.google?.maps) return

    markerRefs.current.forEach((marker) => marker.setMap?.(null))
    polygonRefs.current.forEach((polygon) => polygon.setMap?.(null))
    markerRefs.current = []
    polygonRefs.current = []

    stableMarkers.forEach((marker) => {
      const googleMarker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lat: marker.lat, lng: marker.lng },
        title: marker.title || 'Lokasi'
      })
      markerRefs.current.push(googleMarker)
    })

    stablePolygons.forEach((polygon) => {
      const googlePolygon = new window.google.maps.Polygon({
        map: mapRef.current,
        paths: polygon.path,
        strokeColor: polygon.strokeColor || '#10b981',
        strokeOpacity: polygon.selected ? 1 : 0.82,
        strokeWeight: polygon.selected ? 4 : 2,
        fillColor: polygon.fillColor || '#10b981',
        fillOpacity: polygon.selected ? 0.32 : 0.1
      })
      if (onPolygonClick) {
        googlePolygon.addListener('click', () => onPolygonClick(polygon.id))
      }
      polygonRefs.current.push(googlePolygon)
    })

    const selectedPolygon = stablePolygons.find((polygon) => polygon.selected)
    if (selectedPolygon) {
      const bounds = new window.google.maps.LatLngBounds()
      selectedPolygon.path.forEach((point) => bounds.extend(point))
      mapRef.current.fitBounds(bounds, 64)
    }

    return () => {
      markerRefs.current.forEach((marker) => marker.setMap?.(null))
      polygonRefs.current.forEach((polygon) => polygon.setMap?.(null))
      markerRefs.current = []
      polygonRefs.current = []
    }
  }, [loadState, onPolygonClick, stableMarkers, stablePolygons])

  return (
    <div className={`relative overflow-hidden bg-zinc-950 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {loadState === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-zinc-900" />
      )}
      {loadState === 'failed' && (
        <GoogleRuntimeUnavailable />
      )}
    </div>
  )
}
