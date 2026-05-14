import { FtpSrv, FileSystem } from 'ftp-srv';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs-extra';
import * as path from 'path';
import { logger } from '../shared/logger';
import { config } from '../shared/config';
import Company from '../models/Company';
import { FtpMetrics } from './metrics';

/** Why STOR path was rejected (for logs / metrics). */
export type FtpUploadPathRejectReason =
  | 'not_plain_filename'
  | 'illegal_basename_chars'
  | 'empty'
  | 'subdir_not_allowed';

/** Single allowed STOR prefix (matches mkdir on login). No arbitrary nesting. */
const ALLOWED_STOR_SUBDIRS = new Set(['files']);

export type FtpUploadPathParseResult =
  | { ok: true; safeName: string; /** Relative dir under company root; '' = company root */ storSubdir: string }
  | {
      ok: false;
      reason: FtpUploadPathRejectReason;
      /** Value passed by client to STOR (trimmed for logs if very long). */
      rawArgument: string;
      /** Result of path.basename(last segment) for diagnostics. */
      posixBasename: string;
    };

function isSafeFileSegment(seg: string): boolean {
  if (!seg) return false;
  if (seg.includes('/') || seg.includes('\\')) return false;
  if (seg.includes('..')) return false;
  return true;
}

/**
 * FTP STOR: plain filename, or exactly `files/<filename>` (and `files\\<filename>` on Windows clients).
 * Deeper paths and traversal stay rejected.
 */
export function parseFtpUploadFileName(fileName: string): FtpUploadPathParseResult {
  const raw = typeof fileName === 'string' ? fileName : String(fileName);
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty', rawArgument: raw, posixBasename: '' };
  }

  let normalized = trimmed.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    return {
      ok: false,
      reason: 'not_plain_filename',
      rawArgument: trimmed,
      posixBasename: path.posix.basename(normalized),
    };
  }
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  if (normalized.includes('..')) {
    return {
      ok: false,
      reason: 'illegal_basename_chars',
      rawArgument: trimmed,
      posixBasename: path.posix.basename(normalized),
    };
  }

  const segments = normalized.split('/').filter((s) => s.length > 0);
  if (segments.some((s) => s === '.' || s === '..')) {
    return {
      ok: false,
      reason: 'illegal_basename_chars',
      rawArgument: trimmed,
      posixBasename: path.posix.basename(normalized),
    };
  }

  if (segments.length === 1) {
    const base = segments[0];
    if (!isSafeFileSegment(base)) {
      return { ok: false, reason: 'illegal_basename_chars', rawArgument: trimmed, posixBasename: base };
    }
    return { ok: true, safeName: base, storSubdir: '' };
  }

  if (segments.length === 2) {
    const [dir, file] = segments;
    if (!ALLOWED_STOR_SUBDIRS.has(dir)) {
      return {
        ok: false,
        reason: 'subdir_not_allowed',
        rawArgument: trimmed,
        posixBasename: file,
      };
    }
    if (!isSafeFileSegment(file)) {
      return { ok: false, reason: 'illegal_basename_chars', rawArgument: trimmed, posixBasename: file };
    }
    return { ok: true, safeName: file, storSubdir: dir };
  }

  return {
    ok: false,
    reason: 'not_plain_filename',
    rawArgument: trimmed,
    posixBasename: path.posix.basename(normalized),
  };
}

