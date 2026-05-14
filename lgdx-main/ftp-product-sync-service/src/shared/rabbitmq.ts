/**
 * RabbitMQ подключение и управление очередями для FTP сервиса
 */

import * as amqp from 'amqplib';
import { logger } from './logger';
import { config } from './config';

export const FILE_UPLOAD_QUEUE = 'file_upload_tasks';

const redactAmqpUrl = (url: string): string => {
  try {
    // amqp://user:pass@host -> amqp://***:***@host
    return url.replace(/^(amqps?:\/\/)([^@]+)@/i, (_m, p1) => `${p1}***:***@`);
  } catch {
    return '[redacted]';
  }
};

class RabbitMQManager {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private isConnected = false;

  async connect(retries = 5): Promise<void> {
    if (this.isConnected) {
      logger.info('[RabbitMQ] Already connected');
      return;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info('[RabbitMQ] Connecting...', { url: redactAmqpUrl(config.rabbitmqUrl), attempt, retries });
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.connection = await amqp.connect(config.rabbitmqUrl, {
          heartbeat: 60,
        }) as any;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.channel = await (this.connection as any).createChannel();
        break; // Успешное подключение - выходим из цикла
        
      } catch (error) {
        logger.error(`[RabbitMQ] ❌ Connection attempt ${attempt}/${retries} failed:`, error);
        
        if (attempt === retries) {
          // Последняя попытка - прокидываем ошибку
          throw error;
        }
        
        // Ждем перед следующей попыткой (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // max 10s
        logger.info(`[RabbitMQ] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }

    try {
      
      // Настройка канала
      await this.channel!.prefetch(1);
      
      // Создание очереди с теми же параметрами, что в file-product-import-service
      await this.channel!.assertQueue(FILE_UPLOAD_QUEUE, { 
        durable: true,
        arguments: {
          'x-message-ttl': 7200000, // 2 hours TTL (files take longer)
          'x-max-retries': 3
        }
      });

      this.isConnected = true;
      logger.info('[RabbitMQ] ✅ Connected successfully');

      // Обработчики событий
      this.connection!.on('error', (error) => {
        logger.error('[RabbitMQ] ❌ Connection error:', error);
        this.isConnected = false;
      });

      this.connection!.on('close', () => {
        logger.warn('[RabbitMQ] ⚠️ Connection closed');
        this.isConnected = false;
        // Автоматическое переподключение через 5 секунд
        setTimeout(() => this.reconnect(), 5000);
      });

    } catch (error) {
      logger.error('[RabbitMQ] ❌ Failed to connect:', error);
      this.isConnected = false;
      throw error;
    }
  }

  private async reconnect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      logger.info('[RabbitMQ] Attempting to reconnect...');
      await this.connect();
    } catch (error) {
      logger.error('[RabbitMQ] ❌ Reconnection failed:', error);
      // Повторная попытка через 10 секунд
      setTimeout(() => this.reconnect(), 10000);
    }
  }

  async sendToQueue(queueName: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.channel || !this.isConnected) {
      throw new Error('RabbitMQ is not connected');
    }

    try {
      const message = JSON.stringify(payload);
      const success = this.channel.sendToQueue(
        queueName, 
        Buffer.from(message), 
        { persistent: true }
      );

      if (!success) {
        throw new Error('Failed to send message to queue');
      }

      logger.info(`[RabbitMQ] ✅ Message sent to queue: ${queueName}`);
    } catch (error) {
      logger.error(`[RabbitMQ] ❌ Failed to send message to queue ${queueName}:`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (this.connection as any).close();
        this.connection = null;
      }
      
      this.isConnected = false;
      logger.info('[RabbitMQ] ✅ Connection closed');
    } catch (error) {
      logger.error('[RabbitMQ] ❌ Error closing connection:', error);
    }
  }

  isConnectionReady(): boolean {
    return this.isConnected && this.connection !== null && this.channel !== null;
  }

  getChannel(): amqp.Channel | null {
    return this.channel;
  }
}

// Синглтон экземпляр
const rabbitManager = new RabbitMQManager();

// Экспортируемые функции
export async function connectToRabbitMQ(): Promise<void> {
  await rabbitManager.connect();
}

export async function sendToQueue(queueName: string, payload: Record<string, unknown>): Promise<void> {
  await rabbitManager.sendToQueue(queueName, payload);
}

export async function closeRabbitMQ(): Promise<void> {
  await rabbitManager.close();
}

export function isRabbitMQReady(): boolean {
  return rabbitManager.isConnectionReady();
}

export function getRabbitMQChannel(): amqp.Channel | null {
  return rabbitManager.getChannel();
}