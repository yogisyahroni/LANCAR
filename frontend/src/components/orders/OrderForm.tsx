"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { MapPin, Search, Maximize, Box, Camera, Info } from "lucide-react";
import { useEffect } from "react";

export const orderSchema = z.object({
  pickup_address: z.string().min(5, "Alamat pickup minimal 5 karakter"),
  pickup_location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  dropoff_address: z.string().min(5, "Alamat tujuan minimal 5 karakter"),
  dropoff_location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  recipient_name: z.string().min(3, "Nama penerima wajib diisi"),
  recipient_phone: z.string().min(10, "Nomor HP tidak valid"),
  package_details: z.object({
    category: z.string().min(1, "Pilih kategori paket"),
    weight_kg: z.number().min(0.1, "Berat wajib diisi"),
    dimensions: z.object({
      length: z.number().min(1, "Panjang wajib diisi"),
      width: z.number().min(1, "Lebar wajib diisi"),
      height: z.number().min(1, "Tinggi wajib diisi"),
    })
  }),
  has_insurance: z.boolean().default(false),
  item_value: z.number().optional(),
  schedule_type: z.enum(["now", "scheduled"]).default("now"),
  scheduled_at: z.string().optional(),
  customer_notes: z.string().max(200).optional()
});

export type OrderFormValues = z.infer<typeof orderSchema>;

interface OrderFormProps {
  onFormChange: (data: Partial<OrderFormValues>, isValid: boolean) => void;
  onSubmit: (data: OrderFormValues) => void;
}

export function OrderForm({ onFormChange, onSubmit }: OrderFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    mode: "onChange",
    defaultValues: {
      schedule_type: "now",
      has_insurance: false,
      package_details: {
        weight_kg: 1,
        dimensions: { length: 10, width: 10, height: 10 }
      }
    }
  });

  const watchAll = watch();

  useEffect(() => {
    onFormChange(watchAll, isValid);
  }, [watchAll, isValid, onFormChange]);

  const useMyLocation = (field: 'pickup_location' | 'dropoff_location') => {
    // Mock geolocation
    setValue(field, { lat: -6.200000, lng: 106.816666 }, { shouldValidate: true });
    if (field === 'pickup_location') {
      setValue('pickup_address', "Jalan Jend. Sudirman, Senayan, Kebayoran Baru, Jakarta Selatan", { shouldValidate: true });
    }
  };

  return (
    <form id="order-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      
      {/* 1. Alamat Pickup */}
      <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="h-5 w-5 text-primary" />
          Detail Pengambilan (Pickup)
        </h3>
        
        <div className="space-y-3">
          <label className="text-sm font-medium text-muted-foreground">Alamat Lengkap</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input 
              {...register("pickup_address")}
              className="w-full rounded-lg border border-white/10 bg-background/50 py-3 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Cari lokasi bangunan, jalan..."
            />
          </div>
          {errors.pickup_address && <p className="text-xs text-destructive">{errors.pickup_address.message}</p>}
          
          <div className="flex gap-2">
            <button 
              type="button" 
              onClick={() => useMyLocation('pickup_location')}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
            >
              Gunakan Lokasi Saya
            </button>
            <button type="button" className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium hover:bg-white/10">
              Pilih dari Buku Alamat
            </button>
          </div>
          
          {/* Mock Interactive Map */}
          <div className="h-40 w-full rounded-lg border border-white/10 bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=-6.200000,106.816666&zoom=14&size=600x300&maptype=roadmap&style=element:geometry%7Ccolor:0x242f3e&style=element:labels.text.stroke%7Ccolor:0x242f3e&style=element:labels.text.fill%7Ccolor:0x746855')] bg-cover bg-center opacity-80 transition-opacity hover:opacity-100">
             <div className="flex h-full items-center justify-center">
                <MapPin className="h-8 w-8 -translate-y-4 text-primary drop-shadow-lg" />
             </div>
          </div>
        </div>
      </section>

      {/* 2. Alamat Tujuan */}
      <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="h-5 w-5 text-emerald-500" />
          Detail Pengiriman (Dropoff)
        </h3>
        
        <div className="space-y-3">
          <label className="text-sm font-medium text-muted-foreground">Alamat Lengkap</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input 
              {...register("dropoff_address")}
              className="w-full rounded-lg border border-white/10 bg-background/50 py-3 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Cari lokasi bangunan, jalan..."
            />
          </div>
          {errors.dropoff_address && <p className="text-xs text-destructive">{errors.dropoff_address.message}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Nama Penerima</label>
              <input 
                {...register("recipient_name")}
                className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Mis: Budi Santoso"
              />
              {errors.recipient_name && <p className="mt-1 text-xs text-destructive">{errors.recipient_name.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Nomor HP</label>
              <input 
                {...register("recipient_phone")}
                type="tel"
                className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Mis: 08123456789"
              />
              {errors.recipient_phone && <p className="mt-1 text-xs text-destructive">{errors.recipient_phone.message}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Detail Paket */}
      <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Box className="h-5 w-5 text-indigo-400" />
            Detail Paket
          </h3>
          <button type="button" className="flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20">
            <Camera className="h-3.5 w-3.5" />
            Scan ML (Beta)
          </button>
        </div>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Kategori Barang</label>
            <select 
              {...register("package_details.category")}
              className="w-full appearance-none rounded-lg border border-white/10 bg-background/50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Pilih Kategori</option>
              <option value="document">Dokumen</option>
              <option value="food">Makanan / Minuman</option>
              <option value="electronics">Elektronik</option>
              <option value="clothes">Pakaian</option>
              <option value="other">Lainnya</option>
            </select>
            {errors.package_details?.category && <p className="mt-1 text-xs text-destructive">{errors.package_details.category.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Berat Aktual (kg)</label>
            <input 
              {...register("package_details.weight_kg", { valueAsNumber: true })}
              type="number"
              step="0.1"
              className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            Dimensi Paket (cm) <Maximize className="h-3.5 w-3.5" />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <input {...register("package_details.dimensions.length", { valueAsNumber: true })} type="number" placeholder="P" className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2 text-sm text-center" />
            <input {...register("package_details.dimensions.width", { valueAsNumber: true })} type="number" placeholder="L" className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2 text-sm text-center" />
            <input {...register("package_details.dimensions.height", { valueAsNumber: true })} type="number" placeholder="T" className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2 text-sm text-center" />
          </div>
        </div>

        {/* Asuransi */}
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" {...register("has_insurance")} className="mt-1 h-4 w-4 rounded border-white/10 bg-background" />
            <div>
              <p className="text-sm font-medium text-amber-500">Gunakan Asuransi Pengiriman</p>
              <p className="text-xs text-muted-foreground">Lindungi barang berharga Anda. Premi 0.2% dari nilai barang.</p>
            </div>
          </label>
          {watchAll.has_insurance && (
            <div className="ml-7 mt-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nilai Barang (Rp)</label>
              <input 
                {...register("item_value", { valueAsNumber: true })}
                type="number"
                placeholder="Mis: 1000000"
                className="w-full rounded-lg border border-white/10 bg-background/50 px-4 py-2 text-sm"
              />
            </div>
          )}
        </div>

        <div>
           <label className="mb-1 block text-sm font-medium text-muted-foreground">Catatan untuk Kurir</label>
           <textarea 
             {...register("customer_notes")}
             rows={3}
             className="w-full resize-none rounded-lg border border-white/10 bg-background/50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
             placeholder="Tinggalkan di pos satpam, dll."
             maxLength={200}
           />
        </div>
      </section>
      
    </form>
  );
}