function truncateForLog(s: string, max = 240): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(len=${s.length})`;
}

export class FtpServer {
  private server: FtpSrv | null = null;
  private metrics: FtpMetrics;
  private isRunning = false;

  constructor() {
    this.metrics = new FtpMetrics();
    this.initializeServer();
  }

  private initializeServer(): void {
    logger.info('[FtpServer] Initializing FTP server...');

    this.server = new FtpSrv({
      url: `ftp://${config.ftpHost}:${config.ftpPort}`,
      pasv_url: config.ftpPasvUrl || config.ftpHost,
      pasv_min: config.ftpPasvPortMin,
      pasv_max: config.ftpPasvPortMax,
      greeting: ['Welcome to LGDX FTP Server', 'Please login with your credentials'],
      tls: false, // Пока без TLS
      timeout: config.ftpConnectionTimeout
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.server) return;

    // Обработка аутентификации
    this.server.on('login', this.handleLogin.bind(this));

    // Обработка отключения
    this.server.on('disconnect', (data: { connection: { ip: string } }) => {
      const clientIp = data.connection.ip;
      logger.info(`[FtpServer] Client disconnected: ${clientIp}`);
    });

    // Обработка ошибок
    this.server.on('client-error', (data: { error: { message: string }; context: unknown }) => {
      logger.error(`[FtpServer] Client error: ${data.error.message}`, { context: data.context });
      this.metrics.recordError('client_error', { error: data.error.message });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleLogin(data: any, resolve: any, reject: any): Promise<void> {
    const { username, password, connection } = data;
    const clientIp = connection.ip;

    try {
      logger.info(`[FtpServer] Login attempt: ${username} from ${clientIp}`);

      // Поиск компании по FTP username
      // Ищем конкретную компанию ОДНОЙ ОПЕРАЦИЕЙ
      const company = await Company.findOne({
        'ftpConfig.enabled': true,
        'ftpConfig.isActive': true,
        'ftpConfig.username': username
      });
      
      if (company) {
        // Проверяем, что объект компании действительно существует
        if (!company._id) {
          logger.error(`[FtpServer] ❌ Company object is invalid - no _id field`);
          this.metrics.recordError('auth_failed', { username, ip: clientIp });
          return reject(new Error('Invalid company object'));
        }
        
        // Проверяем FTP конфигурацию
        if (!company.ftpConfig) {
          logger.error(`[FtpServer] ❌ Company has no FTP config`);
          this.metrics.recordError('auth_failed', { username, ip: clientIp });
          return reject(new Error('Company has no FTP configuration'));
        }
        
        if (!company.ftpConfig.passwordHash) {
          logger.error(`[FtpServer] ❌ Company has no password hash`);
          this.metrics.recordError('auth_failed', { username, ip: clientIp });
          return reject(new Error('Company has no password hash'));
        }
        
        logger.info(`[FtpServer] ✅ Company validation passed - proceeding with authentication`);
      } else {
        logger.warn(`[FtpServer] ❌ Company not found for username: ${username}`);
        this.metrics.recordError('auth_failed', { username, ip: clientIp });
        return reject(new Error('Company not found'));
      }

      // Проверка пароля
      const isValid = await bcrypt.compare(password, company.ftpConfig.passwordHash);
      if (!isValid) {
        logger.warn(`[FtpServer] Authentication failed: Invalid password for ${username}`);
        this.metrics.recordError('auth_failed', { username, ip: clientIp });
        return reject(new Error('Authentication failed'));
      }

      // Проверка IP адреса (если настроено)
      if (company.ftpConfig.allowedIPs && company.ftpConfig.allowedIPs.length > 0) {
        // Проверяем, разрешены ли все IP (символ "*")
        const allIPsAllowed = company.ftpConfig.allowedIPs.includes('*');
        
        if (!allIPsAllowed && !company.ftpConfig.allowedIPs.includes(clientIp)) {
          logger.warn(`[FtpServer] Authentication failed: IP ${clientIp} not allowed for ${username}`);
          logger.warn(`[FtpServer] Allowed IPs: ${company.ftpConfig.allowedIPs.join(', ')}`);
          this.metrics.recordError('ip_not_allowed', { username, ip: clientIp });
          return reject(new Error('IP address not allowed'));
        }
        
        if (allIPsAllowed) {
          logger.info(`[FtpServer] All IPs allowed for ${username}`);
        } else {
          logger.info(`[FtpServer] IP ${clientIp} allowed for ${username}`);
        }
      }

      // Обновление статистики компании
      await this.updateCompanyStats(company);

      // Создание домашней директории компании
      const companyId = (company._id as any).toString();
      // Создаем папку компании в config.ftpDataPath (который теперь изолирован)
      const homeDir = companyId;
      const companyRoot = path.join(config.ftpDataPath, homeDir);
      await fs.ensureDir(companyRoot);
      // Keep backward-compatible convention: most clients upload into /files
      await fs.ensureDir(path.join(companyRoot, 'files'));
      
      logger.info(`[FtpServer] Home directory created/ensured: ${config.ftpDataPath}/${homeDir}`);
      logger.info(`[FtpServer] Company ID: ${companyId}, Company Name: ${company.name}`);

      // Обработка отключения
      connection.on('end', () => {
        logger.info(`[FtpServer] Client disconnected: ${username} from ${clientIp}`);
        this.metrics.recordDisconnection(companyId);
      });

      // Создание файловой системы для пользователя (chroot в домашнюю директорию)
      // IMPORTANT: ftp-srv does NOT inject `root` from resolve() into a custom fs instance.
      // We must pass the companyRoot to the FileSystem constructor, otherwise it defaults to process.cwd() (/app)
      // and users can browse shared folders like /ftp-data.
      const fileSystem = new CompanyFileSystem(connection, company, this.metrics, homeDir, companyRoot);

      resolve({
        fs: fileSystem,
        root: companyRoot,    // Корень = полный путь к папке компании
        cwd: '/'          // Стартовая папка внутри корня
      });

    } catch (error) {
      logger.error(`[FtpServer] ❌ Login error for ${username}:`, error);
      this.metrics.recordError('login_error', { username, ip: clientIp, error });
      reject(error instanceof Error ? error : new Error('Authentication failed'));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async updateCompanyStats(company: any): Promise<void> {
    try {
      await company.incrementConnectionCount();
      logger.debug(`[FtpServer] Updated connection stats for company: ${company.name}`);
    } catch (error) {
      logger.error('[FtpServer] Failed to update company stats:', error);
    }
  }

  async start(): Promise<void> {
    try {
      if (!this.server) {
        throw new Error('Server not initialized');
      }

      logger.info(`[FtpServer] Starting FTP server on ${config.ftpHost}:${config.ftpPort}...`);
      
      await this.server.listen();
      this.isRunning = true;

      logger.info(`[FtpServer] ✅ FTP server listening on ${config.ftpHost}:${config.ftpPort}`);
      logger.info(`[FtpServer] Passive mode: ${config.ftpPasvUrl}:${config.ftpPasvPortMin}-${config.ftpPasvPortMax}`);
      logger.info(`[FtpServer] Root directory: /app (isolated)`);

    } catch (error) {
      logger.error('[FtpServer] ❌ Failed to start FTP server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.server && this.isRunning) {
      logger.info('[FtpServer] Stopping FTP server...');
      await this.server.close();
      this.isRunning = false;
      logger.info('[FtpServer] ✅ FTP server stopped');
    }
  }

  getMetrics(): FtpMetrics {
    return this.metrics;
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }
}

// Кастомная файловая система для компаний
class CompanyFileSystem extends FileSystem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private company: any;
  private metrics: FtpMetrics;
  private homeDir: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(connection: any, company: any, metrics: FtpMetrics, homeDir: string, companyRoot: string) {
    super(connection, { root: companyRoot, cwd: '/' });
    this.company = company;
    this.metrics = metrics;
    this.homeDir = homeDir;
  }

  // Переопределяем методы для контроля доступа и логирования
  async write(fileName: string, options: Record<string, unknown> = {}): Promise<fs.WriteStream> {
    const parsed = parseFtpUploadFileName(fileName);
    if (!parsed.ok) {
      const companyId = this.company?._id?.toString?.() ?? 'unknown';
      const companyName = this.company?.name ?? 'unknown';
      // Pino: merge object first, message second — otherwise fields are dropped in production JSON logs.
      logger.warn(
        {
          reason: parsed.reason,
          companyId,
          companyName,
          rawArgument: truncateForLog(parsed.rawArgument),
          posixBasename: parsed.posixBasename || undefined,
          hint:
            parsed.reason === 'not_plain_filename'
              ? 'Too many path segments. Use only file.csv or files/file.csv.'
              : parsed.reason === 'illegal_basename_chars'
                ? 'Basename contains .., / or \\\\. Windows: use files\\file.csv or file.csv only.'
                : parsed.reason === 'subdir_not_allowed'
                  ? 'Only the files/ subfolder is allowed (e.g. files/report.csv), not other folder names.'
                  : 'Empty filename after trim.',
        },
        '[FtpServer] STOR rejected: invalid upload path (sanitizer)'
      );
      this.metrics.recordInvalidUploadPath(parsed.reason);
      this.metrics.recordError('invalid_upload_path', {
        reason: parsed.reason,
        companyId,
        companyName,
      });
      throw new Error('Invalid file path');
    }
    const safeName = parsed.safeName;
    const storSubdir = parsed.storSubdir;
    const fileExtension = path.extname(safeName).toLowerCase().substring(1);
    
    // Проверка типа файла
    if (!config.ftpAllowedFileTypes.includes(fileExtension)) {
      throw new Error(`File type not allowed: ${fileExtension}`);
    }

    const storDisplay = storSubdir ? `${storSubdir}/${safeName}` : safeName;
    logger.info(`[FtpServer] File upload started: ${storDisplay} (Company: ${this.company.name})`);
    logger.info(`[FtpServer] Target directory: ${config.ftpDataPath}/${this.homeDir}${storSubdir ? `/${storSubdir}` : ''}`);
    
    try {
      // NEW FTP (FileWatcher / rescan): {FTP_DATA_PATH}/{companyId}/[files/]{basename}
      const fullPath = path.join(config.ftpDataPath, this.homeDir, storSubdir, safeName);
      logger.info(`[FtpServer] Writing file: ${storDisplay} to ${fullPath}`);
      
      // Создаем папку компании, если её нет
      await fs.ensureDir(path.dirname(fullPath));
      
      // Создаем writeStream для файла в правильной папке
      const writeStream = fs.createWriteStream(fullPath, options);
      
      // Безопасная проверка наличия метода 'on'
      if (writeStream && typeof writeStream.on === 'function') {
        // Логируем завершение загрузки
        writeStream.on('finish', () => {
          logger.info(`[FtpServer] ✅ File upload completed: ${safeName}`);
          this.metrics.recordFileUpload(
            this.company._id.toString(),
            safeName,
            writeStream.bytesWritten || 0
          );
        });

        writeStream.on('error', (error: Error) => {
          logger.error(`[FtpServer] ❌ File upload error: ${safeName}`, error);
          this.metrics.recordError('file_upload_error', { 
            fileName: safeName, 
            company: this.company.name, 
            error: error.message 
          });
        });
      }

      return writeStream;
    } catch (error) {
      logger.error(`[FtpServer] ❌ Failed to create write stream for ${safeName}:`, error);
      throw error;
    }
  }
}