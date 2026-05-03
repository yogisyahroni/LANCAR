'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { api } from '@/lib/api';
import { UploadCloud, AlertCircle, CheckCircle2, Loader2, MapPin, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

interface UploadStepProps {
  onComplete: (jobId: string, validatedData: any) => void;
}

export function UploadStep({ onComplete }: UploadStepProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ total: 0, processed: 0 });
  const [pickupAddress, setPickupAddress] = useState('');

  const pickupLat = -6.200000;
  const pickupLng = 106.816666;

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!file) {
      setError('Pilih file terlebih dahulu');
      return;
    }
    if (!pickupAddress) {
      setError('Alamat pickup wajib diisi');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pickup_address', pickupAddress);
      formData.append('pickup_lat', pickupLat.toString());
      formData.append('pickup_lng', pickupLng.toString());

      const res = await api.post('/auth/web/orders/bulk/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPollingJobId(res.data.job_id);
    } catch (err: any) {
      setIsUploading(false);
      setError(err.response?.data?.error || 'Gagal mengunggah file.');
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        recipient_name: 'Budi Santoso',
        recipient_phone: '08123456789',
        dropoff_address: 'Jl. Sudirman No 1',
        weight_kg: 1
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, "Template_Lancar_Bulk.xlsx");
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const pollStatus = async () => {
      if (!pollingJobId) return;
      try {
        const res = await api.get(`/auth/web/orders/bulk/status/${pollingJobId}`);
        const data = res.data;

        setProgress({ total: data.total_rows, processed: data.processed_rows });

        if (data.status === 'completed') {
          clearInterval(interval);
          setIsUploading(false);
          onComplete(pollingJobId, data);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setIsUploading(false);
          setError('Proses validasi gagal.');
        }
      } catch (err) {
        clearInterval(interval);
        setIsUploading(false);
        setError('Gagal mengecek status job.');
      }
    };

    if (pollingJobId) {
      interval = setInterval(pollStatus, 3000);
      pollStatus();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pollingJobId, onComplete]);

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Langkah 1: Upload Data Pengiriman</h2>
        <p className="text-sm text-muted-foreground">Unduh template, isi dengan data penerima, lalu unggah kembali.</p>
        <button
          onClick={downloadTemplate}
          className="text-primary text-sm font-medium hover:underline inline-flex items-center gap-1"
        >
          Download Template Excel
        </button>
      </div>

      {/* Pickup Info */}
      <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="h-5 w-5 text-primary" />
          Detail Pengambilan Semua Paket (Pickup)
        </h3>

        <div className="space-y-3">
          <label className="text-sm font-medium text-muted-foreground">Alamat Lengkap</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background/50 py-3 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Cari lokasi bangunan, jalan..."
              disabled={isUploading}
            />
          </div>
          <button
            type="button"
            onClick={() => setPickupAddress("Jalan Jend. Sudirman, Senayan, Kebayoran Baru, Jakarta Selatan")}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
            disabled={isUploading}
          >
            Gunakan Lokasi Saya (Mock)
          </button>
        </div>
      </section>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`relative overflow-hidden border-2 border-dashed rounded-2xl p-10 transition-all duration-200 ease-in-out cursor-pointer flex flex-col items-center justify-center text-center ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-white/5'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />

        {file ? (
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-full">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <p className="text-xs text-primary font-medium mt-2">Klik untuk ganti file</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-muted rounded-full">
              <UploadCloud className="w-10 h-10 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-lg">Tarik &amp; Lepas file Excel di sini</p>
              <p className="text-sm text-muted-foreground mt-1">atau klik untuk menelusuri file (Maks 5MB)</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4" />
          <p>{error}</p>
        </div>
      )}

      {/* Action Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleUpload}
          disabled={!file || !pickupAddress || isUploading}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
            !file || !pickupAddress || isUploading
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-95 shadow-md shadow-primary/20'
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {pollingJobId ? `Memproses (${progress.processed}/${progress.total})...` : 'Mengunggah...'}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Mulai Validasi
            </>
          )}
        </button>
      </div>
    </div>
  );
}
