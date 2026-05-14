/**
 * Экспорт коллекций users и companies в папку backup (JSON).
 * Используется перед миграцией из CSV.
 *
 * Запуск из папки server:
 *   MONGODB_URI=... npm run backup-users-companies
 * или:
 *   MIGRATION_CSV_DIR=e:\LGDX (или BACKUP_DIR) — папка для бекапа, по умолчанию backup в корне репозитория
 *
 * Переменные: MONGODB_URI / MONGODB_URI_FILE, BACKUP_DIR (по умолчанию ../backup относительно server)
 */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import User from '../models/User';
import Company from '../models/Company';
import { logger } from '../utils/logger';

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(process.cwd(), '..', 'backup');

async function getMongoUri(): Promise<string> {
  if (process.env.MONGODB_URI_FILE) {
    return fs.readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim();
  }
  return process.env.MONGODB_URI || 'mongodb://localhost:27017/lgdx';
}

async function main(): Promise<void> {
  const uri = await getMongoUri();
  await mongoose.connect(uri);
  logger.info('[Backup] Connected to MongoDB');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    logger.info('[Backup] Created directory:', BACKUP_DIR);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const usersFile = path.join(BACKUP_DIR, `users_${timestamp}.json`);
  const companiesFile = path.join(BACKUP_DIR, `companies_${timestamp}.json`);

  try {
    const users = await User.find({}).select('+legacyPasswordSalt').lean();
    const companies = await Company.find({}).lean();

    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
    fs.writeFileSync(companiesFile, JSON.stringify(companies, null, 2), 'utf8');

    logger.info('[Backup] Exported', { users: users.length, companies: companies.length });
    logger.info('[Backup] Files:', { usersFile, companiesFile });
  } finally {
    await mongoose.disconnect();
    logger.info('[Backup] Disconnected from MongoDB');
  }
}

main().catch((err) => {
  logger.error('[Backup] Fatal error:', err);
  process.exit(1);
});
