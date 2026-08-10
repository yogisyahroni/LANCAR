import { useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, LocateFixed, MapPin, Navigation } from 'lucide-react'

// ─── FB-093: picker lokasi wajib via pin di peta ──────────────────────
// Ganti input lat/lng manual dengan peta interaktif:
// - Klik peta → pin di titik itu
// - Pin bisa digeser (drag)
// - Tombol "Gunakan lokasi saya" → geolocation browser
// Tiles: CARTO light (public, tanpa API key — fallback yang sama dengan
// admin-dashboard kalau TomTom runtime config tidak tersedia).

const CARTO_LIGHT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const CARTO_LIGHT_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

// Pin kustom (divIcon) — hindari default icon Leaflet yang rusak di bundler.
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 27 17 27s17-14.25 17-27C34 7.6 26.4 0 17 0z" fill="#ff6908" stroke="#fff" stroke-width="2"/>
    <circle cx="17" cy="17" r="6.5" fill="#fff"/>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 44],
})

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function LocationPicker({ lat, lng, onChange }: {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}) {
  const mapRef = useRef<L.Map | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState('')

  // Default center: Jakarta. Begitu pin dipilih, map mengikuti pin.
  const center: [number, number] = lat !== null && lng !== null ? [lat, lng] : [-6.2, 106.82]

  const locateMe = () => {
    setGeoError('')
    if (!('geolocation' in navigator)) {
      setGeoError('Browser kamu tidak mendukung geolokasi. Klik peta untuk menandai lokasi.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        onChange(latitude, longitude)
        mapRef.current?.flyTo([latitude, longitude], 16)
        setLocating(false)
      },
      (err) => {
        setGeoError(`Gagal ambil lokasi: ${err.message}. Klik peta untuk menandai manual.`)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-zinc-700">
          Lokasi toko di peta <span className="text-[#ff6908]">*</span>
        </p>
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-950 disabled:opacity-60"
        >
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
          Gunakan lokasi saya
        </button>
      </div>

      <div className="relative mt-3 h-64 w-full overflow-hidden rounded-xl border border-zinc-200">
        <MapContainer
          ref={(m) => { mapRef.current = m }}
          center={center}
          zoom={lat !== null ? 16 : 11}
          scrollWheelZoom={false}
          attributionControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer attribution={CARTO_LIGHT_ATTRIBUTION} url={CARTO_LIGHT_TILE_URL} />
          <MapClickHandler onPick={onChange} />
          {lat !== null && lng !== null && (
            <Marker
              position={[lat, lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const p = e.target.getLatLng()
                  onChange(p.lat, p.lng)
                },
              }}
            />
          )}
        </MapContainer>
        {lat === null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-zinc-600 shadow">
              Klik di peta untuk menandai lokasi toko
            </span>
          </div>
        )}
      </div>

      {lat !== null && lng !== null ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
          <MapPin className="h-3.5 w-3.5" />
          {lat.toFixed(6)}, {lng.toFixed(6)} — geser pin untuk menyesuaikan
        </p>
      ) : (
        <p className="mt-2.5 text-xs text-zinc-500">Lokasi ini dipakai untuk menghitung ongkir & menampilkan tokomu di “resto terdekat”.</p>
      )}
      {geoError && <p className="mt-2 text-xs font-semibold text-red-600">{geoError}</p>}
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
        <Navigation className="h-3 w-3" /> Butuh izin akses lokasi browser — hanya dipakai saat kamu menekan tombol di atas.
      </p>
    </div>
  )
}
