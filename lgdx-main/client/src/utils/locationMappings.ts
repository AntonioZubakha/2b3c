/**
 * Location mappings for normalizing diamond locations
 */

// Indian locations that should be mapped to 'INDIA'
export const INDIAN_LOCATIONS = [
  'IND', 'INDIA', 'MUMBAI', 'SURAT', 'DELHI', 'KOLKATA', 'CHENNAI', 'BANGALORE', 'BENGALURU',
  'HYDERABAD', 'PUNE', 'AHMEDABAD', 'JAIPUR', 'LUCKNOW', 'KANPUR', 'NAGPUR', 'INDORE',
  'THANE', 'BHOPAL', 'VISAKHAPATNAM', 'PIMPRICHINCHWAD', 'PATNA', 'VADODARA', 'GHAZIABAD',
  'LUDHIANA', 'AGRA', 'NASHIK', 'FARIDABAD', 'MEERUT', 'RAJKOT', 'KALYANDURG', 'VARANASI',
  'SRINAGAR', 'AURANGABAD', 'NOIDA', 'HOWRAH', 'RANCHI', 'GHAZIABAD', 'CHANDIGARH', 'GUNTUR'
] as const;

// Location mappings for standardization
export const LOCATION_MAPPINGS: { [key: string]: string } = {
  'USA': 'USA',
  'UNITED STATES': 'USA',
  'US': 'USA',
  'AMERICA': 'USA',
  'CHINA': 'CHINA',
  'CN': 'CHINA',
  'BELGIUM': 'BELGIUM',
  'BE': 'BELGIUM',
  'ISRAEL': 'ISRAEL',
  'IL': 'ISRAEL',
  'SOUTH AFRICA': 'SOUTH AFRICA',
  'ZA': 'SOUTH AFRICA',
  'AUSTRALIA': 'AUSTRALIA',
  'AU': 'AUSTRALIA',
  'CANADA': 'CANADA',
  'CA': 'CANADA',
  'THAILAND': 'THAILAND',
  'TH': 'THAILAND',
  'SRI LANKA': 'SRI LANKA',
  'LK': 'SRI LANKA'
};

/**
 * Normalizes location string to standardized format
 * @param location - The location string to normalize
 * @returns Normalized location string
 */
export const normalizeLocation = (location: string | undefined): string => {
  if (!location) return 'N/A';
  
  const locationUpper = location.toUpperCase().trim();
  
  // Check if it's an Indian location
  if ((INDIAN_LOCATIONS as readonly string[]).includes(locationUpper)) {
    return 'INDIA';
  }
  
  // Check other mappings
  return LOCATION_MAPPINGS[locationUpper] || location;
};
