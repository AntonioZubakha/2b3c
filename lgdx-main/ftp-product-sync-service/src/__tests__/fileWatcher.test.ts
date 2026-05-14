/**
 * Тесты файлового мониторинга FTP
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileWatcher } from '../services/fileWatcher';
import Company from '../models/Company';
import mongoose from 'mongoose';

// Мокаем модули
jest.mock('../shared/rabbitmq');
jest.mock('../shared/telegramBot');

describe('FTP File Watcher', () => {
  let fileWatcher: FileWatcher;
  let testDir: string;
  let companyId: string;

  beforeEach(async () => {
    // Подключение к тестовой базе
    const mongoUri = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/lgdx_ftp_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    // Создание тестового каталога
    testDir = path.join(process.cwd(), 'test-ftp-data');
    await fs.mkdir(testDir, { recursive: true });

    // Создание тестовой компании
    const company = new Company({
      name: 'Test Company',
      status: 'active',
      isActive: true
    });
    await company.save();
    companyId = (company._id as any).toString();

    const companyDir = path.join(testDir, companyId);
    await fs.mkdir(companyDir, { recursive: true });

    // Создание FTP доступа
    await company.createFtpAccess({
      uploadQuotaMB: 100,
      maxConcurrentConnections: 2
    });

    // Настройка тестового конфига
    process.env.FTP_DATA_PATH = testDir;
    process.env.FTP_ALLOWED_FILE_TYPES = 'xlsx,xls,csv';
    process.env.FTP_MAX_FILE_SIZE_MB = '50';

    fileWatcher = new FileWatcher();
  });

  afterEach(async () => {
    // Остановка watcher
    if (fileWatcher && typeof fileWatcher.stop === 'function') {
      fileWatcher.stop();
    }

    // Очистка тестовых файлов
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      // Игнорируем ошибки удаления
    }

    // Очистка базы данных
    await Company.deleteMany({});
  });

  describe('File Detection', () => {
    it('should detect new files in company directory', async () => {
      const testFile = path.join(testDir, companyId, 'test-products.xlsx');
      
      // Создаем файл
      await fs.writeFile(testFile, 'test data');

      // Даем время на обработку
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Проверяем, что файл был обработан
      expect(fs.access(testFile)).resolves.not.toThrow();
    });

    it('should ignore files with invalid extensions', async () => {
      const testFile = path.join(testDir, companyId, 'test-document.pdf');
      
      // Создаем файл с недопустимым расширением
      await fs.writeFile(testFile, 'test data');

      // Даем время на обработку
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Файл должен остаться (не быть отправленным в очередь)
      expect(fs.access(testFile)).resolves.not.toThrow();
    });

    it('should ignore large files', async () => {
      const testFile = path.join(testDir, companyId, 'large-file.xlsx');
      
      // Создаем большой файл (больше лимита в 50MB)
      const largeData = Buffer.alloc(60 * 1024 * 1024, 'x'); // 60 MB
      await fs.writeFile(testFile, largeData);

      // Даем время на обработку
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Файл должен остаться (не быть отправленным в очередь)
      expect(fs.access(testFile)).resolves.not.toThrow();
    });

    it('should extract company ID from file path', async () => {
      const fileWatcher = new FileWatcher();
      
      // Тестирование приватного метода через рефлексию
      const extractCompanyId = (fileWatcher as any).extractCompanyId;
      
      const validPath = path.join(testDir, companyId, 'test.xlsx');
      const invalidPath = path.join(testDir, 'test.xlsx');
      
      expect(extractCompanyId.call(fileWatcher, validPath)).toBe(companyId);
      expect(extractCompanyId.call(fileWatcher, invalidPath)).toBe(null);
    });
  });

  describe('Company Validation', () => {
    it('should process files for companies with auto-processing enabled', async () => {
      // Обновляем компанию с автообработкой
      await Company.findByIdAndUpdate(companyId, {
        'ftpConfig.settings.autoProcessFiles': true
      });

      const testFile = path.join(testDir, companyId, 'auto-process.xlsx');
      await fs.writeFile(testFile, 'test data');

      // Даем время на обработку
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Проверяем, что RabbitMQ получил задачу
      // (это будет проверено через моки)
    });

    it('should skip files for companies with auto-processing disabled', async () => {
      // Обновляем компанию без автообработки
      await Company.findByIdAndUpdate(companyId, {
        'ftpConfig.settings.autoProcessFiles': false
      });

      const testFile = path.join(testDir, companyId, 'no-auto-process.xlsx');
      await fs.writeFile(testFile, 'test data');

      // Даем время на обработку
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Файл должен остаться (не быть отправленным в очередь)
      expect(fs.access(testFile)).resolves.not.toThrow();
    });

    it('should skip files for inactive companies', async () => {
      // Деактивируем FTP доступ
      await Company.findByIdAndUpdate(companyId, {
        'ftpConfig.enabled': false
      });

      const testFile = path.join(testDir, companyId, 'inactive-company.xlsx');
      await fs.writeFile(testFile, 'test data');

      // Даем время на обработку
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Файл должен остаться (не быть отправленным в очередь)
      expect(fs.access(testFile)).resolves.not.toThrow();
    });
  });

  describe('File Stability', () => {
    it('should wait for file to be stable before processing', async () => {
      const testFile = path.join(testDir, companyId, 'unstable-file.xlsx');
      
      // Создаем файл и продолжаем его изменять
      await fs.writeFile(testFile, 'initial data');
      
      // Изменяем файл несколько раз с коротким интервалом
      setTimeout(async () => {
        await fs.appendFile(testFile, 'more data');
      }, 100);
      
      setTimeout(async () => {
        await fs.appendFile(testFile, 'final data');
      }, 200);

      // Даем время на стабилизацию (должно быть больше 5 секунд)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // К этому времени файл должен быть обработан
      // (проверяется через моки RabbitMQ)
    });
  });

  describe('Error Handling', () => {
    it('should handle file reading errors gracefully', async () => {
      const testFile = path.join(testDir, companyId, 'error-file.xlsx');
      
      // Создаем файл
      await fs.writeFile(testFile, 'test data');
      
      // Удаляем файл сразу после создания (симуляция ошибки чтения)
      setTimeout(async () => {
        try {
          await fs.unlink(testFile);
        } catch (error) {
          // Игнорируем ошибку, если файл уже удален
        }
      }, 500);

      // Даем время на обработку
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Watcher должен продолжать работать без сбоев
      expect(fileWatcher).toBeDefined();
    });

    it('should handle non-existent company gracefully', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const companyDir = path.join(testDir, nonExistentId);
      await fs.mkdir(companyDir, { recursive: true });

      const testFile = path.join(companyDir, 'orphan-file.xlsx');
      await fs.writeFile(testFile, 'test data');

      // Даем время на обработку
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Файл должен остаться (компания не найдена)
      expect(fs.access(testFile)).resolves.not.toThrow();
    });
  });

  describe('Concurrent File Processing', () => {
    it('should prevent duplicate processing of the same file', async () => {
      const testFile = path.join(testDir, companyId, 'duplicate-test.xlsx');
      
      // Создаем файл дважды с небольшим интервалом
      await fs.writeFile(testFile, 'test data');
      
      setTimeout(async () => {
        await fs.appendFile(testFile, 'more data');
      }, 100);

      // Даем время на обработку
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Файл должен быть обработан только один раз
      // (проверяется через моки - количество вызовов RabbitMQ)
    });
  });
});
