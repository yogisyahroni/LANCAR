import { z } from 'zod';

export const PricingEstimateSchema = z.object({
  body: z.object({
    pickup_lat: z.number().min(-90).max(90),
    pickup_lng: z.number().min(-180).max(180),
    dropoff_lat: z.number().min(-90).max(90),
    dropoff_lng: z.number().min(-180).max(180),
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    weight: z.number().positive(),
  }),
});

export const CreateOrderSchema = z.object({
  body: z.object({
    estimate_id: z.string().uuid().or(z.string().min(10)), // flexible for our generated IDs
  }),
});

export const GetOrderSchema = z.object({
  query: z.object({
    id: z.string().min(1),
  }),
});
