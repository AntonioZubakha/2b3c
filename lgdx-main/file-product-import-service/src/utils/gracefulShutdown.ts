/**
 * Graceful Shutdown Utility
 * 
 * Обеспечивает корректное завершение работы сервиса при получении сигналов SIGTERM/SIGINT
 * Предотвращает потерю данных и незавершенные транзакции при обновлении Docker контейнеров
 */

import { logger } from '../shared/logger';

type CleanupFunction = () => Promise<void> | void;

class GracefulShutdownManager {
  private cleanupFunctions: CleanupFunction[] = [];
  private isShuttingDown = false;
  private shutdownTimeout: number;

  constructor(shutdownTimeoutMs: number = 30000) {
    this.shutdownTimeout = shutdownTimeoutMs;
  }

  /**
   * Регистрирует функцию для выполнения при завершении работы
   */
  register(cleanupFn: CleanupFunction, description?: string): void {
    this.cleanupFunctions.push(async () => {
      const desc = description || 'Cleanup function';
      logger.info('[Shutdown] Executing cleanup', { description: desc });
      try {
        await cleanupFn();
        logger.info('[Shutdown] Completed cleanup', { description: desc });
      } catch (error) {
        logger.error('[Shutdown] Error in cleanup', { description: desc, error });
      }
    });
  }

  /**
   * Инициализирует обработчики сигналов
   */
  init(): void {
    const signals = ['SIGTERM', 'SIGINT'] as const;
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        if (this.isShuttingDown) {
          logger.warn('[Shutdown] Already shutting down, ignoring signal', { signal });
          return;
        }

        logger.info('[Shutdown] Received signal, starting graceful shutdown', { signal });
        this.isShuttingDown = true;

        const shutdownTimer = setTimeout(() => {
          logger.error('[Shutdown] Timeout reached, forcing exit', { timeout: this.shutdownTimeout });
          process.exit(1);
        }, this.shutdownTimeout);

        try {
          // Выполняем все cleanup функции
          await Promise.all(this.cleanupFunctions.map(fn => fn()));
          
          logger.info('[Shutdown] All cleanup completed successfully');
          clearTimeout(shutdownTimer);
          process.exit(0);
        } catch (error) {
          logger.error('[Shutdown] Error during cleanup', { error });
          clearTimeout(shutdownTimer);
          process.exit(1);
        }
      });
    });

    logger.info('[Shutdown] Graceful shutdown handlers registered');
  }
}

// Singleton instance
export const shutdownManager = new GracefulShutdownManager();

/**
 * Helper function для быстрой регистрации cleanup
 */
export function registerCleanup(cleanupFn: CleanupFunction, description?: string): void {
  shutdownManager.register(cleanupFn, description);
}

/**
 * Helper function для инициализации graceful shutdown
 */
export function initGracefulShutdown(): void {
  shutdownManager.init();
}

