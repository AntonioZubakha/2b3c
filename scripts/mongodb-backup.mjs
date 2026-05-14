#!/usr/bin/env node
/**
 * Runs mongodump --gzip --archive when `mongodump` is on PATH.
 * Usage: MONGO_URI=mongodb://127.0.0.1:27018 OUT_DIR=./backups node scripts/mongodb-backup.mjs
 * Schedule daily (cron / Task Scheduler) and copy archives to encrypted object storage.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27018';
const outDir = process.env.OUT_DIR || join(process.cwd(), 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const archive = join(outDir, `stonee-all-${stamp}.gz`);

mkdirSync(outDir, { recursive: true });

const r = spawnSync(
  'mongodump',
  ['--uri', mongoUri, '--gzip', '--archive', archive],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

if (r.error?.code === 'ENOENT') {
  console.error('mongodump not found on PATH. Install MongoDB Database Tools or use cloud snapshots.');
  process.exit(2);
}

process.exit(r.status ?? 1);
