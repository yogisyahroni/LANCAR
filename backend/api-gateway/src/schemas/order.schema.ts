import { z } from 'zod';

export const PricingEstimateSchema = z.object({
  body: z.object({
    pickup_lat: z.number().min(-90).max(90),
    pickup_lng: z.number().min(-180).max(180),
    dropoff_lat: z.number().min(-90).max(90),
    dropoff_lng: z.number().min(-180).max(180),
    length: z.number().positive().max(300),
    width: z.number().positive().max(300),
    height: z.number().positive().max(300),
    weight: z.number().positive().max(200),
    models: z.array(z.string().min(2).max(32)).min(1).max(3).optional(),
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
