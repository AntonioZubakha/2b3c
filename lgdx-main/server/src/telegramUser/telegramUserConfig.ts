import fs from 'fs';

function readEnvFile(path: string | undefined): string {
  if (!path) return '';
  try {
    return fs.readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

/** MTProto user session (GramJS) — same marketing bot prompt as WhatsApp; optional second process. */
export function isTelegramUserClientEnabled(): boolean {
  return process.env.TELEGRAM_USER_CLIENT_ENABLED === 'true';
}

export function getTelegramApiId(): number {
  const raw =
    process.env.TELEGRAM_API_ID ||
    process.env.TELEGRAM_USER_API_ID ||
    readEnvFile(process.env.TELEGRAM_API_ID_FILE);
  const n = raw ? parseInt(String(raw).trim(), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function getTelegramApiHash(): string {
  return (
    process.env.TELEGRAM_API_HASH ||
    process.env.TELEGRAM_USER_API_HASH ||
    readEnvFile(process.env.TELEGRAM_API_HASH_FILE) ||
    ''
  ).trim();
}

export function getTelegramUserSessionFilePath(): string {
  return (
    process.env.TELEGRAM_USER_SESSION_FILE ||
    (process.env.TELEGRAM_USER_AUTH_DIR
      ? `${process.env.TELEGRAM_USER_AUTH_DIR.replace(/\/$/, '')}/session.string`
      : '/data/telegram_user/session.string')
  );
}
