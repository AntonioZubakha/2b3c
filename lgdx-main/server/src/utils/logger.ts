type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const DEFAULT_REDACTION_PATTERNS: Array<[RegExp, string]> = [
  // Bearer/Authorization tokens
  [/authorization:\s*bearer\s+[a-z0-9\-._~+/]+=*/gi, 'authorization: Bearer [REDACTED]'],
  [/\b(jwt|token|access[_-]?token|refresh[_-]?token)\s*[:=]\s*([A-Za-z0-9\-._~+/]+=*)/gi, '$1: [REDACTED]'],
  // Emails
  [/([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$3'],
  // Phone numbers (basic)
  [/(\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3}[\s-]?\d{2,4}\b/g, '[REDACTED-PHONE]'],
  // Secrets-like keys in logs
  [/\b(secret|password|pass|apikey|api[_-]?key|auth|sid)\b\s*[:=]\s*[^\s,}]+/gi, '$1: [REDACTED]'],
];

function redact(input: any): any {
  try {
    if (input == null) return input;
    if (typeof input === 'string') {
      let out = input;
      for (const [re, repl] of DEFAULT_REDACTION_PATTERNS) {
        out = out.replace(re, repl);
      }
      return out;
    }
    if (typeof input === 'object') {
      const json = JSON.stringify(input);
      return JSON.parse(redact(json));
    }
    return input;
  } catch {
    return '[REDACTION_FAILED]';
  }
}

function log(level: LogLevel, message: string, meta?: unknown): void {
  const time = new Date().toISOString();
  const payload = meta;
  const line = `[${time}] [${level.toUpperCase()}] ${redact(message)}`;
  switch (level) {
    case 'debug':
      // eslint-disable-next-line no-console
      console.debug(line, payload !== undefined ? redact(payload) : '');
      break;
    case 'info':
      // eslint-disable-next-line no-console
      console.log(line, payload !== undefined ? redact(payload) : '');
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(line, payload !== undefined ? redact(payload) : '');
      break;
    case 'error':
      // eslint-disable-next-line no-console
      console.error(line, payload !== undefined ? redact(payload) : '');
      break;
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
  redact,
};


