import { describe, it, expect, afterEach } from '@jest/globals';
import { sanitizePhoneInput, validatePhoneToE164 } from '../../utils/phoneValidation';

describe('sanitizePhoneInput', () => {
  it('strips spaces dashes parens', () => {
    expect(sanitizePhoneInput('+1 (415) 555-2671')).toBe('+14155552671');
  });
  it('national digits only', () => {
    expect(sanitizePhoneInput('415 555 2671')).toBe('4155552671');
  });
});

describe('validatePhoneToE164', () => {
  const origBlacklist = process.env.PHONE_BLACKLIST_PREFIXES;

  afterEach(() => {
    process.env.PHONE_BLACKLIST_PREFIXES = origBlacklist;
  });

  it('accepts full international US', () => {
    const r = validatePhoneToE164('+1 415 555 2671');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.e164).toBe('+14155552671');
  });

  it('accepts India +91 ten digits', () => {
    const r = validatePhoneToE164('+91 98765 43210');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.e164).toBe('+919876543210');
  });

  it('rejects national number without leading +', () => {
    const r = validatePhoneToE164('4155552671');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/must start with \+/);
  });

  it('rejects UA local without +', () => {
    const r = validatePhoneToE164('0991234567');
    expect(r.ok).toBe(false);
  });

  it('rejects too short international', () => {
    const r = validatePhoneToE164('+12');
    expect(r.ok).toBe(false);
  });

  it('rejects blacklist prefix', () => {
    process.env.PHONE_BLACKLIST_PREFIXES = '+1415555';
    const r = validatePhoneToE164('+1 415 555 2671');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/not allowed/i);
  });
});
