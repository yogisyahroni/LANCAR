'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { UploadCloud, AlertCircle, CheckCircle2, Download, Loader2, MapPin, Navigation, Search } from 'lucide-react';

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
  const [pickupLat, setPickupLat] = useState(-6.200000);
  const [pickupLng, setPickupLng] = useState(106.816666);
  const [isLocating, setIsLocating] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const droppedFile = acceptedFiles[0];

      // S3-CW-04: Double-check MIME type — react-dropzone filters by extension
      // but we verify actual file.type to reject disguised executables.
      // Some browsers report 'application/octet-stream' for .csv which we also allow.
      const allowedMimes = new Set(['text/csv', 'text/plain', 'application/csv', 'application/octet-stream']);
      if (droppedFile.type && !allowedMimes.has(droppedFile.type)) {
        setError(`Format file tidak diizinkan (${droppedFile.type}). Hanya file .csv yang diterima.`);
        return;
      }

      // S3-CW-04: Block filenames containing path traversal characters
      if (droppedFile.name.includes('..') || droppedFile.name.includes('/') || droppedFile.name.includes('\\')) {
        setError('Nama file tidak valid.');
        return;
      }

      setFile(droppedFile);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
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

    // S3-CW-04: Sanitize pickup_address to strip CSV injection prefixes.
    // Cells starting with =, +, -, @ are CSV injection vectors when exported.
    const csvInjectionPrefixes = /^[=+\-@\t\r]/;
    const sanitizedAddress = pickupAddress.trim();
    if (csvInjectionPrefixes.test(sanitizedAddress)) {
      setError('Alamat pickup mengandung karakter tidak valid di awal. Harap mulai dengan huruf atau angka.');
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
    downloadCsv(
      'Template_Tembus_Kirim_Massal.csv',
      [
        {
          recipient_name: 'Budi Santoso',
          recipient_phone: '08123456789',
          dropoff_address: 'Jl. Merdeka No. 10, Gambir, Jakarta Pusat',
          category: 'fashion',
          weight_kg: 1.2,
          length_cm: 30,
          width_cm: 20,
          height_cm: 15,
          has_insurance: 'Tidak',
          item_value: '',
          customer_notes: 'Titip ke resepsionis'
        },
        {
          recipient_name: 'Siti Rahayu',
          recipient_phone: '+6285566778899',
          dropoff_address: 'Jl. Kelapa Gading Boulevard, Jakarta Utara',
          category: 'document',
          weight_kg: 0.5,
          length_cm: 24,
          width_cm: 18,
          height_cm: 2,
          has_insurance: 'Ya',
          item_value: 250000,
          customer_notes: ''
        }
      ],
      [
        'recipient_name',
        'recipient_phone',
        'dropoff_address',
        'category',
        'weight_kg',
        'length_cm',
        'width_cm',
        'height_cm',
        'has_insurance',
        'item_value',
        'customer_notes'
      ]
    );
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Browser tidak mendukung geolocation. Isi alamat pickup manual.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPickupLat(position.coords.latitude);
        setPickupLng(position.coords.longitude);
        if (!pickupAddress) {
          setPickupAddress(`Lokasi saat ini (${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)})`);
        }
        setIsLocating(false);
      },
      () => {
        setError('Izin lokasi ditolak. Isi alamat pickup manual.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const pollStatus = async () => {
      if (!pollingJobId) return;
      try {
        const res = await api.get(`/auth/web/orders/bulk/status/${pollingJobId}`);
        const data = res.data;

        setProgress({ total: data.total_rows || data.total || 0, processed: data.processed_rows || data.total || 0 });

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
          className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/15"
        >
          <Download className="h-4 w-4" />
          Download Template Excel Standar
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
            onClick={useCurrentLocation}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
            disabled={isUploading}
          >
            {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            Gunakan Lokasi Saya
          </button>
          <p className="text-xs text-muted-foreground">
            Koordinat pickup: {pickupLat.toFixed(5)}, {pickupLng.toFixed(5)}
          </p>
        </div>
      </section>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`relative overflow-hidden border-2 border-dashed rounded-2xl p-10 transition-all duration-200 ease-in-out cursor-pointer flex flex-col items-center justify-center text-center ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-white/5'
        } ${isUploading && !pollingJobId ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />

        {pollingJobId ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-md mx-auto">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="w-full space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span>Memproses Data...</span>
                <span>{progress.processed} / {progress.total} Baris</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-primary h-2.5 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Sedang mencari koordinat tujuan dan menghitung rute...</p>
            </div>
          </div>
        ) : file ? (
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
              <p className="text-sm text-muted-foreground mt-1">atau klik untuk menelusuri file .csv (Maks 5MB, 500 baris)</p>
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
