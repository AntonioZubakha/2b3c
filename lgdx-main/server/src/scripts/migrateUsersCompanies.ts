/**
 * Миграция пользователей и компаний из CSV (старый MySQL-сайт) в MongoDB (LGDX).
 *
 * Правила:
 * - Мигрируем только пользователей с подтверждёнными email И phone (email_confirmed=1, phone_confirmed=1).
 * - Создаём только те компании, у которых есть хотя бы один такой пользователь.
 * - Юзеры без подтверждённых контактов или без привязки к мигрируемой компании — пропускаем.
 * - Все мигрируемые пользователи создаются с role=supervisor (и в User, и в Company.users[]).
 *
 * Типы в MongoDB: company, user (в users[]), _id — записываются через Mongoose как ObjectId;
 * createdAt, updatedAt, lastLogin, cart.updatedAt — как Date. Mongoose сериализует их в BSON корректно.
 *
 * Пароли: на старом сайте password = bcrypt(plainPassword + '_' + salt).
 * При миграции сохраняем password (hex → строка) и legacyPasswordSalt = salt.
 * На новом сайте при логине для таких пользователей проверка: bcrypt.compare(enteredPassword + '_' + salt, user.password).
 *
 * Запуск (из корня репозитория, CSV в текущей папке или MIGRATION_CSV_DIR):
 *   npx ts-node -r tsconfig-paths/register server/src/scripts/migrateUsersCompanies.ts
 * или:
 *   MIGRATION_CSV_DIR=e:\LGDX npx ts-node -r tsconfig-paths/register server/src/scripts/migrateUsersCompanies.ts
 *
 * Переменные:
 *   MIGRATION_CSV_DIR — папка с users.csv, companies.csv, company_addresses.csv (по умолчанию process.cwd())
 *   MONGODB_URI / MONGODB_URI_FILE — подключение к MongoDB
 *   DRY_RUN=1 — только разбор CSV и логирование, без записи в БД
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import csvParser from 'csv-parser';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import Company from '../models/Company';
import { CompanyRole } from '../types';
import { logger } from '../utils/logger';

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const CSV_DIR = process.env.MIGRATION_CSV_DIR || process.cwd();

// Маппинг старых ролей пользователя (число) → новая роль LGDX (по документации и тестовым пользователям)
const LEGACY_USER_ROLE_MAP: Record<string, 'admin' | 'supervisor' | 'manager' | 'logist'> = {
  '1': 'admin',
  '2': 'supervisor',
  '5': 'manager', // legacy "buyer" user role → manager (company type buyer/seller is in Company.roles)
  '23': 'logist',
  '83': 'manager',
  '106': 'manager',
  '109': 'manager',
  '115': 'manager',
  '116': 'manager',
  '121': 'manager',
  '189': 'manager',
  '209': 'manager',
  '245': 'manager',
  '2147483648': 'supervisor',
};

// Справочник country_id (старая БД) → код страны (ISO) для адресов
const COUNTRY_ID_TO_CODE: Record<string, string> = {
  '1': 'US',
  '6': 'US',
  '23': 'BE',
  '83': 'FR',
  '106': 'HK',
  '109': 'IN',
  '115': 'IL',
  '116': 'IT',
  '118': 'JP',
  '189': 'RU',
  '245': 'US',
};

// Маппинг роли компании (старый role/sit_* в CSV) → CompanyRole[]
function mapCompanyRoles(row: Record<string, string>): string[] {
  const role = (row.role || '').trim();
  const sitTaxes = (row.sit_taxes_responsible || '').toLowerCase();
  const sitCommissions = (row.sit_commissions_responsible || '').toLowerCase();
  const sitReturn = (row.sit_return_payment_responsible || '').toLowerCase();
  if (sitTaxes === 'seller' || sitCommissions === 'seller' || sitReturn === 'seller') return [CompanyRole.SELLER];
  if (sitTaxes === 'buyer' || sitCommissions === 'buyer' || sitReturn === 'buyer') return [CompanyRole.BUYER];
  if (role === '2' || role === 'seller') return [CompanyRole.SELLER];
  if (role === 'buyer') return [CompanyRole.BUYER];
  return [CompanyRole.SELLER];
}

function parseJsonField<T = Record<string, unknown>>(raw: string | undefined): T | null {
  if (!raw || String(raw).trim() === '') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function decodeHexPassword(hexStr: string | undefined): string {
  if (!hexStr || String(hexStr).trim() === '') return '';
  const s = String(hexStr).trim();
  if (!/^[0-9a-fA-F]+$/.test(s)) return s; // не hex — вернуть как есть
  try {
    return Buffer.from(s, 'hex').toString('utf8');
  } catch {
    return s;
  }
}

/** Получить значение колонки id (учитывает BOM в заголовке CSV) */
function getRowId(row: Record<string, string | undefined>): string {
  const v = row.id ?? row['\ufeffid'];
  if (v !== undefined) return String(v).trim();
  const key = Object.keys(row).find((k) => k.replace(/\uFEFF/g, '') === 'id');
  return key ? String(row[key] || '').trim() : '';
}

