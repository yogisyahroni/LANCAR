"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, MapPin, Building, ChevronRight, X, Loader2, FileText, Send } from "lucide-react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.5, delay }
  };
}

export default function CareerPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002/api";
      const res = await fetch(`${baseUrl}/public/hr/jobs`);
      const data = await res.json();
      if (res.ok) setJobs(data);
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
            Bergabung Bersama <span className="text-[#7bc043]">Tembus</span>
          </motion.h1>
          <motion.p {...fadeUp(0.1)} className="text-lg text-white/80 max-w-2xl mx-auto">
            Mari menjadi bagian dari revolusi logistik di Indonesia. Kami mencari talenta-talenta terbaik untuk berkembang bersama kami.
          </motion.p>
        </div>
      </section>

      {/* Jobs Section */}
      <section className="py-20 px-6 sm:px-10 lg:px-16 xl:px-20 2xl:px-24 max-w-5xl mx-auto">
        <div className="mb-12">
          <h2 className="text-2xl font-black text-[#071712]">Lowongan Terbuka</h2>
          <p className="text-zinc-500 mt-2">Temukan posisi yang sesuai dengan passion dan keahlian Anda.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-[#7bc043]" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-zinc-200 shadow-sm">
            <Briefcase className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500 font-bold">Saat ini belum ada lowongan terbuka.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {jobs.map((job, idx) => (
              <motion.div
                {...fadeUp(idx * 0.1)}
                key={job.id}
                className="group bg-white p-6 md:p-8 rounded-3xl border border-zinc-200 shadow-sm hover:shadow-xl hover:border-[#7bc043]/30 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-6"
                onClick={() => setSelectedJob(job)}
              >
                <div>
                  <h3 className="text-xl font-black text-zinc-900 group-hover:text-[#7bc043] transition-colors">{job.title}</h3>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm font-semibold text-zinc-600">
                    <span className="flex items-center gap-1.5"><Building size={16} /> {job.department}</span>
                    <span className="flex items-center gap-1.5"><MapPin size={16} /> {job.location}</span>
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-[#f3f4f6] rounded-lg text-zinc-700">{job.employment_type}</span>
                  </div>
                </div>
                <button className="flex items-center justify-center gap-2 px-6 py-3 bg-[#072a20] text-white rounded-xl font-bold hover:bg-[#003d2b] transition-colors shrink-0">
                  Lihat Detail <ChevronRight size={16} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <Footer />

      {/* Application Modal */}
      <AnimatePresence>
        {selectedJob && (
          <ApplicationModal job={selectedJob} onClose={() => setSelectedJob(null)} />
        )}
      </AnimatePresence>
    </main>
  );
}

function ApplicationModal({ job, onClose }: { job: any, onClose: () => void }) {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    portfolio_url: '',
    cover_letter: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002/api";
      const res = await fetch(`${baseUrl}/public/hr/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, job_id: job.id })
      });
      if (res.ok) {
        setIsSuccess(true);
      } else {
        alert("Terjadi kesalahan. Silakan coba lagi.");
      }
    } catch (err) {
      alert("Gagal mengirim lamaran.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-3xl rounded-[32px] overflow-hidden shadow-2xl relative my-auto"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-colors z-10">
          <X size={20} />
        </button>

        <div className="flex flex-col md:flex-row h-full max-h-[85vh]">
          {/* Job Details Sidebar */}
          <div className="bg-[#001911] text-white p-8 md:w-[40%] overflow-y-auto shrink-0">
            <h2 className="text-2xl font-black leading-tight mb-4">{job.title}</h2>
            <div className="space-y-3 mb-8 text-sm font-semibold text-white/80">
              <p className="flex items-center gap-2"><Building size={16} className="text-[#7bc043]" /> {job.department}</p>
              <p className="flex items-center gap-2"><MapPin size={16} className="text-[#7bc043]" /> {job.location}</p>
              <p className="flex items-center gap-2"><Briefcase size={16} className="text-[#7bc043]" /> {job.employment_type}</p>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-[#7bc043] font-bold text-sm uppercase tracking-wider mb-2">Deskripsi Pekerjaan</h4>
                <p className="text-sm text-white/80 whitespace-pre-line leading-relaxed">{job.description}</p>
              </div>
              <div>
                <h4 className="text-[#7bc043] font-bold text-sm uppercase tracking-wider mb-2">Persyaratan</h4>
                <p className="text-sm text-white/80 whitespace-pre-line leading-relaxed">{job.requirements}</p>
              </div>
            </div>
          </div>

          {/* Application Form */}
          <div className="p-8 md:w-[60%] overflow-y-auto bg-white">
            {isSuccess ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
                <div className="w-20 h-20 bg-[#eef6ed] rounded-full flex items-center justify-center text-[#7bc043]">
                  <Send size={40} />
                </div>
                <h3 className="text-2xl font-black text-zinc-900">Lamaran Terkirim!</h3>
                <p className="text-zinc-500 max-w-sm">Terima kasih telah melamar. Tim HR kami akan segera meninjau lamaran Anda dan menghubungi Anda lebih lanjut.</p>
                <button onClick={onClose} className="mt-4 px-8 py-3 bg-[#072a20] text-white rounded-xl font-bold hover:bg-[#003d2b] transition-colors">
                  Tutup
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h3 className="text-2xl font-black text-zinc-900 mb-2">Kirim Lamaran</h3>
                  <p className="text-sm text-zinc-500 mb-6">Silakan lengkapi data diri Anda di bawah ini.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1.5">Nama Lengkap</label>
                  <input required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#7bc043] focus:ring-1 focus:ring-[#7bc043] transition-all" placeholder="Contoh: Budi Santoso" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-1.5">Email</label>
                    <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#7bc043] focus:ring-1 focus:ring-[#7bc043] transition-all" placeholder="budi@email.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-1.5">Nomor Telepon/WA</label>
                    <input required value={formData.phone_number} onChange={e => setFormData({...formData, phone_number: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#7bc043] focus:ring-1 focus:ring-[#7bc043] transition-all" placeholder="08123456789" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1.5">Link Portofolio / LinkedIn / CV (GDrive)</label>
                  <div className="relative">
                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input required type="url" value={formData.portfolio_url} onChange={e => setFormData({...formData, portfolio_url: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-[#7bc043] focus:ring-1 focus:ring-[#7bc043] transition-all" placeholder="https://..." />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-1.5">Cover Letter / Pesan Singkat</label>
                  <textarea rows={4} value={formData.cover_letter} onChange={e => setFormData({...formData, cover_letter: e.target.value})} className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#7bc043] focus:ring-1 focus:ring-[#7bc043] transition-all" placeholder="Ceritakan singkat mengapa Anda cocok untuk posisi ini..." />
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={onClose} className="flex-1 py-3.5 bg-zinc-100 text-zinc-700 rounded-xl font-bold hover:bg-zinc-200 transition-colors">Batal</button>
                  <button type="submit" disabled={isSubmitting} className="flex-[2] py-3.5 bg-[#072a20] text-white rounded-xl font-bold hover:bg-[#003d2b] transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
                    {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                    {isSubmitting ? 'Mengirim...' : 'Kirim Lamaran'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
