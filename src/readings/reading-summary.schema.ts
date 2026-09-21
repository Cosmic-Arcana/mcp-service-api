import { z } from 'zod';

export const readingSummarySchema = z.object({
  id: z.string(),
  readAt: z.string().describe('ISO 8601 date-time'),
  topic: z.string(),
  spread: z.string(),
  cards: z.array(z.object({ name: z.string(), reversed: z.boolean() })),
  summary: z.string(),
});

export type ReadingSummary = z.infer<typeof readingSummarySchema>;
