import { z } from 'zod';
export const triageSchema = z.object({
  symptoms: z.array(z.string().min(1)).min(1).max(20),
  age: z.number().int().min(0).max(120).optional(),
  duration: z.string().max(100).optional(),
  severity: z.number().int().min(1).max(10),
  existingConditions: z.array(z.string()).max(20).optional().default([]),
  medications: z.array(z.string()).max(20).optional().default([]),
  location: z.string().max(100).optional().default('')
});
