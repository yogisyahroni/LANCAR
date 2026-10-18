import type { LucideIcon } from "lucide-react";
import { Building2, Clock, Package, ShieldCheck, Store, Truck, Wrench, Zap } from "lucide-react";

export type ServiceCategoryId = "kirim-paket" | "untuk-bisnis" | "bantuan-kendaraan";

export type Service = {
  id: string;
  title: string;
  category: ServiceCategoryId;
  categoryLabel: string;
  text: string;
  features: string[];
  href: string;
  image: string;
  icon: LucideIcon;
  external?: boolean;
  imageClass?: string;
};

export const serviceCategories = [
  { id: "semua", label: "Semua layanan" },
  { id: "kirim-paket", label: "Kirim paket" },
  { id: "untuk-bisnis", label: "Untuk bisnis" },
  { id: "bantuan-kendaraan", label: "Bantuan kendaraan" }
] as const;

export const services: Service[] = [
  {
    id: "instant",
    title: "Instant",
    category: "kirim-paket",
    categoryLabel: "Kirim paket",
    text: "Pengiriman instan dalam hitungan jam untuk barang yang harus segera sampai.",
    features: ["Selesai dalam hitungan jam", "Prioritas utama", "Lacak real-time"],
    href: "/layanan/instant",
    image: "/brand/instant.svg",
    icon: Zap
  },
  {
    id: "same-day",
    title: "Same Day",
    category: "kirim-paket",
    categoryLabel: "Kirim paket",
    text: "Kirim hari ini dan terima di hari yang sama dengan tarif yang tetap bersahabat.",
    features: ["Tiba hari yang sama", "Tarif bersahabat", "Kurir fleksibel"],
    href: "/layanan/same-day",
    image: "/brand/samday.svg",
    icon: Clock
  },
  {
    id: "reguler",
    title: "Reguler",
    category: "kirim-paket",
    categoryLabel: "Kirim paket",
    text: "Layanan pengiriman harian dengan harga ekonomis dan jangkauan luas.",
    features: ["Harga kompetitif", "Estimasi 2–3 hari", "Cakupan nasional"],
    href: "/layanan/reguler",
    image: "/brand/regular.svg",
    icon: Truck
  },
  {
    id: "cargo",
    title: "Cargo",
    category: "kirim-paket",
    categoryLabel: "Kirim paket",
    text: "Kirim barang besar, berat, atau bervolume banyak dengan penanganan khusus.",
    features: ["Kapasitas besar", "Tarif per kg lebih murah", "Penanganan khusus"],
    href: "/layanan/cargo",
    image: "/brand/cargo.svg",
    icon: Package
  },
  {
    id: "cod",
    title: "COD",
    category: "kirim-paket",
    categoryLabel: "Kirim paket",
    text: "Bayar di tempat dengan proses yang praktis, aman, dan mudah dilacak.",
    features: ["Bayar di tempat", "Pencairan dana cepat", "Aman terpercaya"],
    href: "/layanan/cod",
    image: "/brand/cod.svg",
    icon: ShieldCheck,
    imageClass: "scale-[1.4] hover:scale-[1.5] -mt-2"
  },
  {
    id: "business",
    title: "Business",
    category: "untuk-bisnis",
    categoryLabel: "Untuk bisnis",
    text: "Solusi logistik terintegrasi untuk membantu bisnis tumbuh lebih efisien.",
    features: ["Integrasi API", "Dedicated account manager", "Laporan analitik"],
    href: "/layanan/business",
    image: "/brand/businnes.svg",
    icon: Building2
  },
  {
    id: "merchant-food",
    title: "Merchant Food",
    category: "untuk-bisnis",
    categoryLabel: "Untuk bisnis",
    text: "Bantu bisnis kuliner menjangkau lebih banyak pelanggan dengan pengantaran yang mudah.",
    features: ["Jangkau pelanggan lebih luas", "Pengantaran makanan", "Cocok untuk merchant"],
    href: "https://merchant.bawain.my.id/",
    image: "/images/merchant-food-256.png",
    icon: Store,
    external: true
  },
  {
    id: "tambal-ban",
    title: "Tambal Ban",
    category: "bantuan-kendaraan",
    categoryLabel: "Bantuan kendaraan",
    text: "Dapatkan bantuan mitra untuk menangani ban kendaraan di lokasi Anda.",
    features: ["Bantuan di lokasi", "Mitra terdekat", "Pesan lewat aplikasi"],
    href: "/layanan/tambal-ban",
    image: "/images/tire-repair-256.png",
    icon: Wrench
  },
  {
    id: "towing",
    title: "Towing",
    category: "bantuan-kendaraan",
    categoryLabel: "Bantuan kendaraan",
    text: "Hubungkan kendaraan Anda dengan mitra towing saat membutuhkan bantuan di perjalanan.",
    features: ["Bantuan darurat", "Mitra towing", "Pesan lewat aplikasi"],
    href: "/layanan/towing",
    image: "/images/tow-truck-256.png",
    icon: Truck
  }
];

export const serviceCountLabel = `${services.length} layanan`;
