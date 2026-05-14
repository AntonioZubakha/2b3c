// ==========================================================================
// CONSOLE CLEANUP UTILITY
// Утилита для очистки console.log в продакшене
// ==========================================================================

import { config } from '../config/environment';

// Переопределяем console методы в продакшене
if (config.environment === 'production') {
  // Сохраняем оригинальные методы
  const originalConsole = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
  };

  // Отключаем console.log и console.debug в продакшене
  console.log = () => { /* Production console cleanup */ };
  console.debug = () => { /* Production console cleanup */ };
  console.info = () => { /* Production console cleanup */ };

  // Оставляем console.warn и console.error для критических ошибок
  console.warn = (...args: unknown[]) => {
    originalConsole.warn('[WARN]', ...args);
  };

  console.error = (...args: unknown[]) => {
    originalConsole.error('[ERROR]', ...args);
  };
}
