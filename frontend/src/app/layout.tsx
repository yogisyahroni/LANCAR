import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/sidebar";
import { Toaster } from 'sonner';
import QueryProvider from "@/providers/query-provider";
import { SocketProvider } from "@/providers/socket-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LANCAR Admin Dashboard",
  description: "Logistics Relay Platform - Feature Flags & Readiness Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="h-full bg-background text-foreground selection:bg-primary/30 selection:text-primary">
        <QueryProvider>
          <SocketProvider>
            <div className="flex h-full overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto bg-background p-8">
                <div className="max-w-7xl mx-auto">
                  {children}
                </div>
              </main>
            </div>
            <Toaster position="top-right" theme="dark" richColors closeButton />
          </SocketProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
