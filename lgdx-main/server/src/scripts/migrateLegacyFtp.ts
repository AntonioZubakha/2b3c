/**
 * Миграция FTP-конфигурации из предыдущей версии продукта (исторически
 * размещалась на lgdeal.com на другом сервере/стеке) в текущий LGDX-проект.
 * С переездом текущего приложения на lgdeal.com этот скрипт касается только
 * унаследованных CSV-данных — сам хост указывается через OLD_FTP_HOST.
 *
 * Что делает скрипт:
 *   1. Читает companies.csv из старого проекта.
 *   2. Берёт только компании у которых params.ftp.enabled = true.
 *   3. Для каждой такой компании ищет точное совпадение по имени в новой MongoDB.
 *   4. Пропускает, если:
 *      - компания не найдена в новом проекте
 *      - у неё уже настроен новый FTP (ftpConfig.enabled = true)
 *      - у неё настроено API-получение продуктов (apiConfig задан)
 *   5. Для оставшихся компаний шифрует пароль и сохраняет legacyFtpConfig в MongoDB.
 *
 * FTP-логин на старом сервере: ftp_{id}, где id — числовой id компании из CSV.
 * FTP-хост: 65.21.109.96, порт 21, папка /files.
 *
 * Запуск из корня репозитория:
 *   LEGACY_FTP_CRYPTO_KEY=<32-байтный hex> \
 *   MIGRATION_CSV_DIR=e:/LGDX \
 *   npx ts-node -r tsconfig-paths/register server/src/scripts/migrateLegacyFtp.ts
 *
 * Переменные окружения:
 *   LEGACY_FTP_CRYPTO_KEY — 64-символьный hex (32 байта) для AES-256-GCM
 *   MIGRATION_CSV_DIR     — папка с companies.csv (по умолчанию process.cwd())
 *   MONGODB_URI / MONGODB_URI_FILE — подключение к MongoDB
 *   DRY_RUN=1             — только разбор и логирование, без записи в БД
 *   OLD_FTP_HOST          — хост старого FTP (по умолч. 65.21.109.96)
 *   OLD_FTP_PORT          — порт старого FTP (по умолч. 21)
 *   OLD_FTP_REMOTE_DIR    — папка на старом FTP (по умолч. /files)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import csvParser from 'csv-parser';

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const CSV_DIR = process.env.MIGRATION_CSV_DIR || process.cwd();
const OLD_FTP_HOST = process.env.OLD_FTP_HOST || '65.21.109.96';
const OLD_FTP_PORT = parseInt(process.env.OLD_FTP_PORT || '21');
const OLD_FTP_REMOTE_DIR = process.env.OLD_FTP_REMOTE_DIR || '/files';

// ─── Encryption ──────────────────────────────────────────────────────────────

function getCryptoKey(): Buffer {
  const hexKey = process.env.LEGACY_FTP_CRYPTO_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      'LEGACY_FTP_CRYPTO_KEY must be set as a 64-char hex string (32 bytes). ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hexKey, 'hex');
}

function encryptPassword(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv_hex:authTag_hex:cipher_hex
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// ─── MongoDB model (minimal — only fields we need) ────────────────────────────

const CompanySchema = new mongoose.Schema({
  name: String,
  status: String,
  apiConfig: mongoose.Schema.Types.ObjectId,
  ftpConfig: {
    enabled: { type: Boolean, default: false }
  },
  legacyFtpConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  }
}, { collection: 'companies', strict: false });

const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema);

// ─── CSV row type ─────────────────────────────────────────────────────────────

interface CsvRow {
  id: string;
  name: string;
  params: string;
  disabled: string;
  [key: string]: string;
}

interface OldFtpParams {
  enabled: boolean;
  password?: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  Legacy FTP Migration: imports FTP config from the pre-LGDX CSV export');
  console.log(`${'='.repeat(70)}`);
  console.log(`  DRY_RUN: ${DRY_RUN}`);
  console.log(`  CSV_DIR: ${CSV_DIR}`);
  console.log(`  Old FTP: ${OLD_FTP_HOST}:${OLD_FTP_PORT}${OLD_FTP_REMOTE_DIR}`);
  console.log('');

  const cryptoKey = getCryptoKey();

  // Connect to MongoDB
  const mongoUri = (() => {
    if (process.env.MONGODB_URI_FILE) {
      try { return fs.readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim(); } catch {}
    }
    return process.env.MONGODB_URI || 'mongodb://localhost:27018/lgdx';
  })();

  if (!DRY_RUN) {
    await mongoose.connect(mongoUri);
    console.log('  ✅ Connected to MongoDB\n');
  } else {
    console.log('  ⚠️  DRY RUN — no DB writes\n');
  }

  // Read CSV
  const csvPath = path.join(CSV_DIR, 'companies.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`companies.csv not found at: ${csvPath}`);
  }

  const rows: CsvRow[] = await new Promise((resolve, reject) => {
    const results: CsvRow[] = [];
    fs.createReadStream(csvPath)
      .pipe(csvParser({ mapHeaders: ({ header }: { header: string }) => header.replace(/^\uFEFF/, '') }))
      .on('data', (row: CsvRow) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', reject);
  });

  console.log(`  📄 Total rows in CSV: ${rows.length}`);

  // Filter: only rows with ftp.enabled = true
  const ftpRows = rows.filter(row => {
    if (row.disabled === '1') return false;
    try {
      const params = JSON.parse(row.params || '{}');
      const ftp: OldFtpParams = params?.ftp || {};
      return ftp.enabled === true && ftp.password && ftp.password.trim().length > 0;
    } catch {
      return false;
    }
  });

  console.log(`  🔍 Rows with old FTP enabled: ${ftpRows.length}\n`);

  const stats = {
    processed: 0,
    notFoundInNew: 0,
    alreadyHasNewFtp: 0,
    hasApiConfig: 0,
    alreadyMigrated: 0,
    migrated: 0,
    errors: 0
  };

  const notFound: string[] = [];
  const migrated: string[] = [];
  const skippedNewFtp: string[] = [];
  const skippedApi: string[] = [];

  for (const row of ftpRows) {
    stats.processed++;
    const oldId = row.id?.trim();
    const name = row.name?.trim();

    let ftpPassword = '';
    try {
      const params = JSON.parse(row.params || '{}');
      ftpPassword = params?.ftp?.password?.trim() || '';
    } catch {
      console.warn(`  ⚠️  Could not parse params for "${name}" (id=${oldId})`);
      stats.errors++;
      continue;
    }

    if (!name) {
      stats.errors++;
      continue;
    }

    // Lookup in new MongoDB
    if (!DRY_RUN) {
      const company = await Company.findOne({ name }).lean() as any;

      if (!company) {
        stats.notFoundInNew++;
        notFound.push(name);
        continue;
      }

      // Skip if already has new FTP
      if (company.ftpConfig?.enabled === true) {
        stats.alreadyHasNewFtp++;
        skippedNewFtp.push(name);
        continue;
      }

      // Skip if has API sync
      if (company.apiConfig) {
        stats.hasApiConfig++;
        skippedApi.push(name);
        continue;
      }

      // Skip if already migrated
      if (company.legacyFtpConfig?.enabled === true) {
        stats.alreadyMigrated++;
        continue;
      }

      const encryptedPassword = encryptPassword(ftpPassword, cryptoKey);
      const ftpUsername = `ftp_${oldId}`;

      await Company.updateOne(
        { _id: company._id },
        {
          $set: {
            legacyFtpConfig: {
              enabled: true,
              host: OLD_FTP_HOST,
              port: OLD_FTP_PORT,
              username: ftpUsername,
              encryptedPassword,
              remoteDir: OLD_FTP_REMOTE_DIR,
              pollIntervalHours: 12,
              consecutiveErrors: 0
            }
          }
        }
      );

      stats.migrated++;
      migrated.push(`${name} (ftp_${oldId})`);
      console.log(`  ✅ Migrated: "${name}" → ftp_${oldId}`);
    } else {
      // Dry run: just check name match
      const ftpUsername = `ftp_${oldId}`;
      console.log(`  [DRY] Would migrate: "${name}" → ${ftpUsername} | pass: ${ftpPassword.slice(0, 4)}***`);
      stats.migrated++;
      migrated.push(`${name} (${ftpUsername})`);
    }
  }

  // Report
  console.log(`\n${'─'.repeat(70)}`);
  console.log('  MIGRATION REPORT');
  console.log(`${'─'.repeat(70)}`);
  console.log(`  Total old FTP rows:        ${ftpRows.length}`);
  console.log(`  Migrated${DRY_RUN ? ' (dry)' : ''}:          ${stats.migrated}`);
  console.log(`  Not found in new project:  ${stats.notFoundInNew}`);
  console.log(`  Already has new FTP:       ${stats.alreadyHasNewFtp}`);
  console.log(`  Has API sync (skipped):    ${stats.hasApiConfig}`);
  console.log(`  Already migrated:          ${stats.alreadyMigrated}`);
  console.log(`  Errors:                    ${stats.errors}`);

  if (notFound.length > 0) {
    console.log(`\n  ⚠️  NOT FOUND in new project (${notFound.length}):`);
    notFound.forEach(n => console.log(`     - ${n}`));
  }

  if (skippedNewFtp.length > 0) {
    console.log(`\n  ℹ️  Skipped (already has new FTP) (${skippedNewFtp.length}):`);
    skippedNewFtp.forEach(n => console.log(`     - ${n}`));
  }

  if (skippedApi.length > 0) {
    console.log(`\n  ℹ️  Skipped (has API sync) (${skippedApi.length}):`);
    skippedApi.forEach(n => console.log(`     - ${n}`));
  }

  console.log('');

  if (!DRY_RUN) {
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
