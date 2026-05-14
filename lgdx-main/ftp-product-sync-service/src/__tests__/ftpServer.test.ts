import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFTPServer } from '../src/ftpServer';
import { createMockUser, createMockProduct } from './setup';

// Mock dependencies
jest.mock('ftp-srv');
jest.mock('fs-extra');
jest.mock('../src/services/fileWatcher');
jest.mock('../src/services/telegramBot');

describe('FTP Server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createFTPServer', () => {
    it('should create FTP server with correct configuration', () => {
      const config = {
        port: 21,
        host: '0.0.0.0',
        pasv_url: '127.0.0.1',
        pasv_min: 10000,
        pasv_max: 10100
      };

      const server = createFTPServer(config);

      expect(server).toBeDefined();
      expect(server.options).toHaveProperty('port', 21);
      expect(server.options).toHaveProperty('host', '0.0.0.0');
    });

    it('should handle authentication correctly', async () => {
      const mockConnection = {
        username: 'testuser',
        password: 'testpass',
        reject: jest.fn(),
        accept: jest.fn()
      };

      // Mock user validation
      const mockUser = createMockUser({
        username: 'testuser',
        password: 'hashedPassword'
      });

      const mockUserService = {
        validateUser: jest.fn().mockResolvedValue(mockUser)
      };

      require('../src/services/userService').default = mockUserService;

      const server = createFTPServer({});
      const authHandler = server.options.anonymous;

      await authHandler(mockConnection);

      expect(mockUserService.validateUser).toHaveBeenCalledWith('testuser', 'testpass');
      expect(mockConnection.accept).toHaveBeenCalled();
    });

    it('should reject invalid credentials', async () => {
      const mockConnection = {
        username: 'invaliduser',
        password: 'wrongpass',
        reject: jest.fn(),
        accept: jest.fn()
      };

      const mockUserService = {
        validateUser: jest.fn().mockResolvedValue(null)
      };

      require('../src/services/userService').default = mockUserService;

      const server = createFTPServer({});
      const authHandler = server.options.anonymous;

      await authHandler(mockConnection);

      expect(mockConnection.reject).toHaveBeenCalled();
      expect(mockConnection.accept).not.toHaveBeenCalled();
    });
  });

  describe('File Operations', () => {
    it('should handle file upload', async () => {
      const mockConnection = {
        user: { id: 'test-user-id' },
        cwd: () => '/',
        list: jest.fn(),
        read: jest.fn(),
        write: jest.fn()
      };

      const mockFile = {
        name: 'test-products.csv',
        size: 1024,
        type: 'file'
      };

      // Mock file validation
      const mockFileValidator = {
        validateFile: jest.fn().mockReturnValue({ valid: true })
      };

      require('../src/services/fileValidator').default = mockFileValidator;

      const server = createFTPServer({});
      const uploadHandler = server.options.upload;

      await uploadHandler(mockFile, mockConnection);

      expect(mockFileValidator.validateFile).toHaveBeenCalledWith(mockFile);
    });

    it('should reject invalid file types', async () => {
      const mockConnection = {
        user: { id: 'test-user-id' },
        cwd: () => '/',
        reject: jest.fn()
      };

      const mockFile = {
        name: 'test.txt',
        size: 1024,
        type: 'file'
      };

      // Mock file validation
      const mockFileValidator = {
        validateFile: jest.fn().mockReturnValue({ 
          valid: false, 
          error: 'Invalid file type' 
        })
      };

      require('../src/services/fileValidator').default = mockFileValidator;

      const server = createFTPServer({});
      const uploadHandler = server.options.upload;

      await uploadHandler(mockFile, mockConnection);

      expect(mockConnection.reject).toHaveBeenCalledWith('Invalid file type');
    });

    it('should handle file size limits', async () => {
      const mockConnection = {
        user: { id: 'test-user-id' },
        cwd: () => '/',
        reject: jest.fn()
      };

      const mockFile = {
        name: 'large-file.csv',
        size: 100 * 1024 * 1024, // 100MB
        type: 'file'
      };

      // Mock file validation
      const mockFileValidator = {
        validateFile: jest.fn().mockReturnValue({ 
          valid: false, 
          error: 'File too large' 
        })
      };

      require('../src/services/fileValidator').default = mockFileValidator;

      const server = createFTPServer({});
      const uploadHandler = server.options.upload;

      await uploadHandler(mockFile, mockConnection);

      expect(mockConnection.reject).toHaveBeenCalledWith('File too large');
    });
  });

  describe('Directory Operations', () => {
    it('should list directory contents', async () => {
      const mockConnection = {
        user: { id: 'test-user-id' },
        cwd: () => '/',
        list: jest.fn()
      };

      const mockFiles = [
        { name: 'file1.csv', size: 1024, type: 'file' },
        { name: 'file2.xlsx', size: 2048, type: 'file' }
      ];

      // Mock file system
      const mockFs = require('fs-extra');
      mockFs.readdir = jest.fn().mockResolvedValue(mockFiles);
      mockFs.stat = jest.fn().mockResolvedValue({ 
        isFile: () => true, 
        size: 1024 
      });

      const server = createFTPServer({});
      const listHandler = server.options.list;

      await listHandler(mockConnection);

      expect(mockFs.readdir).toHaveBeenCalled();
    });

    it('should handle directory creation', async () => {
      const mockConnection = {
        user: { id: 'test-user-id' },
        cwd: () => '/',
        mkdir: jest.fn()
      };

      const mockFs = require('fs-extra');
      mockFs.ensureDir = jest.fn().mockResolvedValue(undefined);

      const server = createFTPServer({});
      const mkdirHandler = server.options.mkdir;

      await mkdirHandler('new-directory', mockConnection);

      expect(mockFs.ensureDir).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      const config = {
        port: 21,
        host: '0.0.0.0'
      };

      const mockFTPServer = {
        listen: jest.fn().mockRejectedValue(new Error('Port already in use')),
        close: jest.fn()
      };

      require('ftp-srv').FtpSrv = jest.fn().mockReturnValue(mockFTPServer);

      await expect(createFTPServer(config)).rejects.toThrow('Port already in use');
    });

    it('should handle file system errors', async () => {
      const mockConnection = {
        user: { id: 'test-user-id' },
        cwd: () => '/',
        reject: jest.fn()
      };

      const mockFile = {
        name: 'test.csv',
        size: 1024,
        type: 'file'
      };

      const mockFs = require('fs-extra');
      mockFs.writeFile = jest.fn().mockRejectedValue(new Error('Disk full'));

      const server = createFTPServer({});
      const uploadHandler = server.options.upload;

      await uploadHandler(mockFile, mockConnection);

      expect(mockConnection.reject).toHaveBeenCalledWith('File system error');
    });
  });
});
