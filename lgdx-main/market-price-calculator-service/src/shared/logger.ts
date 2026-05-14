type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [market-price-calculator] [${level.toUpperCase()}] ${message}`;
  switch (level) {
    case 'debug':
      // eslint-disable-next-line no-console
      console.debug(line, meta ?? '');
      break;
    case 'info':
      // eslint-disable-next-line no-console
      console.log(line, meta ?? '');
      break;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(line, meta ?? '');
      break;
    case 'error':
      // eslint-disable-next-line no-console
      console.error(line, meta ?? '');
      break;
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
};


