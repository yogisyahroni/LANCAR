"use client";

import { useState, useEffect, useCallback } from "react";
import { OrderForm, OrderFormValues } from "@/components/orders/OrderForm";
import { OrderSummary } from "@/components/orders/OrderSummary";
import { PaymentModal } from "@/components/orders/PaymentModal";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useNotificationStore } from "@/store/useNotificationStore";
import { Info } from "lucide-react";

export default function NewOrderPage() {
  const [formData, setFormData] = useState<Partial<OrderFormValues>>({});
  const [isValid, setIsValid] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pricing, setPricing] = useState<any>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  
  const [showPayment, setShowPayment] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [orderData, setOrderData] = useState<any>(null);

  const router = useRouter();
  const { addNotification } = useNotificationStore();

  const calculatePricing = useCallback(async (data: Partial<OrderFormValues>) => {
    setIsCalculating(true);
    setCoverageError(null);
    try {
      const res = await api.post('/orders/calculate', {
        pickup: data.pickup_location,
        dropoff: data.dropoff_location,
        weight_kg: data.package_details?.weight_kg,
        dimensions: data.package_details?.dimensions,
        has_insurance: data.has_insurance,
        item_value: data.item_value
      });
      setPricing(res.data);
    } catch (error: any) {
      console.error("Failed to calculate pricing", error);
      if (error.response?.data?.code === 'ERR_LOCATION_NOT_COVERED') {
        setCoverageError(error.response.data.message);
        setPricing(null);
      } else {
        setCoverageError(null);
      }
    } finally {
      setIsCalculating(false);
    }
  }, []);

  // Debounce effect for price calculation based on individual fields
  useEffect(() => {
    const handler = setTimeout(() => {
      // Only calculate if basic fields exist
      if (formData.pickup_location && formData.dropoff_location) {
        calculatePricing(formData);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [
    formData.pickup_location?.lat,
    formData.pickup_location?.lng,
    formData.dropoff_location?.lat,
    formData.dropoff_location?.lng,
    formData.package_details?.weight_kg,
    formData.package_details?.dimensions?.length,
    formData.package_details?.dimensions?.width,
    formData.package_details?.dimensions?.height,
    formData.has_insurance,
    formData.item_value,
    calculatePricing
  ]);

  const handleFormChange = useCallback((data: Partial<OrderFormValues>, valid: boolean) => {
    setFormData(data);
    setIsValid(valid);
  }, []);

  const handleSubmit = async (data: OrderFormValues) => {
    if (!pricing) return;
    setIsSubmitting(true);
    try {
      const payload = {
        ...data,
        price_breakdown: pricing
      };
      
      const res = await api.post('/orders', payload);
      
      setOrderData(res.data.order);
      setPaymentData(res.data.payment);
      setShowPayment(true);
      
    } catch (error: any) {
      addNotification({
        title: "Gagal membuat order",
        message: error.response?.data?.error || "Terjadi kesalahan",
        type: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    addNotification({
      title: "Pembayaran Berhasil",
      message: `Order ${orderData?.order_number} sedang diproses.`,
      type: "success"
    });
    router.push('/dashboard');
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Kirim Paket Baru</h1>
        <p className="mt-2 text-muted-foreground">Isi detail pengambilan dan tujuan dengan lengkap.</p>
      </div>

      {coverageError && (
        <div className="mb-6 p-6 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-md flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="p-3 bg-red-500/20 rounded-xl text-red-400">
            <Info className="h-6 w-6" />
          </div>
          <div>
            <h4 className="font-bold text-zinc-100 tracking-tight">Wilayah Pengiriman Tidak Tercover</h4>
            <p className="text-sm text-muted-foreground mt-1">{coverageError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Col - Form (takes 2/3 space) */}
        <div className="lg:col-span-2">
          <OrderForm 
            onFormChange={handleFormChange}
            onSubmit={handleSubmit}
          />
        </div>

        {/* Right Col - Summary (takes 1/3 space) */}
        <div className="relative">
          <OrderSummary 
            isLoading={isCalculating || isSubmitting}
            pricing={pricing}
            isValid={isValid}
          />
        </div>
      </div>

      {showPayment && paymentData && (
        <PaymentModal
          isOpen={showPayment}
          onClose={() => setShowPayment(false)}
          qrisString={paymentData.qris_string}
          amount={pricing?.total_price_idr || 0}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
