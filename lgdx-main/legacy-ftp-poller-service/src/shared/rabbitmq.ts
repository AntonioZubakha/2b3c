import * as amqplib from 'amqplib';
import { logger } from './logger';
import { config } from './config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connection: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let channel: any = null;

export async function connectRabbitMQ(): Promise<void> {
  connection = await amqplib.connect(config.rabbitmqUrl);
  connection.on('error', (err: Error) => {
    logger.warn({ err }, '[RabbitMQ] Connection socket error');
  });
  channel = await connection.createChannel();
  channel.on('error', (err: Error) => {
    logger.warn({ err }, '[RabbitMQ] Channel error');
  });
  // Use passive=true: only verify the queue exists, don't attempt to create or
  // modify it (the queue is owned by ftp-product-sync-service with its own TTL).
  await channel.checkQueue(config.fileUploadQueue);
  logger.info('[RabbitMQ] Connected');
}

export async function sendToQueue(queue: string, payload: object): Promise<void> {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  const content = Buffer.from(JSON.stringify(payload));
  channel.sendToQueue(queue, content, { persistent: true });
}

export async function closeRabbitMQ(): Promise<void> {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch {}
  channel = null;
  connection = null;
}
