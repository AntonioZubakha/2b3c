import { parsePhoneNumber } from 'libphonenumber-js/max';

function getBlacklistPrefixes(): string[] {
  const raw = process.env.PHONE_BLACKLIST_PREFIXES || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Strip spaces, dashes, dots, parentheses; keep digits and a single leading +.
 * If the string does not start with +, only digits are returned (caller must reject).
 */
export function sanitizePhoneInput(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const hasPlus = t.startsWith('+');
  const digits = t.replace(/\D/g, '');
  if (!digits) return '';
  if (hasPlus) return `+${digits}`;
  return digits;
}

export type PhoneValidationResult =
  | { ok: true; e164: string }
  | { ok: false; message: string };

/**
 * Validates and returns E.164 (+…).
 * **The number must use international notation: a leading + and country calling code** (ITU metadata via libphonenumber-js).
 * National-only input without + is rejected.
 */
export function validatePhoneToE164(raw: string): PhoneValidationResult {
  const sanitized = sanitizePhoneInput(raw);
  if (!sanitized) {
    return { ok: false, message: 'Phone number is required' };
  }

  if (!sanitized.startsWith('+')) {
    return {
      ok: false,
      message: 'Phone number must start with + and country code (e.g. +380991234567, +14155552671)'
    };
  }

  if (sanitized.length > 16) {
    return { ok: false, message: 'Phone number is too long' };
  }

  try {
    const phoneNumber = parsePhoneNumber(sanitized);

    if (!phoneNumber.isValid()) {
      return {
        ok: false,
        message:
          'Invalid phone number: check country code and length for this region (E.164, starting with +).'
      };
    }

    const e164 = phoneNumber.format('E.164');

    for (const prefix of getBlacklistPrefixes()) {
      if (e164.startsWith(prefix)) {
        return { ok: false, message: 'This phone number is not allowed' };
      }
    }

    return { ok: true, e164 };
  } catch {
    return {
      ok: false,
      message: 'Invalid phone number. Use international format with + and country code (e.g. +380991234567).'
    };
  }
}
