"use client";

import { useState, useEffect } from "react";
import { OrderForm, OrderFormValues } from "@/components/orders/OrderForm";
import { OrderSummary } from "@/components/orders/OrderSummary";
import { PaymentModal } from "@/components/orders/PaymentModal";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useNotificationStore } from "@/store/useNotificationStore";

export default function NewOrderPage() {
  const [formData, setFormData] = useState<Partial<OrderFormValues>>({});
  const [isValid, setIsValid] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pricing, setPricing] = useState<any>(null);
  
  const [showPayment, setShowPayment] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [orderData, setOrderData] = useState<any>(null);

  const router = useRouter();
  const addNotification = useNotificationStore((state: ReturnType<typeof useNotificationStore.getState>) => state.addNotification);

  // Debounce effect for price calculation
  useEffect(() => {
    const handler = setTimeout(() => {
      // Only calculate if basic fields exist
      if (formData.pickup_location && formData.dropoff_location) {
        calculatePricing();
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [
    formData.pickup_location, 
    formData.dropoff_location, 
    formData.package_details, 
    formData.has_insurance, 
    formData.item_value
  ]);

  const calculatePricing = async () => {
    setIsCalculating(true);
    try {
      const res = await api.post('/orders/calculate', {
        pickup: formData.pickup_location,
        dropoff: formData.dropoff_location,
        weight_kg: formData.package_details?.weight_kg,
        dimensions: formData.package_details?.dimensions,
        has_insurance: formData.has_insurance,
        item_value: formData.item_value
      });
      setPricing(res.data);
    } catch (error) {
      console.error("Failed to calculate pricing", error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleFormChange = (data: Partial<OrderFormValues>, valid: boolean) => {
    setFormData(data);
    setIsValid(valid);
  };

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
