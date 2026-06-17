'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { customerApiUrl } from '@/lib/runtimeConfig';

interface CheckoutButtonProps {
  paymentLinkId: string;
}

export default function CheckoutButton({ paymentLinkId }: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  useEffect(() => {
    // Load Midtrans snap.js script
    const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || 'SB-Mid-client-XXXXX'; // Fallback for types
    const scriptUrl = process.env.NEXT_PUBLIC_MIDTRANS_ENV === 'production' 
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js';
      
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.setAttribute('data-client-key', clientKey);
    script.async = true;
    script.onload = () => setIsScriptLoaded(true);
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleCheckout = async () => {
    if (!isScriptLoaded || typeof window === 'undefined' || !(window as any).snap) {
      alert('Payment gateway is still loading. Please try again in a few seconds.');
      return;
    }

    try {
      setIsLoading(true);
      
      const res = await fetch(`${customerApiUrl}/payment-links/${paymentLinkId}/checkout`, {
        method: 'POST',
      });
      
      const result = await res.json();
      
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to initialize payment');
      }

      const snapToken = result.data.token;
      
      (window as any).snap.pay(snapToken, {
        onSuccess: function(result: any) {
          window.location.reload();
        },
        onPending: function(result: any) {
          alert('Waiting for payment. Please complete your payment.');
        },
        onError: function(result: any) {
          alert('Payment failed. Please try again.');
          setIsLoading(false);
        },
        onClose: function() {
          setIsLoading(false);
        }
      });
      
    } catch (error: any) {
      alert(error.message || 'An error occurred during checkout');
      setIsLoading(false);
    }
  };

  return (
    <button 
      onClick={handleCheckout}
      disabled={isLoading}
      className="w-full py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-2xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] shadow-lg shadow-primary/25 disabled:opacity-70 disabled:hover:scale-100"
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <CreditCard className="w-5 h-5" />
      )}
      {isLoading ? 'Memproses...' : 'Bayar Sekarang'}
    </button>
  );
}
