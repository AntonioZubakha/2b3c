import { performance } from 'node:perf_hooks';
import { logger } from '../utils/logger';

/** Pipeline timing logs only when `WHATSAPP_TIMING_VERBOSE=true` (default: off — less console I/O on hot path). */
export function isWhatsAppTimingEnabled(): boolean {
  return process.env.WHATSAPP_TIMING_VERBOSE === 'true';
}

export function waIdPrefixForLog(waId: string): string {
  if (waId.length <= 12) return waId;
  return `${waId.slice(0, 8)}…`;
}

/**
 * High-resolution pipeline timing for WhatsApp auto-reply (Baileys + Cloud).
 * Each `phase` logs since previous phase and since timer start.
 */
export class WhatsAppPipelineTimer {
  private readonly t0 = performance.now();
  private last = this.t0;

  constructor(
    private readonly ctx: { messageId: string; channel: string; waIdPrefix: string }
  ) {}

  phase(phase: string, extra?: Record<string, unknown>): void {
    if (!isWhatsAppTimingEnabled()) return;
    const now = performance.now();
    const sincePrevMs = Math.round(now - this.last);
    const sinceStartMs = Math.round(now - this.t0);
    this.last = now;
    logger.info('[WhatsAppTiming]', {
      ...this.ctx,
      phase,
      sincePrevMs,
      sinceStartMs,
      ...extra
    });
  }

  totalMs(): number {
    return Math.round(performance.now() - this.t0);
  }
}

export function createWhatsAppPipelineTimer(
  messageId: string,
  channel: string,
  waId: string
): WhatsAppPipelineTimer {
  return new WhatsAppPipelineTimer({
    messageId,
    channel,
    waIdPrefix: waIdPrefixForLog(waId)
  });
}
