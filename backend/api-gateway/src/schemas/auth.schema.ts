import { z } from 'zod';

export const OTPSendSchema = z.object({
  body: z.object({
    phone_number: z.string().min(5).max(255),
  }),
});

export const OTPVerifySchema = z.object({
  body: z.object({
    phone_number: z.string().min(5).max(255),
    code: z.string().length(6),
  }),
});

export const RegisterSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email().optional(),
    role: z.enum(['customer', 'courier']).optional(),
  }),
});
