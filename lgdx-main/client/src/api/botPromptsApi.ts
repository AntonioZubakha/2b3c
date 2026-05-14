import api from './index';

export type BotPromptBot = 'support' | 'whatsapp';

export interface BotPromptEffectivePayload {
  bot: BotPromptBot;
  fileOrder: string[];
  files: Record<string, string>;
  source: 'database' | 'filesystem';
  /** Latest DB snapshot id; Restore on this row is a no-op (same as current live version). */
  currentSnapshotId?: string;
  updatedAt?: string;
  updatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  changeNote?: string;
}

export interface BotPromptHistoryItem {
  _id: string;
  bot: BotPromptBot;
  updatedAt: string;
  changeNote: string;
  updatedBy?: BotPromptEffectivePayload['updatedBy'];
  fileKeys: string[];
  totalChars: number;
}

export const getBotPrompts = (bot: BotPromptBot) =>
  api.get<BotPromptEffectivePayload>(`/admin/bot-prompts/${bot}`).then(({ data }) => data);

export const saveBotPrompts = (bot: BotPromptBot, body: { files: Record<string, string>; changeNote: string }) =>
  api.put<BotPromptEffectivePayload>(`/admin/bot-prompts/${bot}`, body).then(({ data }) => data);

export const getBotPromptHistory = (bot: BotPromptBot, limit = 30) =>
  api
    .get<BotPromptHistoryItem[]>(`/admin/bot-prompts/${bot}/history`, { params: { limit } })
    .then(({ data }) => data);

export const getBotPromptSnapshot = (snapshotId: string) =>
  api.get<BotPromptEffectivePayload>(`/admin/bot-prompts/history/${snapshotId}`).then(({ data }) => data);

export const restoreBotPromptSnapshot = (bot: BotPromptBot, snapshotId: string, changeNote?: string) =>
  api
    .post<BotPromptEffectivePayload>(`/admin/bot-prompts/${bot}/restore/${snapshotId}`, {
      changeNote: changeNote || undefined,
    })
    .then(({ data }) => data);
