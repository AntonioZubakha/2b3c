import { z } from 'zod';
import { PhoneSchema } from '../baseSchemas';

export const DemoRequestSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Please enter a valid email'),
  phone: PhoneSchema,
  company: z.string().max(200).optional(),
  message: z.string().max(2000).optional()
});

export type DemoRequestInput = z.infer<typeof DemoRequestSchema>;
