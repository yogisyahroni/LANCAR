'use client';

import { useEffect, useState } from 'react';
import { UploadStep } from '@/components/orders/bulk/UploadStep';
import { ReviewStep } from '@/components/orders/bulk/ReviewStep';
import { PaymentStep } from '@/components/orders/bulk/PaymentStep';
import { api } from '@/lib/api';

const BULK_JOB_STORAGE_KEY = 'tembus.bulk.pending-job';

export default function BulkOrderPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [validatedData, setValidatedData] = useState<any>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    const storedJobId = window.sessionStorage.getItem(BULK_JOB_STORAGE_KEY);
    if (!storedJobId) {
      setIsRestoring(false);
      return;
    }

    api.get(`/auth/web/orders/bulk/status/${storedJobId}`)
      .then((response) => {
        const data = response.data;
        if (data.status === 'processed') {
          window.sessionStorage.removeItem(BULK_JOB_STORAGE_KEY);
          window.location.assign('/orders');
          return;
        }
        setJobId(storedJobId);
        if (data.status === 'completed') {
          setValidatedData(data);
          setCurrentStep(2);
        }
      })
      .catch(() => {
        window.sessionStorage.removeItem(BULK_JOB_STORAGE_KEY);
      })
      .finally(() => setIsRestoring(false));
  }, []);

  const handleUploadComplete = (id: string, data: any) => {
    setJobId(id);
    setValidatedData(data);
    window.sessionStorage.setItem(BULK_JOB_STORAGE_KEY, id);
    setCurrentStep(2);
  };

  const handleReviewComplete = (data: any) => {
    setValidatedData(data);
    setCurrentStep(3);
  };

  const handlePaymentComplete = () => {
    window.sessionStorage.removeItem(BULK_JOB_STORAGE_KEY);
    setCurrentStep(1);
    setJobId(null);
    setValidatedData(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kirim Massal (Bulk Order)</h1>
          <p className="text-muted-foreground mt-1">
            Unggah file Excel untuk mengirim banyak paket sekaligus.
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted rounded-full" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
          />

          {[
            { step: 1, label: 'Upload Data' },
            { step: 2, label: 'Review & Edit' },
            { step: 3, label: 'Bayar & Proses' },
          ].map((item) => (
            <div key={item.step} className="relative flex flex-col items-center gap-2 bg-background px-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm border-2 transition-colors duration-300 ${
                  currentStep >= item.step
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-muted-foreground/30'
                }`}
              >
                {item.step}
              </div>
              <span
                className={`text-xs font-medium ${
                  currentStep >= item.step ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border p-6 min-h-[500px]">
        {isRestoring && <p className="text-sm text-muted-foreground">Memulihkan sesi upload...</p>}
        {currentStep === 1 && (
          <UploadStep onComplete={handleUploadComplete} resumeJobId={jobId} />
        )}
        
        {currentStep === 2 && jobId && validatedData && (
          <ReviewStep 
            jobId={jobId}
            initialData={validatedData} 
            onNext={handleReviewComplete}
            onBack={() => setCurrentStep(1)} 
          />
        )}

        {currentStep === 3 && jobId && validatedData && (
          <PaymentStep 
            jobId={jobId}
            data={validatedData}
            onComplete={handlePaymentComplete}
          />
        )}
      </div>
    </div>
  );
}
