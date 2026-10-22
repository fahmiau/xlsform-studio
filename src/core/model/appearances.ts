/**
 * Appearance catalog (Task 3.1, PRD §4.2). Suggestions are filtered by the
 * question's base type; unknown values typed by the user are still accepted.
 */
import { normalizeQuestionTypeName } from './questionTypes';

export interface AppearanceSuggestion {
  name: string;
  description: string;
}

interface CatalogEntry extends AppearanceSuggestion {
  /** Base types that accept the appearance. `*` means every type. */
  types: readonly string[];
}

const SELECT_TYPES = ['select_one', 'select_multiple', 'rank'] as const;
const INPUT_TYPES = ['integer', 'decimal', 'range', 'text'] as const;

const CATALOG: readonly CatalogEntry[] = [
  // Layout (groups, repeats, and most inputs).
  {
    name: 'field-list',
    description: 'Render the group on its own screen',
    types: ['begin_group', 'begin_repeat'],
  },
  {
    name: 'table-list',
    description: 'Grid of related questions',
    types: ['begin_group', 'begin_repeat'],
  },
  {
    name: 'minimal',
    description: 'Compact single-line widget',
    types: [...SELECT_TYPES, ...INPUT_TYPES],
  },
  {
    name: 'quick',
    description: 'One-tap buttons',
    types: ['select_one', 'select_multiple', 'integer', 'decimal', 'range'],
  },
  {
    name: 'horizontal',
    description: 'Lay choices out horizontally',
    types: [...SELECT_TYPES, ...INPUT_TYPES],
  },
  {
    name: 'horizontal-compact',
    description: 'Narrow horizontal choices',
    types: ['select_one', 'select_multiple'],
  },
  {
    name: 'likert',
    description: 'Likert scale',
    types: ['select_one', 'select_multiple', 'integer', 'decimal', 'range'],
  },
  {
    name: 'compact',
    description: 'Compact dropdown-like list',
    types: ['select_one', 'select_multiple'],
  },
  {
    name: 'autocomplete',
    description: 'Type-ahead search',
    types: ['select_one', 'select_multiple'],
  },
  { name: 'search', description: 'Searchable select', types: ['select_one', 'select_multiple'] },
  {
    name: 'columns',
    description: 'Pack choices into columns',
    types: ['select_one', 'select_multiple'],
  },
  {
    name: 'columns-pack',
    description: 'Column layout sized to content',
    types: ['select_one', 'select_multiple'],
  },
  {
    name: 'columns-n',
    description: 'Column layout for numeric choices',
    types: ['select_one', 'select_multiple'],
  },
  {
    name: 'no-buttons',
    description: 'Hide the choice buttons',
    types: ['select_one', 'select_multiple'],
  },
  {
    name: 'map',
    description: 'Map-based select',
    types: ['select_one', 'select_multiple', 'geopoint'],
  },
  {
    name: 'image',
    description: 'Image buttons',
    types: ['select_one', 'select_multiple', 'image'],
  },
  { name: 'other', description: 'Extra “Other” field', types: ['select_one', 'select_multiple'] },

  // Text inputs.
  { name: 'multiline', description: 'Multi-line text box', types: ['text'] },
  { name: 'numbers', description: 'Numeric keypad', types: ['text', 'integer', 'decimal'] },
  { name: 'numbers_decimal', description: 'Decimal numeric keypad', types: ['text'] },
  { name: 'numbers_phone', description: 'Phone keypad', types: ['text'] },
  { name: 'url', description: 'URL keyboard', types: ['text'] },
  { name: 'mask', description: 'Input mask', types: ['text'] },
  { name: 'signature', description: 'Signature capture', types: ['image', 'text'] },
  { name: 'draw', description: 'Freehand drawing', types: ['image'] },

  // Numeric scales and ranges.
  { name: 'distress', description: '0–10 distress scale', types: ['integer', 'decimal', 'range'] },
  { name: 'rating', description: 'Star rating', types: ['integer', 'decimal', 'range'] },
  { name: 'bearing', description: 'Compass bearing', types: ['integer', 'decimal'] },
  { name: 'bears', description: 'Compass bearings', types: ['geopoint'] },
  { name: 'vertical', description: 'Vertical tick marks', types: ['range'] },
  { name: 'no-ticks', description: 'Hide range ticks', types: ['range'] },

  // Dates and times.
  { name: 'month-year', description: 'Month and year only', types: ['date'] },
  { name: 'year', description: 'Year only', types: ['date'] },
  { name: 'month', description: 'Month only', types: ['date'] },
  { name: 'day', description: 'Day only', types: ['date'] },
  { name: 'no-calendar', description: 'Hide the calendar popup', types: ['date'] },
  { name: 'no-hours', description: 'Hide hours', types: ['time'] },
  { name: 'no-minutes', description: 'Hide minutes', types: ['time'] },
  { name: 'no-seconds', description: 'Hide seconds', types: ['time'] },

  // Captures.
  { name: 'new', description: 'Open the camera directly', types: ['image', 'audio', 'video'] },
  { name: 'new-front', description: 'Open the front camera', types: ['image'] },
  { name: 'new-rear', description: 'Open the rear camera', types: ['image'] },
  { name: 'annotate', description: 'Annotate a photo', types: ['image'] },
];

const WIDTH_APPEARANCES: readonly CatalogEntry[] = Array.from({ length: 5 }, (_, index) => ({
  name: `w${index + 1}`,
  description: `Width ${index + 1} of 5 columns`,
  types: ['*'],
}));

const ALL = [...CATALOG, ...WIDTH_APPEARANCES];

/** Suggestions for a `type` cell, e.g. `select_one gender`. */
export function appearanceSuggestions(rawType: string): AppearanceSuggestion[] {
  const base = normalizeQuestionTypeName(rawType);
  return ALL.filter((entry) => entry.types.includes('*') || entry.types.includes(base)).map(
    ({ name, description }) => ({ name, description }),
  );
}

/** True when the appearance is known for this base type. */
export function isKnownAppearance(rawType: string, appearance: string): boolean {
  const value = appearance.trim();
  return appearanceSuggestions(rawType).some((entry) => entry.name === value);
}
