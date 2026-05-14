/**
 * Jest setup для FTP-сервиса
 */

import { jest } from '@jest/globals';

// Увеличенный таймаут для операций с файлами и сетью
jest.setTimeout(15000);

// Мокаем переменные окружения для тестов
process.env.NODE_ENV = 'test';
process.env.TEST_MONGODB_URI = 'mongodb://localhost:27017/lgdx_ftp_test';
process.env.RABBITMQ_URL = 'amqp://localhost:5672';
process.env.FTP_PORT = '2121'; // Тестовый порт
process.env.FTP_HOST = '127.0.0.1';
process.env.FTP_DATA_PATH = './test-ftp-data';
process.env.FTP_MAX_FILE_SIZE_MB = '50';
process.env.FTP_ALLOWED_FILE_TYPES = 'xlsx,xls,csv';
process.env.LOG_LEVEL = 'error'; // Минимальное логирование в тестах

// Мокаем внешние сервисы
jest.mock('../shared/telegramBot', () => ({
  sendFtpConnectionNotification: jest.fn(),
  sendFtpFileUploadNotification: jest.fn(),
  sendSecurityAlert: jest.fn()
}));

jest.mock('../shared/rabbitmq', () => ({
  connectToRabbitMQ: jest.fn(),
  sendToQueue: jest.fn(),
  FILE_UPLOAD_QUEUE: 'test_file_upload_tasks'
}));

// Глобальная очистка после каждого теста
afterEach(() => {
  jest.clearAllMocks();
});
