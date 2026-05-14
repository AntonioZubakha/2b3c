/**
 * Модель FTP сессии для мониторинга и аналитики
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IFtpSession {
  companyId: mongoose.Types.ObjectId;
  sessionId: string;
  username: string;
  ip: string;
  userAgent?: string;
  startedAt: Date;
  endedAt?: Date;
  lastActivity: Date;
  status: 'active' | 'disconnected' | 'timeout' | 'error';
  
  // Статистика активности
  commandsExecuted: number;
  bytesTransferred: number;
  filesUploaded: number;
  filesDownloaded: number;
  failedCommands: number;
  
  // Детали сессии
  connectionDurationMs?: number;
  disconnectReason?: string;
  errorMessage?: string;
  
  // Безопасность
  loginAttempts: number;
  lastCommand?: string;
  suspiciousActivity: boolean;
}

export interface IFtpSessionDocument extends IFtpSession, Document {
  updateActivity(): Promise<void>;
  recordCommand(command: string, success: boolean): Promise<void>;
  recordTransfer(bytes: number, isUpload: boolean): Promise<void>;
  endSession(reason?: string, error?: string): Promise<void>;
  markSuspicious(reason: string): Promise<void>;
}

const FtpSessionSchema = new Schema({
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  ip: {
    type: String,
    required: true,
    trim: true,
    index: true,
    validate: {
      validator: function(ip: string) {
        // Валидация IPv4
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        // Валидация IPv6 (упрощенная)
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
      },
      message: 'Invalid IP address format'
    }
  },
  userAgent: {
    type: String,
    trim: true
  },
  startedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  endedAt: {
    type: Date,
    index: true
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'disconnected', 'timeout', 'error'],
    default: 'active',
    index: true
  },
  
  // Статистика
  commandsExecuted: {
    type: Number,
    default: 0,
    min: 0
  },
  bytesTransferred: {
    type: Number,
    default: 0,
    min: 0
  },
  filesUploaded: {
    type: Number,
    default: 0,
    min: 0
  },
  filesDownloaded: {
    type: Number,
    default: 0,
    min: 0
  },
  failedCommands: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Детали
  connectionDurationMs: {
    type: Number,
    min: 0
  },
  disconnectReason: {
    type: String,
    trim: true
  },
  errorMessage: {
    type: String,
    trim: true
  },
  
  // Безопасность
  loginAttempts: {
    type: Number,
    default: 1,
    min: 1
  },
  lastCommand: {
    type: String,
    trim: true
  },
  suspiciousActivity: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'ftp_sessions'
});

// Методы для обновления сессии
FtpSessionSchema.methods.updateActivity = async function(
  this: IFtpSessionDocument
): Promise<void> {
  this.lastActivity = new Date();
  await this.save();
};

FtpSessionSchema.methods.recordCommand = async function(
  this: IFtpSessionDocument,
  command: string,
  success: boolean
): Promise<void> {
  this.lastCommand = command;
  this.commandsExecuted += 1;
  if (!success) {
    this.failedCommands += 1;
  }
  this.lastActivity = new Date();
  await this.save();
};

FtpSessionSchema.methods.recordTransfer = async function(
  this: IFtpSessionDocument,
  bytes: number,
  isUpload: boolean
): Promise<void> {
  this.bytesTransferred += bytes;
  if (isUpload) {
    this.filesUploaded += 1;
  } else {
    this.filesDownloaded += 1;
  }
  this.lastActivity = new Date();
  await this.save();
};

FtpSessionSchema.methods.endSession = async function(
  this: IFtpSessionDocument,
  reason?: string,
  error?: string
): Promise<void> {
  const now = new Date();
  this.endedAt = now;
  this.connectionDurationMs = now.getTime() - this.startedAt.getTime();
  
  if (error) {
    this.status = 'error';
    this.errorMessage = error;
  } else if (reason === 'timeout') {
    this.status = 'timeout';
  } else {
    this.status = 'disconnected';
  }
  
  if (reason) {
    this.disconnectReason = reason;
  }
  
  await this.save();
};

FtpSessionSchema.methods.markSuspicious = async function(
  this: IFtpSessionDocument,
  reason: string
): Promise<void> {
  this.suspiciousActivity = true;
  this.disconnectReason = reason;
  await this.save();
};

// TTL индекс - автоматическое удаление старых сессий через 30 дней
FtpSessionSchema.index(
  { startedAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 дней
);

// Составные индексы для эффективных запросов
FtpSessionSchema.index({ companyId: 1, startedAt: -1 });
FtpSessionSchema.index({ status: 1, lastActivity: -1 });
FtpSessionSchema.index({ ip: 1, startedAt: -1 });
FtpSessionSchema.index({ suspiciousActivity: 1, startedAt: -1 });

const FtpSession = mongoose.model<IFtpSessionDocument>('FtpSession', FtpSessionSchema);

export default FtpSession;
