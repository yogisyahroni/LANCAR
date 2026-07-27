import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bawain.my.id";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "TEMBUS - Kirim Cepat, Aman, Sampai Tujuan",
    template: "%s | TEMBUS"
  },
  description:
    "TEMBUS adalah layanan pengiriman hyperlocal untuk customer, bisnis, dan mitra kurir dengan tracking real-time dan proses kirim yang praktis.",
  alternates: {
    canonical: appUrl
  },
  openGraph: {
    title: "TEMBUS - Kirim Cepat, Aman, Sampai Tujuan",
    description:
      "Pengiriman hyperlocal untuk customer, bisnis, dan mitra kurir dengan tracking real-time.",
    url: appUrl,
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
