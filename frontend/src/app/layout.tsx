import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/components/providers/QueryProvider";
import { Analytics } from "@/components/Analytics";
import I18nProvider from "@/components/i18n/I18nProvider";
import { directionForLocale } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TEMBUS Customer Portal",
  description: "Manage your deliveries and analytics with ease.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const midtransClientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
  const locale = await getRequestLocale();

  return (
    <html
      lang={locale}
      dir={directionForLocale(locale)}
      data-locale={locale}
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className={`${inter.className} min-h-full flex flex-col bg-background text-foreground selection:bg-primary/30`}>
        <I18nProvider initialLocale={locale}>
          <QueryProvider>{children}</QueryProvider>
        </I18nProvider>
        <Analytics />
        {midtransClientKey ? (
          <script
            src="https://app.sandbox.midtrans.com/snap/snap.js"
            data-client-key={midtransClientKey}
            async
          />
        ) : null}
      </body>
    </html>
  );
}
