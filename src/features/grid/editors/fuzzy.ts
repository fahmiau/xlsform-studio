/**
 * Small deterministic fuzzy matcher for the enum editors. `sel1` matches
 * `select_one` because a trailing digit is read as its word ("one").
 */
const DIGIT_WORDS: Record<string, string> = {
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/([0-9])/g, (digit) => DIGIT_WORDS[digit] ?? digit);
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return needle.length === 0;
}

/** Higher is better; 0 means no match. */
export function fuzzyScore(query: string, text: string): number {
  const needle = normalize(query.trim());
  if (needle === '') return 1;
  const haystack = normalize(text);
  if (haystack === needle) return 1000;
  if (haystack.startsWith(needle)) return 800 - haystack.length;
  if (haystack.includes(needle)) return 600 - haystack.indexOf(needle);
  if (isSubsequence(needle, haystack)) return 300 - haystack.length;
  return 0;
}

export function filterByFuzzy<T>(
  query: string,
  items: readonly T[],
  textOf: (item: T) => string,
): T[] {
  if (query.trim() === '') return [...items];
  return items
    .map((item) => ({ item, score: fuzzyScore(query, textOf(item)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
