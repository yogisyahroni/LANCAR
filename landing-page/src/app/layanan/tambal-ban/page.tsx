"use client";

import { Wrench } from "lucide-react";
import { RoadsideServicePage } from "@/components/services/RoadsideServicePage";

export default function TambalBanPage() {
  return (
    <RoadsideServicePage
      service={{
        icon: Wrench,
        eyebrow: "Bantuan Darurat via Mitra",
        title: "Tambal Ban di Lokasi",
        description: "Saat ban kendaraan bermasalah di perjalanan, ajukan bantuan mitra langsung dari aplikasi TEMBUS dan dapatkan bantuan di titik kamu.",
        image: "/images/tire-repair-256.png",
        imageAlt: "Ikon 3D layanan tambal ban TEMBUS",
        steps: [
          "Buka aplikasi TEMBUS",
          "Pilih layanan Tambal Ban",
          "Masukkan lokasi kendaraan",
          "Tunggu mitra datang membantu"
        ]
      }}
    />
  );
}
