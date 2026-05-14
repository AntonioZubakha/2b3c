/**
 * Тесты аутентификации FTP
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Company from '../models/Company';

describe('FTP Authentication', () => {
  beforeEach(async () => {
    // Подключение к тестовой базе данных
    const mongoUri = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/lgdx_ftp_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
    
    // Очистка тестовых данных
    await Company.deleteMany({});
  });

  afterEach(async () => {
    // Очистка после тестов
    await Company.deleteMany({});
  });

  describe('Company FTP Configuration', () => {
    it('should create FTP access for company', async () => {
      // Создание тестовой компании
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true
      });
      await company.save();

      // Создание FTP доступа
      const password = await company.createFtpAccess({
        uploadQuotaMB: 1000,
        maxConcurrentConnections: 3,
        allowedIPs: ['192.168.1.*']
      });

      // Проверки
      expect(password).toBeDefined();
      expect(typeof password).toBe('string');
      expect(password.length).toBe(16);

      const updatedCompany = await Company.findById(company._id);
      expect(updatedCompany?.ftpConfig?.enabled).toBe(true);
      expect(updatedCompany?.ftpConfig?.username).toBeDefined();
      expect(updatedCompany?.ftpConfig?.uploadQuotaMB).toBe(1000);
      expect(updatedCompany?.ftpConfig?.maxConcurrentConnections).toBe(3);
      expect(updatedCompany?.ftpConfig?.allowedIPs).toEqual(['192.168.1.*']);
    });

    it('should validate FTP credentials', async () => {
      // Создание компании с FTP доступом
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true
      });
      await company.save();

      const password = await company.createFtpAccess({});
      const updatedCompany = await Company.findById(company._id).select('+ftpConfig.passwordHash');

      // Проверка корректного пароля
      const isValidPassword = await bcrypt.compare(password, updatedCompany!.ftpConfig!.passwordHash!);
      expect(isValidPassword).toBe(true);

      // Проверка неверного пароля
      const isInvalidPassword = await bcrypt.compare('wrong-password', updatedCompany!.ftpConfig!.passwordHash!);
      expect(isInvalidPassword).toBe(false);
    });

    it('should reset FTP password', async () => {
      // Создание компании с FTP доступом
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true
      });
      await company.save();

      const originalPassword = await company.createFtpAccess({});
      const originalHash = (await Company.findById(company._id).select('+ftpConfig.passwordHash'))!.ftpConfig!.passwordHash;

      // Сброс пароля
      const newPassword = await company.updateFtpPassword();
      const newHash = (await Company.findById(company._id).select('+ftpConfig.passwordHash'))!.ftpConfig!.passwordHash;

      // Проверки
      expect(newPassword).toBeDefined();
      expect(newPassword).not.toBe(originalPassword);
      expect(newHash).not.toBe(originalHash);

      // Старый пароль не должен работать
      const oldPasswordValid = await bcrypt.compare(originalPassword, newHash!);
      expect(oldPasswordValid).toBe(false);

      // Новый пароль должен работать
      const newPasswordValid = await bcrypt.compare(newPassword, newHash!);
      expect(newPasswordValid).toBe(true);
    });

    it('should check upload quota', async () => {
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true
      });
      await company.save();

      await company.createFtpAccess({ uploadQuotaMB: 100 }); // 100 MB quota

      // Файл в пределах квоты
      const smallFileSize = 50 * 1024 * 1024; // 50 MB
      expect(company.checkUploadQuota(smallFileSize)).toBe(true);

      // Файл превышающий квоту
      const largeFileSize = 150 * 1024 * 1024; // 150 MB
      expect(company.checkUploadQuota(largeFileSize)).toBe(false);

      // Добавление использованного места
      await company.recordFileUpload(60 * 1024 * 1024); // 60 MB используется

      // Теперь 50 MB файл не поместится (60 + 50 > 100)
      expect(company.checkUploadQuota(smallFileSize)).toBe(false);

      // Но 30 MB файл поместится (60 + 30 < 100)
      const mediumFileSize = 30 * 1024 * 1024; // 30 MB
      expect(company.checkUploadQuota(mediumFileSize)).toBe(true);
    });

    it('should disable FTP access', async () => {
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true
      });
      await company.save();

      await company.createFtpAccess({});
      expect(company.ftpConfig?.enabled).toBe(true);
      expect(company.ftpConfig?.isActive).toBe(true);

      // Деактивация FTP доступа
      await company.disableFtpAccess();

      const updatedCompany = await Company.findById(company._id);
      expect(updatedCompany?.ftpConfig?.enabled).toBe(false);
      expect(updatedCompany?.ftpConfig?.isActive).toBe(false);
    });

    it('should increment connection count', async () => {
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true
      });
      await company.save();

      await company.createFtpAccess({});
      expect(company.ftpConfig?.connectionCount).toBe(0);

      // Увеличение счетчика подключений
      await company.incrementConnectionCount();
      await company.incrementConnectionCount();

      const updatedCompany = await Company.findById(company._id);
      expect(updatedCompany?.ftpConfig?.connectionCount).toBe(2);
      expect(updatedCompany?.ftpConfig?.lastConnectionAt).toBeDefined();
    });
  });

  describe('FTP Configuration Validation', () => {
    it('should validate allowed IPs format', async () => {
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true,
        ftpConfig: {
          enabled: true,
          allowedIPs: ['192.168.1.100', '10.0.0.*', '*'], // Valid IPs
          uploadQuotaMB: 500,
          maxConcurrentConnections: 2,
          connectionCount: 0,
          totalUploadsCount: 0,
          totalBytesUploaded: 0,
          isActive: true,
          settings: {
            autoProcessFiles: true,
            deleteAfterProcess: false,
            notifyOnUpload: true,
            allowedFileTypes: ['xlsx', 'xls', 'csv'],
            maxFileSizeMB: 50,
            processMode: 'replace'
          }
        }
      });

      await expect(company.save()).resolves.not.toThrow();
    });

    it('should validate file types', async () => {
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true,
        ftpConfig: {
          enabled: true,
          allowedIPs: [],
          uploadQuotaMB: 500,
          maxConcurrentConnections: 2,
          connectionCount: 0,
          totalUploadsCount: 0,
          totalBytesUploaded: 0,
          isActive: true,
          settings: {
            autoProcessFiles: true,
            deleteAfterProcess: false,
            notifyOnUpload: true,
            allowedFileTypes: ['xlsx', 'csv'], // Valid file types
            maxFileSizeMB: 50,
            processMode: 'replace'
          }
        }
      });

      await expect(company.save()).resolves.not.toThrow();
    });

    it('should enforce quota limits', async () => {
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true
      });
      await company.save();

      // Тест минимальной квоты
      await company.createFtpAccess({ uploadQuotaMB: 50 });
      expect(company.ftpConfig?.uploadQuotaMB).toBe(50);

      // Тест максимальной квоты (должна быть ограничена)
      await company.createFtpAccess({ uploadQuotaMB: 10000 });
      expect(company.ftpConfig?.uploadQuotaMB).toBeLessThanOrEqual(5000);
    });

    it('should enforce connection limits', async () => {
      const company = new Company({
        name: 'Test Company',
        status: 'active',
        isActive: true
      });
      await company.save();

      // Тест минимального количества подключений
      await company.createFtpAccess({ maxConcurrentConnections: 1 });
      expect(company.ftpConfig?.maxConcurrentConnections).toBe(1);

      // Тест максимального количества подключений
      await company.createFtpAccess({ maxConcurrentConnections: 15 });
      expect(company.ftpConfig?.maxConcurrentConnections).toBeLessThanOrEqual(10);
    });
  });
});