function readCsv<T = Record<string, string>>(filePath: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    if (!fs.existsSync(filePath)) {
        reject(new Error(`File not found: ${filePath}`));
        return;
    }
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row: T) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function connectDb(): Promise<void> {
  const uri = process.env.MONGODB_URI_FILE
    ? fs.readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim()
    : process.env.MONGODB_URI || 'mongodb://localhost:27017/lgdx';
  await mongoose.connect(uri);
  logger.info('[Migrate] Connected to MongoDB');
}

interface CompanyRow {
  id: string;
  name: string;
  legal_address?: string;
  actual_address?: string;
  phone?: string;
  email?: string;
  full_info?: string;
  tax_identity?: string;
  country_id?: string;
  technology?: string;
  disabled?: string;
  role?: string;
  sit_taxes_responsible?: string;
  sit_commissions_responsible?: string;
  sit_return_payment_responsible?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_routing_number?: string;
  bank_swift_code?: string;
  bank_address?: string;
  corr_bank_name?: string;
  corr_bank_account_number?: string;
  corr_bank_swift?: string;
  corr_bank_address?: string;
  credit_company_name?: string;
  credit_phone_number?: string;
  credit_email?: string;
  params?: string;
  site?: string;
  modified?: string;
  created?: string;
  [key: string]: string | undefined;
}

function addressFromLegacyJson(json: Record<string, unknown> | null): Record<string, string> | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const country = (json.countryId as string) || (json.country as string);
  const addressLine1 = (json.addressLine1 as string) || (json.address as string);
  return {
    country: country || '',
    addressLine1: addressLine1 || '',
    addressLine2: (json.addressLine2 as string) || '',
    city: (json.cityName as string) || (json.city as string) || '',
    stateProvinceRegion: (json.regionName as string) || (json.region as string) || '',
    postalCode: (json.zipCode as string) || (json.zip as string) || '',
  };
}

interface AddressRow {
  id: string;
  company_id: string;
  company_name?: string;
  country_id?: string;
  address_line1?: string;
  address_line2?: string;
  city_name?: string;
  region_name?: string;
  zip_code?: string;
  recipient_name?: string;
  recipient_phone?: string;
  is_main?: string;
  disabled?: string;
  [key: string]: string | undefined;
}

/** Возвращает множество company_id, у которых есть хотя бы один юзер с подтверждёнными email и phone */
async function getCompanyIdsWithConfirmedUsers(usersPath: string): Promise<Set<string>> {
  const rows = await readCsv<UserRow>(usersPath);
  const set = new Set<string>();
  for (const row of rows) {
    const email = String(row.email || '').trim();
    const phone = String(row.phone || '').trim();
    const emailConfirmed = row.email_confirmed === '1' || row.email_confirmed === 'true';
    const phoneConfirmed = (row.phone_confirmed || row.phone_cor) === '1' || (row.phone_confirmed || row.phone_cor) === 'true';
    if (!email || !phone || !emailConfirmed || !phoneConfirmed) continue;
    const companyId = String(row.company_id || '').trim();
    if (companyId) set.add(companyId);
  }
  return set;
}

