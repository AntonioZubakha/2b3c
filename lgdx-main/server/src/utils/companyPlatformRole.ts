import Company from '../models/Company';
import User from '../models/User';
import { CompanyRole } from '../types';

export type CompanyPlatformRole = 'buyer' | 'seller' | 'both';

/**
 * Maps company.roles[] (seller / buyer / both) to a single audience label for AI prompts.
 */
export function derivePlatformRoleFromCompanyRoles(
  roles: string[] | undefined | null
): CompanyPlatformRole | undefined {
  if (!roles || roles.length === 0) return undefined;
  const set = new Set(roles.map((r) => String(r).toLowerCase()));
  if (set.has(CompanyRole.BOTH)) return 'both';
  const hasBuyer = set.has(CompanyRole.BUYER);
  const hasSeller = set.has(CompanyRole.SELLER);
  if (hasBuyer && hasSeller) return 'both';
  if (hasBuyer) return 'buyer';
  if (hasSeller) return 'seller';
  return undefined;
}

/**
 * Load company registration role for a user (ObjectId string).
 */
export async function getCompanyPlatformRoleForUserId(
  userId: string
): Promise<CompanyPlatformRole | undefined> {
  try {
    const user = await User.findById(userId).select('company').lean();
    if (!user?.company) return undefined;
    const company = await Company.findById(user.company).select('roles').lean();
    return derivePlatformRoleFromCompanyRoles(company?.roles as string[] | undefined);
  } catch {
    return undefined;
  }
}

/**
 * Match Telegram peer id to a platform user (linked "Telegram" in profile) → company.roles.
 */
export async function getCompanyPlatformRoleByTelegramId(
  telegramPeerId: string
): Promise<CompanyPlatformRole | undefined> {
  const raw = String(telegramPeerId || '').trim();
  if (raw.length < 2) {
    return undefined;
  }
  try {
    const user = await User.findOne({ telegramId: String(raw) })
      .select('company')
      .lean();
    if (!user?.company) {
      return undefined;
    }
    const company = await Company.findById(user.company).select('roles').lean();
    return derivePlatformRoleFromCompanyRoles(company?.roles as string[] | undefined);
  } catch {
    return undefined;
  }
}

/**
 * Match WhatsApp canonical waId (digits) to a platform user by phone, then company.roles.
 * LID-based waIds (lid_…) are skipped unless we add PN mapping — no DB phone to match.
 */
export async function getCompanyPlatformRoleByWaId(waId: string): Promise<CompanyPlatformRole | undefined> {
  const t = (waId || '').trim();
  if (t.startsWith('lid_')) {
    return undefined;
  }
  const digits = t.replace(/\D/g, '');
  if (digits.length < 8) {
    return undefined;
  }
  try {
    const pattern = '^\\+?' + digits.split('').join('\\D*') + '$';
    const user = await User.findOne({ phone: { $regex: pattern } }).select('company').lean();
    if (!user?.company) {
      return undefined;
    }
    const company = await Company.findById(user.company).select('roles').lean();
    return derivePlatformRoleFromCompanyRoles(company?.roles as string[] | undefined);
  } catch {
    return undefined;
  }
}

export type AudiencePromptMode = 'support' | 'whatsapp';

/**
 * Shared Markdown block for LLM system prompts when company type is known.
 * `support`: in-app assistant — navigation + factual help.
 * `whatsapp`: marketing line — trust-first, different pitch for buyers vs suppliers.
 */
export function buildAudiencePromptSectionForRole(
  platformRole?: string,
  mode: AudiencePromptMode = 'support'
): string {
  if (platformRole == null || String(platformRole).trim() === '') return '';
  const r = String(platformRole).toLowerCase();

  if (mode === 'whatsapp') {
    if (r === 'buyer') {
      return `\n\n## Audience (company type) — WhatsApp\nRegistered as a **buyer** on LGDEAL. Consult like a trade-desk peer: sourcing, catalog depth, filters, cart/deal flow, payment and delivery. Acknowledge their time pressure; never push; one soft CTA to **https://lgdeal.com** when natural. Do not pitch “listing inventory” unless they say they also sell.`;
    }
    if (r === 'seller') {
      return `\n\n## Audience (company type) — WhatsApp\nRegistered as a **supplier (seller)** on LGDEAL. Consult like a partner: visibility to serious B2B buyers, deal structure, invoices, shipping, inventory tools. Build confidence in the process — no hype; one soft CTA to **https://lgdeal.com** when relevant. Do not assume they are shopping for stock unless they say so.`;
    }
    if (r === 'both') {
      return `\n\n## Audience (company type) — WhatsApp\nCompany is **both buyer and seller**. Mirror both sourcing and listing value; if the message is ambiguous, ask one short question to see whether they mean buying or selling right now, then answer in that frame — still friendly, not interrogative.`;
    }
    return '';
  }

  if (r === 'buyer') {
    return `\n\n## Audience (company type)\nThis contact is associated with a **buyer** company on LGDEAL. Prioritize sourcing, marketplace catalog, cart, and buyer-side deals (orders, payment, delivery). Do not assume they manage supplier inventory unless they say so.`;
  }
  if (r === 'seller') {
    return `\n\n## Audience (company type)\nThis contact is associated with a **seller** company on LGDEAL. Prioritize listings, inventory, uploads/FTP (when relevant), and supplier-side deals.`;
  }
  if (r === 'both') {
    return `\n\n## Audience (company type)\nThis contact is associated with a company registered as **both buyer and seller** on LGDEAL. Address both buying and selling flows when relevant; ask a brief clarifying question if it is unclear which side they mean.`;
  }
  return '';
}
