export const EXCHANGE_RATES = {
  USD: { rate: 1.0, symbol: '$', locale: 'en-US', name: 'US Dollar ($)' },
  EUR: { rate: 0.92, symbol: '€', locale: 'de-DE', name: 'Euro (€)' },
  GBP: { rate: 0.79, symbol: '£', locale: 'en-GB', name: 'British Pound (£)' },
  INR: { rate: 83.3, symbol: '₹', locale: 'en-IN', name: 'Indian Rupee (₹)' },
  CAD: { rate: 1.36, symbol: 'CA$', locale: 'en-CA', name: 'Canadian Dollar (CA$)' },
  AUD: { rate: 1.51, symbol: 'A$', locale: 'en-AU', name: 'Australian Dollar (A$)' },
  JPY: { rate: 156.4, symbol: '¥', locale: 'ja-JP', name: 'Japanese Yen (¥)' }
};

// IP Country Geolocation to Currency Mapping
export const COUNTRY_TO_CURRENCY = {
  US: 'USD',
  IN: 'INR',
  GB: 'GBP',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', FI: 'EUR', PT: 'EUR', GR: 'EUR',
  CA: 'CAD',
  AU: 'AUD', NZ: 'AUD',
  JP: 'JPY'
};

// Browser Language Locale to Currency Mapping
export const LOCALE_TO_CURRENCY = {
  'en-US': 'USD',
  'en-IN': 'INR',
  'hi-IN': 'INR',
  'en-GB': 'GBP',
  'de-DE': 'EUR',
  'fr-FR': 'EUR',
  'it-IT': 'EUR',
  'es-ES': 'EUR',
  'nl-NL': 'EUR',
  'en-CA': 'CAD',
  'fr-CA': 'CAD',
  'en-AU': 'AUD',
  'ja-JP': 'JPY'
};
