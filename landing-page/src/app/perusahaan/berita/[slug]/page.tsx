"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Loader2, Calendar, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5, delay }
  };
}

export default function NewsDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [news, setNews] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (slug) fetchNewsDetail();
  }, [slug]);

  const fetchNewsDetail = async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002/api/v1";
      const res = await fetch(`${baseUrl}/public/news/${slug}`);
      const data = await res.json();
      if (res.ok && data.data) {
        setNews(data.data);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="page-shell bg-zinc-50 min-h-screen">
      <Header isTransparent={false} />
      
      {isLoading ? (
        <div className="flex justify-center items-center min-h-[60vh]">
          <Loader2 className="w-12 h-12 animate-spin text-[#7bc043]" />
        </div>
      ) : error || !news ? (
        <div className="flex flex-col justify-center items-center min-h-[60vh] text-center px-6">
          <h2 className="text-3xl font-black text-zinc-900 mb-4">Berita Tidak Ditemukan</h2>
          <p className="text-zinc-500 mb-8">Berita yang Anda cari mungkin telah dihapus atau URL tidak valid.</p>
          <Link 
            href="/perusahaan/berita"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#072a20] text-white rounded-xl font-bold hover:bg-[#003d2b] transition-colors"
          >
            <ChevronLeft size={20} /> Kembali ke Berita
          </Link>
        </div>
      ) : (
        <article className="pb-24">
          {/* Header Image */}
          {news.image_url ? (
            <div className="w-full h-[40vh] md:h-[60vh] bg-zinc-900 relative">
              <img 
                src={news.image_url} 
                alt={news.title}
                className="w-full h-full object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              
              <div className="absolute bottom-0 left-0 w-full p-6 sm:p-10 lg:p-16 xl:p-20 2xl:px-24">
                <div className="max-w-4xl mx-auto">
                  <Link 
                    href="/perusahaan/berita"
                    className="inline-flex items-center gap-2 text-white/80 hover:text-white font-bold mb-6 transition-colors text-sm"
                  >
                    <ChevronLeft size={16} /> Kembali ke Berita
                  </Link>
                  <motion.h1 {...fadeUp(0)} className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-white mb-6 leading-tight">
                    {news.title}
                  </motion.h1>
                  <motion.div {...fadeUp(0.1)} className="flex items-center gap-2 text-sm font-semibold text-white/80">
                    <Calendar size={16} />
                    {new Date(news.published_at || news.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </motion.div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#001911] pt-32 pb-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24">
              <div className="max-w-4xl mx-auto">
                <Link 
                  href="/perusahaan/berita"
                  className="inline-flex items-center gap-2 text-white/80 hover:text-white font-bold mb-6 transition-colors text-sm"
                >
                  <ChevronLeft size={16} /> Kembali ke Berita
                </Link>
                <motion.h1 {...fadeUp(0)} className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-white mb-6 leading-tight">
                  {news.title}
                </motion.h1>
                <motion.div {...fadeUp(0.1)} className="flex items-center gap-2 text-sm font-semibold text-white/80">
                  <Calendar size={16} />
                  {new Date(news.published_at || news.created_at).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </motion.div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24 max-w-4xl mx-auto mt-12">
            <motion.div {...fadeUp(0.2)} className="prose prose-lg md:prose-xl max-w-none text-zinc-700 whitespace-pre-wrap leading-relaxed">
              {news.content}
            </motion.div>
          </div>
        </article>
      )}

      <Footer />
    </main>
  );
}
