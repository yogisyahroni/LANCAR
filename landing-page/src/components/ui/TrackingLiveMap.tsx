"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default icon path issues in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface TrackingLiveMapProps {
  latitude: number;
  longitude: number;
  status: string;
}

export default function TrackingLiveMap({ latitude, longitude, status }: TrackingLiveMapProps) {
  const [position, setPosition] = useState<[number, number]>([latitude, longitude]);

  useEffect(() => {
    setPosition([latitude, longitude]);
  }, [latitude, longitude]);

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border border-white/10 shadow-lg relative z-0 min-h-[300px]">
      <MapContainer
        center={position}
        zoom={15}
        scrollWheelZoom={false}
        className="h-full w-full absolute inset-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>
            <div className="text-center font-bold text-black">
              Lokasi Kurir Saat Ini<br />
              <span className="text-[#ff6908]">{status}</span>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
