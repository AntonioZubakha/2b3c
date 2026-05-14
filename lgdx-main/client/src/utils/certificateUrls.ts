/**
 * Certificate URL patterns and generators for different laboratories
 */

// Certificate URL generators
export const CERTIFICATE_URLS: Record<string, (cert: string) => string> = {
  igi: (cert) => `https://www.igi.org/verify-your-report/?r=${cert}`,
  gcal: (cert) => `https://www.gcalusa.com/certificate-search.html?certificate_id=${cert}`,
  gia: (cert) => `https://www.gia.edu/report-check?locale=en_US&reportno=${cert}`,
  hrd: (cert) => `https://my.hrdantwerp.com/?record_number=${cert}`,
  ags: (cert) => `https://agslab.com/ym-vdgr/en-us/login?r=${cert}`,
  igl: (cert) => `https://www.igl-labs.com/en/grading-results/p/peport_no/${cert}`,
};

// Patterns to match institute names
export const CERTIFICATE_PATTERNS: Record<string, string> = {
  igi: 'international gemological institute',
  gcal: 'gem certification & assurance lab',
  gia: 'gemological institute of america',
  hrd: 'hrd antwerp',
  ags: 'american gem society',
  igl: 'international gemological laboratories',
};

/**
 * Validates URL to ensure it's safe
 * @param url - URL to validate
 * @returns Validated URL or empty string if invalid
 */
const validateUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // Only allow https protocols
    if (urlObj.protocol !== 'https:') {
      return '';
    }
    return url;
  } catch {
    return '';
  }
};

/**
 * Generates certificate URL based on institute and certificate number
 * @param institute - The certificate institute name
 * @param certificateNumber - The certificate number
 * @returns Validated certificate URL or empty string if not found
 */
export const getCertificateUrl = (institute: string, certificateNumber: string): string => {
  if (!institute || !certificateNumber) return '';
  
  const instituteLower = institute.toLowerCase();
  
  // Find matching pattern and generate URL
  for (const [key, pattern] of Object.entries(CERTIFICATE_PATTERNS)) {
    if (instituteLower.includes(pattern) || instituteLower.includes(key)) {
      const urlGenerator = CERTIFICATE_URLS[key];
      if (urlGenerator) {
        const url = urlGenerator(certificateNumber);
        return validateUrl(url);
      }
    }
  }
  
  return '';
};
