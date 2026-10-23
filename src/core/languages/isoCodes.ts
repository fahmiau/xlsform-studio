/**
 * Common ISO 639-1 codes for the Add Language dialog (Task 5.5). The search is
 * deliberately local and offline: no network, no dependency (AD-1).
 */

export interface IsoCode {
  code: string;
  name: string;
}

export const ISO_CODES: readonly IsoCode[] = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Indonesian' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'ar', name: 'Arabic' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'sw', name: 'Swahili' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ru', name: 'Russian' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'ms', name: 'Malay' },
  { code: 'fil', name: 'Filipino' },
  { code: 'ur', name: 'Urdu' },
  { code: 'fa', name: 'Persian' },
  { code: 'ha', name: 'Hausa' },
  { code: 'am', name: 'Amharic' },
  { code: 'so', name: 'Somali' },
  { code: 'my', name: 'Burmese' },
  { code: 'km', name: 'Khmer' },
  { code: 'lo', name: 'Lao' },
  { code: 'ne', name: 'Nepali' },
  { code: 'si', name: 'Sinhala' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'ig', name: 'Igbo' },
  { code: 'zu', name: 'Zulu' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'sq', name: 'Albanian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'bg', name: 'Bulgarian' },
];

const byCode = new Map(ISO_CODES.map((entry) => [entry.code, entry]));

export function isoLanguageName(code: string): string | undefined {
  return byCode.get(code.trim().toLowerCase())?.name;
}

/** Fuzzy-ish search: code prefix first, then name substring. */
export function searchIsoCodes(query: string, limit = 40): IsoCode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return ISO_CODES.slice(0, limit);
  const prefix: IsoCode[] = [];
  const substring: IsoCode[] = [];
  for (const entry of ISO_CODES) {
    if (entry.code === needle || entry.code.startsWith(needle)) prefix.push(entry);
    else if (entry.name.toLowerCase().includes(needle)) substring.push(entry);
  }
  return [...prefix, ...substring].slice(0, limit);
}
