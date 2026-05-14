/**
 * Read Docker secret file or use fallback (same behavior as legacy inline helper).
 */

import fs from 'fs';

export function readSecretFileOrFallback(filePath: string | undefined, fallback: string): string {
  if (filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content) return content;
    } catch {
      /* use fallback */
    }
  }
  return fallback;
}
