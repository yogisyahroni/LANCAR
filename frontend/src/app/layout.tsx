import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/components/providers/QueryProvider";
import ThemeProvider from "@/components/providers/ThemeProvider";
import { Analytics } from "@/components/Analytics";
import I18nProvider from "@/components/i18n/I18nProvider";
import { directionForLocale } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";

const inter = Inter({ subsets: ["latin"] });

const themeBootstrapScript = `
(function () {
  try {
    var key = 'tembus-theme';
    var legacyKey = 'theme';
    var stored = localStorage.getItem(key) || localStorage.getItem(legacyKey);
    var mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
    var root = document.documentElement;
    root.dataset.theme = mode;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
  } catch (_) {}
})();`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={`${inter.className} min-h-full flex flex-col bg-background text-foreground selection:bg-primary/30`}>
        <ThemeProvider>
          <I18nProvider initialLocale={locale}>
            <QueryProvider>{children}</QueryProvider>
          </I18nProvider>
        </ThemeProvider>
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
