import crypto from 'crypto';
import { config } from '../shared/config';

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const hex = config.cryptoKey;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'LEGACY_FTP_CRYPTO_KEY must be a 64-char hex string. ' +
      'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  _key = Buffer.from(hex, 'hex');
  return _key;
}

/**
 * Decrypts a password stored in MongoDB.
 * Format: iv_hex:authTag_hex:cipher_hex
 */
export function decryptPassword(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted password format');
  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}
