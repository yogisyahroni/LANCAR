import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bawain.my.id"),
  title: {
    default: "TEMBUS - Kirim Cepat, Aman, Sampai Tujuan",
    template: "%s | TEMBUS"
  },
  description:
    "TEMBUS adalah layanan pengiriman hyperlocal untuk customer, bisnis, dan mitra kurir dengan tracking real-time dan proses kirim yang praktis.",
  alternates: {
    canonical: "https://bawain.my.id"
  },
  openGraph: {
    title: "TEMBUS - Kirim Cepat, Aman, Sampai Tujuan",
    description:
      "Pengiriman hyperlocal untuk customer, bisnis, dan mitra kurir dengan tracking real-time.",
    url: "https://bawain.my.id",
    siteName: "TEMBUS",
    locale: "id_ID",
    type: "website"
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
