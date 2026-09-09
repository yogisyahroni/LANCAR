import { z } from 'zod';

export const FlagConfigSchema = z.object({
  mode: z.enum(['off', 'on', 'percentage']).optional(),
  rollout_pct: z.number().min(0).max(100).optional(),
  active_zones: z.array(z.string()).optional(),
  market_codes: z.array(z.string()).optional(),
  markets: z.array(z.string()).optional(),
  city_codes: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  cohorts: z.array(z.string()).optional(),
  client_types: z.array(z.enum(['customer', 'courier', 'merchant', 'web'])).optional(),
  min_app_version_code: z.number().int().positive().optional(),
  max_app_version_code: z.number().int().positive().optional(),
  required_capabilities: z.array(z.string()).optional(),
  variant: z.string().max(100).optional(),
  high_blast_radius: z.boolean().optional(),
  // Existing operational flags have domain-specific values (for example
  // peak_hours and max_multiplier). Keep those values intact while enforcing
  // the rollout/context fields above.
}).passthrough(); // passthrough allows other unknown keys

export const validateFlagConfig = (data: unknown) => {
  return FlagConfigSchema.parse(data);
};
