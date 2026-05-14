/**
 * Batch-switches companies from new FTP to legacy FTP (lgdeal.com).
 * Usage: MONGODB_URI=... LEGACY_FTP_CRYPTO_KEY=... MIGRATION_CSV_DIR=... npx ts-node src/scripts/switchBatchToLegacyFtp.ts
 * Add DRY_RUN=1 to preview without writing.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import csvParser from 'csv-parser';

// ─── Config ────────────────────────────────────────────────────────────────
const MONGODB_URI  = process.env.MONGODB_URI  || '';
const CRYPTO_KEY   = Buffer.from(process.env.LEGACY_FTP_CRYPTO_KEY || '', 'hex');
const CSV_DIR      = process.env.MIGRATION_CSV_DIR || '.';
const DRY_RUN      = process.env.DRY_RUN === '1';

const OLD_FTP_HOST       = '65.21.109.96';
const OLD_FTP_PORT       = 21;
const OLD_FTP_REMOTE_DIR = '/files';

// ─── Companies to switch (duplicates removed, Aarush diam already done) ────
const TARGET_NAMES = [
  'YASH DIAM',
  'SHAH NARESHBHAI SURAJMAL HUF',
  'Jinendra gems pp',
  'Uniglo',
  'Solitaire Lab Diamond',
  'Smiling Rocks',
  'VAISHALI GEMS',
  'Forever Grown Diamonds',
  'ANJALI DIAMONDS PRIVATE LIMITED',
  'vidhansh enterprise',
  'NISHAL GEMS',
  'PARIN LAB GROWN USA INC',
  'Shree Bhavani Impex',
  'Labstone',
  'Labtika ink',
  'PARIN GEMS',
  'Created Diamonds inc.',
  'LGDeal LLC',
  'Bhanderi lab grown diamonds inc',
  'ECOLIGHT DIAMOND NY INC',
  'Fenix Diamonds (HK) Limited',
  'Gogreen Diamonds Inc.',
  'Eco Grown Diamond Inc.',
  'ARHAM MEHTA',
  'DIYORA DIAMOND INC',
  'UNIQUE GROWN DIAMOND INC.',
  'K.Pankaj Kumar Diamonds',
  'Greenstar Grown Diamonds',
  'KYRAH STAR',
  'DIARAYS INC',
  'Gopaay Labgrown Diamond',
  'YESHA LAB GROWN DIAMOND',
  'Nexot Jewel Private Limited',
  'Lab Grown Diamond USA LLC',
  'SkyLab Diamond',
  'S J MANUFACTURING CO',
  'SIGNOVA INC',
  'BSD JEWELS INC',
];

// ─── Helpers ────────────────────────────────────────────────────────────────
interface CsvRow { id?: string; name?: string; params?: string; [k: string]: string | undefined }

function encrypt(plaintext: string): string {
  const iv  = crypto.randomBytes(12);
  const c   = crypto.createCipheriv('aes-256-gcm', CRYPTO_KEY, iv);
  const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

async function readCsv(filePath: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];
    fs.createReadStream(filePath)
      .pipe(csvParser({ mapHeaders: ({ header }: { header: string }) => header.replace(/^\uFEFF/, '') }))
      .on('data', (r: CsvRow) => rows.push(r))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n======================================================================');
  console.log('  Batch Switch → Legacy FTP');
  console.log('======================================================================');
  console.log(`  DRY_RUN: ${DRY_RUN}`);
  if (DRY_RUN) console.log('  ⚠️  DRY RUN — no DB writes\n');

  if (!MONGODB_URI) { console.error('MONGODB_URI is required'); process.exit(1); }
  if (CRYPTO_KEY.length !== 32) { console.error('LEGACY_FTP_CRYPTO_KEY must be 64 hex chars'); process.exit(1); }

  // Read CSV
  const csvPath = path.join(CSV_DIR, 'companies.csv');
  const rows = await readCsv(csvPath);

  // Build lookup: name (lowercase) → { id, password }
  const csvMap = new Map<string, { id: string; password: string }>();
  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) continue;
    try {
      const params = JSON.parse(row.params || '{}');
      if (params?.ftp?.enabled && params.ftp.password) {
        csvMap.set(name.toLowerCase(), { id: row.id?.trim() || '', password: params.ftp.password });
      }
    } catch { /* skip malformed rows */ }
  }
  console.log(`  CSV FTP-enabled entries: ${csvMap.size}\n`);

  // Connect to MongoDB
  await mongoose.connect(MONGODB_URI);
  console.log('  ✅ Connected to MongoDB\n');

  const Company = mongoose.model('Company', new mongoose.Schema({}, { strict: false, collection: 'companies' }));

  // Stats
  const stats = {
    switched: 0,
    notInCsv: [] as string[],
    notInMongo: [] as string[],
    alreadySwitched: [] as string[],
    noFtpInCsv: [] as string[],
    errors: [] as string[],
  };

  for (const targetName of TARGET_NAMES) {
    const csvEntry = csvMap.get(targetName.toLowerCase());
    if (!csvEntry) {
      // Try case-insensitive partial check
      const found = [...csvMap.entries()].find(([k]) => k === targetName.toLowerCase());
      if (!found) {
        stats.noFtpInCsv.push(targetName);
        console.log(`  ⚠️  Not in CSV (or FTP disabled): "${targetName}"`);
        continue;
      }
    }

    const company: any = await Company.findOne({ name: targetName });
    if (!company) {
      stats.notInMongo.push(targetName);
      console.log(`  ❌ Not found in MongoDB: "${targetName}"`);
      continue;
    }

    // Already on legacy FTP
    if (company.legacyFtpConfig?.enabled) {
      stats.alreadySwitched.push(targetName);
      console.log(`  ✓  Already on legacy FTP: "${targetName}"`);
      continue;
    }

    const { id, password } = csvEntry!;
    const ftpUsername = `ftp_${id}`;

    if (DRY_RUN) {
      console.log(`  [DRY] Would switch: "${targetName}" → ${ftpUsername}`);
      stats.switched++;
      continue;
    }

    try {
      const encryptedPassword = encrypt(password);
      await Company.updateOne(
        { _id: company._id },
        {
          $set: {
            'ftpConfig.enabled': false,
            legacyFtpConfig: {
              enabled: true,
              host: OLD_FTP_HOST,
              port: OLD_FTP_PORT,
              username: ftpUsername,
              encryptedPassword,
              remoteDir: OLD_FTP_REMOTE_DIR,
              pollIntervalHours: 12,
              consecutiveErrors: 0,
            },
          },
        }
      );
      console.log(`  ✅ Switched: "${targetName}" → ${ftpUsername}`);
      stats.switched++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`${targetName}: ${msg}`);
      console.log(`  ❌ Error "${targetName}": ${msg}`);
    }
  }

  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log('  REPORT');
  console.log('──────────────────────────────────────────────────────────────────────');
  console.log(`  Switched:            ${stats.switched}`);
  console.log(`  Already on legacy:   ${stats.alreadySwitched.length}`);
  console.log(`  Not in CSV/FTP off:  ${stats.noFtpInCsv.length}  ${stats.noFtpInCsv.length ? '→ ' + stats.noFtpInCsv.join(', ') : ''}`);
  console.log(`  Not in MongoDB:      ${stats.notInMongo.length}  ${stats.notInMongo.length ? '→ ' + stats.notInMongo.join(', ') : ''}`);
  console.log(`  Errors:              ${stats.errors.length}  ${stats.errors.length ? '→ ' + stats.errors.join('; ') : ''}`);
  console.log('');

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
