import { logger } from './logger';

/**
 * Единый префикс для grep в логах сервера: `[ChatSystem]`
 * channel: guest_http | user_http | websocket | telegram | ai | session
 */
export function chatSystemInfo(
  phase: string,
  fields: Record<string, unknown> & { channel?: string }
): void {
  logger.info(`[ChatSystem] ${phase}`, fields);
}

export function chatSystemWarn(
  phase: string,
  fields: Record<string, unknown> & { channel?: string }
): void {
  logger.warn(`[ChatSystem] ${phase}`, fields);
}

export function chatSystemError(
  phase: string,
  fields: Record<string, unknown> & { channel?: string },
  err?: unknown
): void {
  logger.error(`[ChatSystem] ${phase}`, {
    ...fields,
    error: err instanceof Error ? err.message : err
  });
}

/** Редкие/шумные события (например список сообщений) — в проде часто отфильтровывают debug. */
export function chatSystemDebug(phase: string, fields: Record<string, unknown>): void {
  logger.debug(`[ChatSystem] ${phase}`, fields);
}
