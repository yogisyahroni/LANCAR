"use client";

import { Truck } from "lucide-react";
import { RoadsideServicePage } from "@/components/services/RoadsideServicePage";

export default function TowingPage() {
  return (
    <RoadsideServicePage
      service={{
        icon: Truck,
        eyebrow: "Bantuan Darurat via Mitra",
        title: "Towing Saat Dibutuhkan",
        description: "Kendaraan tidak bisa melanjutkan perjalanan? Hubungkan kebutuhan towing kamu dengan mitra melalui aplikasi TEMBUS.",
        image: "/images/tow-truck-256.png",
        imageAlt: "Ikon 3D truk towing hijau TEMBUS",
        steps: [
          "Buka aplikasi TEMBUS",
          "Pilih layanan Towing",
          "Masukkan titik penjemputan",
          "Tunggu mitra towing terhubung"
        ]
      }}
    />
  );
}
