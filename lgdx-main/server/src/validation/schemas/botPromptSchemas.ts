import { z } from 'zod';

/** Keys validated in BotPromptService; here only size bounds. */
export const UpdateBotPromptsBodySchema = z.object({
  files: z.record(z.string(), z.string().max(200_000)),
  changeNote: z.string().min(1, 'Change note is required').max(500),
});

export const RestoreBotPromptBodySchema = z.object({
  changeNote: z.string().min(1).max(500).optional(),
});
