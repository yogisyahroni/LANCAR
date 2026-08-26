import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/components/providers/QueryProvider";
import CsrfBootstrap from "@/components/providers/CsrfBootstrap";
import { Analytics } from "@/components/Analytics";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TEMBUS Customer Portal",
  description: "Manage your deliveries and analytics with ease.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const midtransClientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;

  return (
    <html lang="id" className="dark h-full antialiased" suppressHydrationWarning>
      <body className={`${inter.className} min-h-full flex flex-col bg-background text-foreground selection:bg-primary/30`}>
        <QueryProvider>
          {children}
        </QueryProvider>
        <CsrfBootstrap />
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
