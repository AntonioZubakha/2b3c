type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const redactKeys = new Set([
  'authorization', 'auth', 'token', 'apikey', 'api_key', 'api-key', 'x-api-key',
  'password', 'secret', 'jwt', 'bearer'
]);

function redact(input: any): any {
  try {
    if (input === null || input === undefined) return input;
    if (typeof input === 'string') {
      return input.length > 200 ? input.slice(0, 200) + '…' : input;
    }
    if (Array.isArray(input)) {
      return input.map((v) => redact(v));
    }
    if (typeof input === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(input)) {
        if (redactKeys.has(k.toLowerCase())) {
          out[k] = '***redacted***';
        } else {
          out[k] = redact(v);
        }
      }
      return out;
    }
    return input;
  } catch {
    return '[unserializable]';
  }
}

function log(level: LogLevel, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [file-import-service] [${level.toUpperCase()}] ${message}`;
  switch (level) {
    case 'debug':
      // eslint-disable-next-line no-console
      console.debug(line, meta !== undefined ? redact(meta) : '');
      break;
    case 'info':
      // eslint-disable-next-line no-console
      console.log(line, meta !== undefined ? redact(meta) : '');
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(line, meta !== undefined ? redact(meta) : '');
      break;
    case 'error':
      // eslint-disable-next-line no-console
      console.error(line, meta !== undefined ? redact(meta) : '');
      break;
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
};


