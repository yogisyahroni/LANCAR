import { z } from 'zod';

export const FlagConfigSchema = z.object({
  rollout_pct: z.number().min(0).max(100).optional(),
  active_zones: z.array(z.string()).optional(),
  // bisa tambahkan property dinamis lainnya sesuai kebutuhan
}).passthrough(); // passthrough allows other unknown keys

export const validateFlagConfig = (data: unknown) => {
  return FlagConfigSchema.parse(data);
};
