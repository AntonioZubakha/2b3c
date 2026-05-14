/**
 * Docker secrets / file paths — shared helpers (no secret values in logs).
 */

import { readFileSync } from 'fs';

export function readSecretAtPath(secretPath: string, fallback?: string): string {
  try {
    const content = readFileSync(secretPath, 'utf8').trim();
    return content || (fallback ?? '');
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Cannot read secret from ${secretPath}: ${error}`);
  }
}
