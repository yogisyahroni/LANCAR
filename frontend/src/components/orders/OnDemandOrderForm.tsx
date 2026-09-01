'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { OnDemandOrderFormContent } from './OnDemandOrderFormContent';
import { OrderFormProps } from './OrderSchemas';
import { useOnDemandOrderFormRuntime } from './useOnDemandOrderFormRuntime';

function DimensionScanModal({ isOpen, onClose, onApply }: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (dimensions: { length: number; width: number; height: number; weight_kg: number }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'ready' | 'blocked'>('idle');
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [cameraMessage, setCameraMessage] = useState('Menyiapkan kamera...');
  const [result, setResult] = useState<{ length: number; width: number; height: number; weight_kg: number } | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraState('blocked'); setCameraMessage('Browser tidak mendukung akses kamera.'); return; }
    setCameraState('starting'); setCameraMessage('Menyiapkan kamera...'); stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; videoRef.current.playsInline = true; await videoRef.current.play().catch(() => undefined); }
      setCameraState('ready'); setCameraMessage('Kamera aktif. Jika layar tetap gelap, coba tutup dan buka scan lagi.');
    } catch { setCameraState('blocked'); setCameraMessage('Kamera tidak tersedia atau sedang dipakai aplikasi lain.'); }
  }, [stopCamera]);
  useEffect(() => {
    if (!isOpen) return;
    void startCamera();
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);
  if (!isOpen) return null;
  const runScan = () => { setScanState('scanning'); window.setTimeout(() => { setResult(null); setScanState('done'); }, 1200); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-label="Tutup modal scan" />
      <div role="dialog" aria-modal="true" aria-labelledby="dimension-scan-title" tabIndex={-1} className="relative max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-background/95 shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/10 p-5"><div><h3 id="dimension-scan-title" className="text-lg font-semibold">Scan Dimensi via Webcam</h3><p className="mt-1 text-sm text-muted-foreground">Letakkan paket dan kartu referensi di area kamera. Hasil bisa dikoreksi manual setelah diterapkan.</p></div><button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full p-2 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Tutup"><X className="h-4 w-4" /></button></div>
        <div className="grid gap-5 p-5 md:grid-cols-[1.2fr_.8fr]">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
            <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={(event) => { void event.currentTarget.play().catch(() => undefined); }} className={`h-full w-full object-cover transition-opacity duration-300 ${cameraState === 'ready' ? 'opacity-100 brightness-110 contrast-110' : 'opacity-0'}`} />
            {cameraState !== 'ready' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-sm text-muted-foreground">{cameraState === 'starting' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-8 w-8" />}<span>{cameraMessage}</span>{cameraState === 'blocked' && <button type="button" onClick={() => void startCamera()} className="rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500/90">Coba Kamera Lagi</button>}</div>}
            <div className="pointer-events-none absolute inset-[14%] rounded-xl border-2 border-dashed border-brand-emerald-400/70" /><div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white">Align paket di kotak hijau</div>
            {cameraState === 'ready' && <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-brand-emerald-500/20 px-2 py-1 text-xs font-semibold text-brand-emerald-200">Kamera aktif</div>}
          </div>
          <div className="space-y-4"><div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estimasi hasil</p>{result ? <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div>Panjang: <b>{result.length} cm</b></div><div>Lebar: <b>{result.width} cm</b></div><div>Tinggi: <b>{result.height} cm</b></div><div>Berat: <b>{result.weight_kg} kg</b></div></div> : <p className="mt-3 text-sm text-muted-foreground">Hasil dimensi otomatis belum tersedia. Isi ukuran paket secara manual di form.</p>}</div><button type="button" onClick={runScan} disabled={scanState === 'scanning'} className="w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500/90 disabled:opacity-60">{scanState === 'scanning' ? 'Menganalisis...' : scanState === 'done' ? 'Scan Ulang' : 'Mulai Scan'}</button><button type="button" onClick={() => { if (result) { onApply(result); onClose(); } }} disabled={!result} className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10">Terapkan ke Form</button></div>
        </div>
      </div>
    </div>
  );
}

export function OnDemandOrderForm(props: OrderFormProps) {
  const state = useOnDemandOrderFormRuntime(props);
  return <OnDemandOrderFormContent {...state} DimensionScanModal={DimensionScanModal} />;
}
