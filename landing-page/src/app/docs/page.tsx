"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { ChevronRight, Code2, Copy, FileJson, Key, LayoutTemplate, ShieldCheck } from "lucide-react";

export default function DeveloperPortalPage() {
  const endpoints = [
    {
      id: "auth",
      title: "Authentication",
      description: "Amankan akses API Anda menggunakan Bearer Token (JWT).",
      method: "POST",
      path: "/api/v1/auth/verify-otp",
      request: `{
  "phone_number": "081234567890",
  "code": "123456",
  "device_id": "LGN-DEVICE-001",
  "device_info": {}
}`,
      response: `{
  "access_token": "eyJhbGciOiJIUzI1...",
  "refresh_token": "def502005..."
}`
    },
    {
      id: "estimate",
      title: "Cek Tarif (Estimate Price)",
      description: "Dapatkan estimasi harga pengiriman sebelum membuat pesanan.",
      method: "POST",
      path: "/api/v1/pricing/estimate",
      request: `{
  "origin_lat": -6.2088,
  "origin_lng": 106.8456,
  "dest_lat": -6.9175,
  "dest_lng": 107.6191,
  "service_type": "Reguler",
  "weight": 2.5
}`,
      response: `{
  "estimated_price": 45000,
  "estimated_time": "1-2 Hari",
  "distance_km": 150.2
}`
    },
    {
      id: "create-order",
      title: "Buat Pesanan Baru",
      description: "Buat pengiriman baru (pickup/drop-off) ke dalam sistem Tembus.",
      method: "POST",
      path: "/api/v1/orders",
      request: `{
  "pickup_address": "Jl. Sudirman No.1, Jakarta",
  "dropoff_address": "Jl. Braga No.99, Bandung",
  "service_type": "Reguler",
  "items": [
    { "name": "Laptop", "weight": 2.5 }
  ]
}`,
      response: `{
  "status": "created",
  "order_id": "TBS-987654321",
  "tracking_url": "https://tembus.id/track/TBS-987654321"
}`
    },
    {
      id: "track",
      title: "Lacak Pesanan",
      description: "Dapatkan status terbaru dan posisi kurir untuk suatu pesanan.",
      method: "GET",
      path: "/api/v1/orders/detail?id=TBS-987654321",
      request: `// No Body Required`,
      response: `{
  "order_id": "TBS-987654321",
  "status": "ON_DELIVERY",
  "courier": {
    "name": "Budi Santoso",
    "phone": "0812-3456-7890"
  },
  "scans": [
    {
      "scan_type": "PICKED_UP",
      "recorded_at": "2024-05-15T09:00:00Z"
    }
  ]
}`
    }
  ];

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      {/* Docs Header */}
      <section className="bg-[#001911] text-white">
        <Header />
        <div className="pt-16 pb-16 px-6 lg:px-16 xl:px-24">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-[#9bd46f] mb-6 backdrop-blur-sm border border-white/10">
              <Code2 className="w-4 h-4" />
              <span>Tembus Developer Portal</span>
            </div>
            <h1 className="text-4xl font-black mb-4">API Reference</h1>
            <p className="text-white/70 text-lg max-w-xl">
              Dokumentasi lengkap REST API Tembus. Integrasikan layanan pengiriman ke aplikasi Anda dengan mudah dan aman.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-[#003d2b] rounded-lg flex items-center justify-center text-[#9bd46f]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-white/50 font-bold uppercase">Base URL</p>
                <p className="font-mono text-sm">api.bawain.my.id/v1</p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-6 lg:px-16 xl:px-24 py-12 flex flex-col lg:flex-row gap-12 items-start">
        
        {/* Sidebar Navigation */}
        <div className="w-full lg:w-64 shrink-0 lg:sticky lg:top-24 hidden lg:block">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Getting Started</h3>
          <ul className="space-y-3 mb-8">
            <li><a href="#" className="text-[#003d2b] font-bold flex items-center gap-2"><ChevronRight className="w-4 h-4"/> Authentication</a></li>
            <li><a href="#" className="text-slate-500 hover:text-[#003d2b] transition-colors flex items-center gap-2"><ChevronRight className="w-4 h-4 opacity-0"/> Error Handling</a></li>
            <li><a href="#" className="text-slate-500 hover:text-[#003d2b] transition-colors flex items-center gap-2"><ChevronRight className="w-4 h-4 opacity-0"/> Webhooks</a></li>
          </ul>

          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Endpoints</h3>
          <ul className="space-y-3">
            {endpoints.map((ep) => (
              <li key={ep.id}>
                <a href={`#${ep.id}`} className="text-slate-500 hover:text-[#003d2b] transition-colors flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${ep.method === 'GET' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                    {ep.method}
                  </span>
                  {ep.title}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Content Body */}
        <div className="flex-1 max-w-4xl space-y-20">
          
          {/* Auth Section Intro */}
          <div className="prose prose-slate max-w-none">
            <h2 className="text-3xl font-black text-[#071712] mb-4">Authentication & Authorization</h2>
            <p className="text-slate-600 text-lg mb-6">
              Semua endpoint Tembus API (kecuali beberapa public endpoint) membutuhkan autentikasi menggunakan <strong>Bearer Token (JWT)</strong>. Token didapatkan melalui proses OTP verifikasi.
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-4 text-yellow-800 text-sm">
              <Key className="w-5 h-5 shrink-0 mt-0.5" />
              <p>Pastikan Anda menyimpan <code>access_token</code> secara aman dan tidak mengeksposnya di sisi client-side (browser) untuk menghindari kebocoran data kurir dan pelanggan.</p>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Endpoints List */}
          <div className="space-y-24">
            {endpoints.map((ep, idx) => (
              <motion.div 
                key={ep.id} 
                id={ep.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.4 }}
                className="scroll-mt-32"
              >
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-[#071712] mb-2">{ep.title}</h3>
                  <p className="text-slate-600">{ep.description}</p>
                </div>

                <div className="bg-[#0a0a0a] rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
                  {/* Endpoint Header */}
                  <div className="flex items-center gap-4 px-4 py-3 bg-[#111] border-b border-white/10">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${ep.method === 'GET' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                      {ep.method}
                    </span>
                    <code className="text-sm font-mono text-slate-300">{ep.path}</code>
                    <button className="ml-auto text-slate-500 hover:text-white transition-colors">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Code Blocks Area */}
                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
                    {/* Request */}
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        <LayoutTemplate className="w-4 h-4" /> Request Payload
                      </div>
                      <pre className="text-sm font-mono leading-relaxed text-[#a5d6ff] overflow-x-auto">
                        <code>{ep.request}</code>
                      </pre>
                    </div>

                    {/* Response */}
                    <div className="p-4 bg-white/[0.02]">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                        <FileJson className="w-4 h-4" /> Response Example
                      </div>
                      <pre className="text-sm font-mono leading-relaxed text-[#7ee787] overflow-x-auto">
                        <code>{ep.response}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>

      <Footer />
    </main>
  );
}