async function migrateCompanies(
  companiesPath: string,
  addressesPath: string,
  companyIdToNewId: Map<string, mongoose.Types.ObjectId>,
  companyIdsWithConfirmedUsers: Set<string>
): Promise<{ created: number; skipped: number }> {
  const rows = await readCsv<CompanyRow>(companiesPath);
  logger.info(`[Migrate] Companies CSV: ${rows.length} rows (only those with ≥1 confirmed-contact user will be created)`);

  const addressRows = fs.existsSync(addressesPath)
    ? await readCsv<AddressRow>(addressesPath)
    : [];
  const addressesByCompany = new Map<string, AddressRow[]>();
  for (const a of addressRows) {
    const cid = String(a.company_id || '').trim();
    if (!cid) continue;
    if (!addressesByCompany.has(cid)) addressesByCompany.set(cid, []);
    addressesByCompany.get(cid)!.push(a);
  }

  const seenNames = new Set<string>();
  const nameRegexEsc = (s: string) => s.replace(new RegExp('[.*+?^${}()|[\\]\\\\]', 'g'), '\\$&');
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const oldId = getRowId(row as Record<string, string | undefined>);
    if (!companyIdsWithConfirmedUsers.has(oldId)) {
      skipped++;
      continue;
    }
    const name = String(row.name || '').trim();
    if (!name) {
      skipped++;
      continue;
    }
    if (seenNames.has(name.toLowerCase())) {
      logger.warn(`[Migrate] Duplicate company name skipped: ${name}`);
      skipped++;
      continue;
    }
    seenNames.add(name.toLowerCase());

    const legalJson = parseJsonField<Record<string, unknown>>(row.legal_address);
    const actualJson = parseJsonField<Record<string, unknown>>(row.actual_address);
    const legalAddr = addressFromLegacyJson(legalJson);
    const actualAddr = addressFromLegacyJson(actualJson);
    const addrs = addressesByCompany.get(oldId) || [];
    const mainAddr = addrs.find((a) => a.is_main === '1');
    const otherAddrs = addrs.filter((a) => a.is_main !== '1');

    const addrCountryCode = (cid: string | undefined) =>
      (cid && COUNTRY_ID_TO_CODE[cid]) || cid || '';
    const shippingAddr = mainAddr
      ? {
          country: addrCountryCode(mainAddr.country_id),
          addressLine1: mainAddr.address_line1 || '',
          addressLine2: mainAddr.address_line2 || '',
          city: mainAddr.city_name || '',
          stateProvinceRegion: mainAddr.region_name || '',
          postalCode: mainAddr.zip_code || '',
        }
      : otherAddrs[0]
        ? {
            country: addrCountryCode(otherAddrs[0].country_id),
            addressLine1: otherAddrs[0].address_line1 || '',
            addressLine2: otherAddrs[0].address_line2 || '',
            city: otherAddrs[0].city_name || '',
            stateProvinceRegion: otherAddrs[0].region_name || '',
            postalCode: otherAddrs[0].zip_code || '',
          }
        : undefined;

    const status = row.disabled === '1' ? 'suspended' : 'active';
    const roles = mapCompanyRoles(row as Record<string, string>);
    const paramsJson = parseJsonField<{ ftp?: { enabled?: boolean } }>(row.params);
    const ftpEnabled = paramsJson?.ftp?.enabled === true;

    const doc: Record<string, unknown> = {
      name,
      description: (row.full_info || '').trim() || undefined,
      status,
      roles,
      details: {
        phone: (row.phone || row.credit_phone_number || '').trim() || undefined,
        email: (row.email || row.credit_email || '').trim() || undefined,
        companyCountry: addrCountryCode(row.country_id) || row.country_id || undefined,
        website: (row.site || '').trim() || undefined,
        technology: (row.technology || '').trim() || undefined,
        legalAddress: legalAddr,
        actualAddress: actualAddr,
        shippingAddress: shippingAddr,
        bankInformation: (row.bank_name || row.bank_account_name || row.bank_account_number)
          ? {
              bankName: row.bank_name,
              accountName: row.bank_account_name || row.credit_company_name,
              accountNumber: row.bank_account_number,
              routingNumber: row.bank_routing_number,
              swiftCode: row.bank_swift_code,
              bankAddress: row.bank_address,
              correspondentBank:
                row.corr_bank_name || row.corr_bank_account_number || row.corr_bank_swift
                  ? {
                      bankName: row.corr_bank_name,
                      accountNumber: row.corr_bank_account_number,
                      swiftCode: row.corr_bank_swift,
                      bankAddress: row.corr_bank_address,
                    }
                  : undefined,
            }
          : undefined,
        taxInformation: row.tax_identity
          ? { taxId: row.tax_identity, vatNumber: undefined, worksWithVat: undefined }
          : undefined,
      },
      users: [] as { user: mongoose.Types.ObjectId; role: string; isActive: boolean }[],
    };
    if (ftpEnabled) {
      (doc as Record<string, unknown>).ftpConfig = { enabled: true };
    }

    if (DRY_RUN) {
      logger.info(`[Migrate] [DRY] Would create company: ${name} (old id ${oldId})`);
      created++;
      continue;
    }

    const namePattern = '^' + nameRegexEsc(name) + '$';
    const existing = await Company.findOne({ name: { $regex: new RegExp(namePattern, 'i') } });
    if (existing) {
      companyIdToNewId.set(oldId, existing._id as mongoose.Types.ObjectId);
      skipped++;
      continue;
    }

    const company = new Company(doc);
    if (row.created) company.createdAt = new Date(parseInt(row.created, 10) * 1000);
    if (row.modified) company.updatedAt = new Date(parseInt(row.modified, 10) * 1000);
    await company.save();
    companyIdToNewId.set(oldId, company._id as mongoose.Types.ObjectId);
    created++;
  }

  logger.info(`[Migrate] Companies: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}

interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  company_id: string;
  email: string;
  email_confirmed?: string;
  phone?: string;
  phone_confirmed?: string;
  phone_cor?: string;
  disabled?: string;
  activated?: string;
  role?: string;
  password?: string;
  salt?: string;
  modified?: string;
  created?: string;
  [key: string]: string | undefined;
}

async function migrateUsers(
  usersPath: string,
  companyIdToNewId: Map<string, mongoose.Types.ObjectId>
): Promise<{ created: number; skipped: number }> {
  const rows = await readCsv<UserRow>(usersPath);
  logger.info(`[Migrate] Users CSV: ${rows.length} rows (only with confirmed email+phone, linked to migrated companies)`);

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = String(row.email || '').trim().toLowerCase();
    const phone = String(row.phone || '').trim();
    const emailVerified = row.email_confirmed === '1' || row.email_confirmed === 'true';
    const phoneVerified = (row.phone_confirmed || row.phone_cor) === '1' || (row.phone_confirmed || row.phone_cor) === 'true';

    if (!email || !phone) {
      skipped++;
      continue;
    }
    if (!emailVerified || !phoneVerified) {
      skipped++;
      continue;
    }

    const companyId = String(row.company_id || '').trim();
    const newCompanyId = companyId ? companyIdToNewId.get(companyId) : undefined;
    if (!newCompanyId) {
      skipped++;
      continue;
    }

    if (seenEmails.has(email)) {
      logger.warn(`[Migrate] Duplicate email skipped: ${email}`);
      skipped++;
      continue;
    }
    if (seenPhones.has(phone)) {
      logger.warn(`[Migrate] Duplicate phone skipped: ${phone}`);
      skipped++;
      continue;
    }

    const legacyRole = String(row.role || '').trim();
    const role = 'supervisor';

    const rawPassword = (row.password || '').trim();
    const password = decodeHexPassword(rawPassword || undefined);
    const salt = (row.salt || '').trim();

    const isActive = row.disabled !== '1' && (row.activated === '1' || row.activated === 'true');

    if (DRY_RUN) {
      logger.info(`[Migrate] [DRY] Would create user: ${email} role=${role} companyId=${companyId}`);
      created++;
      seenEmails.add(email);
      seenPhones.add(phone);
      continue;
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      seenEmails.add(email);
      seenPhones.add(phone);
      skipped++;
      continue;
    }

    const rowId = getRowId(row as Record<string, string | undefined>) || `row-${i}`;
    const finalPassword = password || await bcrypt.hash(`migrated-reset-required-${rowId}`, 12);
    const isLgdealSupervisor = legacyRole === '2147483648';
    const userDoc: Record<string, unknown> = {
      email,
      password: finalPassword,
      firstName: (row.first_name || '').trim() || 'Migrated',
      lastName: (row.last_name || '').trim() || 'User',
      phone,
      company: newCompanyId,
      role,
      isActive,
      isLgdealSupervisor,
      emailVerified,
      phoneVerified,
      cart: { items: [], updatedAt: new Date() },
    };
    if (password && salt) {
      (userDoc as Record<string, string>).legacyPasswordSalt = salt;
    }
    if (row.created) (userDoc as Record<string, Date>).createdAt = new Date(parseInt(row.created, 10) * 1000);
    if (row.modified) (userDoc as Record<string, Date>).updatedAt = new Date(parseInt(row.modified, 10) * 1000);

    const user = new User(userDoc);
    await user.save();

    await Company.findByIdAndUpdate(newCompanyId, {
      $push: {
        users: {
          user: user._id,
          role: 'supervisor',
          isActive,
        },
      },
    });

    created++;
    seenEmails.add(email);
    seenPhones.add(phone);
  }

  logger.info(`[Migrate] Users: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}

