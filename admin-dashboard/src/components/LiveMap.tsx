import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useState } from 'react'
import L from 'leaflet'

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
  const [center] = useState<[number, number]>([-6.2088, 106.8456]) // Jakarta Center

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden relative border border-white/5 shadow-2xl">
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
        
        {/* Sample Courier Markers */}
        <Marker position={[-6.2146, 106.8451]} icon={courierIcon}>
          <Popup>
            <div className="text-zinc-900 font-sans">
              <p className="font-bold">Kurir: Andi Wijaya</p>
              <p className="text-xs">Status: On Delivery (LC-2024-1002)</p>
            </div>
          </Popup>
        </Marker>

        <Marker position={[-6.2000, 106.8500]} icon={courierIcon}>
          <Popup>
            <div className="text-zinc-900 font-sans">
              <p className="font-bold">Kurir: Budi Santoso</p>
              <p className="text-xs">Status: Idle</p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>

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
