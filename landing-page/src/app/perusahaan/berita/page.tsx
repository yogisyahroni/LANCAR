"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Loader2, Calendar, ChevronRight, Newspaper } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5, delay }
  };
}

export default function NewsPage() {
  const [news, setNews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002/api/v1";
      const res = await fetch(`${baseUrl}/public/news`);
      const data = await res.json();
      if (res.ok) setNews(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="page-shell bg-zinc-50 min-h-screen">
      <Header isTransparent={false} />
      
      {/* Hero Section */}
      <section className="bg-[#001911] text-white py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1 {...fadeUp(0)} className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-6">
            Berita Seputar <span className="text-[#7bc043]">Tembus</span>
          </motion.h1>
          <motion.p {...fadeUp(0.1)} className="text-lg text-white/80 max-w-2xl mx-auto">
            Ikuti update terbaru, artikel menarik, dan pengumuman dari Tembus.
          </motion.p>
        </div>
      </section>

      {/* News Section */}
      <section className="py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24 max-w-6xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-[#7bc043]" />
          </div>
        ) : news.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-zinc-200 shadow-sm max-w-3xl mx-auto">
            <Newspaper className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500 font-bold">Saat ini belum ada berita terbaru.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {news.map((item, idx) => (
              <motion.div
                {...fadeUp(idx * 0.1)}
                key={item.id}
                className="group bg-white rounded-[24px] border border-zinc-200 shadow-sm hover:shadow-xl hover:border-[#7bc043]/30 transition-all overflow-hidden flex flex-col"
              >
                {/* Image placeholder or real image */}
                <Link href={`/perusahaan/berita/${item.slug}`} className="block relative h-48 bg-zinc-100 overflow-hidden">
                  {item.image_url ? (
                    <img 
                      src={item.image_url} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-300">
                      <Newspaper size={48} />
                    </div>
                  )}
                </Link>
                
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 mb-3">
                    <Calendar size={14} />
                    {new Date(item.published_at || item.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </div>
                  
                  <Link href={`/perusahaan/berita/${item.slug}`}>
                    <h3 className="text-xl font-black text-[#071712] mb-3 line-clamp-2 group-hover:text-[#7bc043] transition-colors">
                      {item.title}
                    </h3>
                  </Link>
                  
                  <p className="text-sm text-zinc-500 line-clamp-3 mb-6 flex-1 leading-relaxed">
                    {item.content}
                  </p>
                  
                  <Link 
                    href={`/perusahaan/berita/${item.slug}`}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-[#072a20] group-hover:text-[#7bc043] transition-colors"
                  >
                    Baca Selengkapnya <ChevronRight size={16} />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