async function main(): Promise<void> {
  const companiesPath = path.join(CSV_DIR, 'companies.csv');
  const addressesPath = path.join(CSV_DIR, 'company_addresses.csv');
  const usersPath = path.join(CSV_DIR, 'users.csv');

  for (const p of [companiesPath, usersPath]) {
    if (!fs.existsSync(p)) {
      logger.error(`[Migrate] Missing file: ${p}`);
      process.exit(1);
    }
  }

  if (!DRY_RUN) {
    await connectDb();
  } else {
    logger.info('[Migrate] DRY_RUN=1: skipping MongoDB connection');
  }

  const companyIdsWithConfirmedUsers = await getCompanyIdsWithConfirmedUsers(usersPath);
  logger.info(`[Migrate] Companies with ≥1 confirmed-contact user: ${companyIdsWithConfirmedUsers.size}`);

  const companyIdToNewId = new Map<string, mongoose.Types.ObjectId>();
  let companiesResult = { created: 0, skipped: 0 };
  let usersResult = { created: 0, skipped: 0 };

  try {
    companiesResult = await migrateCompanies(companiesPath, addressesPath, companyIdToNewId, companyIdsWithConfirmedUsers);
    usersResult = await migrateUsers(usersPath, companyIdToNewId);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      logger.info('[Migrate] Disconnected from MongoDB');
    }
  }

  logger.info('[Migrate] === Summary ===');
  logger.info(`[Migrate] Companies: ${companiesResult.created} created, ${companiesResult.skipped} skipped`);
  logger.info(`[Migrate] Users: ${usersResult.created} created, ${usersResult.skipped} skipped`);
  logger.info(`[Migrate] Company ID mapping: ${companyIdToNewId.size} old IDs → new ObjectIds`);
  if (DRY_RUN) logger.info('[Migrate] DRY RUN completed — no data written');
}

main().catch((err) => {
  logger.error('[Migrate] Fatal error:', err);
  process.exit(1);
});
