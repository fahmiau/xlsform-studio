/**
 * ODK XForms function catalog (PRD §4.2, Task 4.2).
 *
 * Pure data: the formula IDE, signature help, and snippet completion all read
 * this one list. Snippets use CodeMirror's snippet syntax (`${1:name}`).
 */

export type FunctionCategory =
  'Selection' | 'Math & Logic' | 'Strings' | 'Repeats & Groups' | 'Dates' | 'Other';

export interface FunctionParam {
  name: string;
  optional?: boolean;
  description?: string;
}

export interface XPathFunction {
  name: string;
  category: FunctionCategory;
  /** Human-readable signature, e.g. `selected(field, value)`. */
  signature: string;
  params: readonly FunctionParam[];
  returns: string;
  description: string;
  /** CodeMirror snippet template with tab stops. */
  snippet: string;
  docsUrl: string;
}

const DOCS = 'https://docs.getodk.org/form-operators-functions/';
const SPEC = 'https://getodk.github.io/xforms-spec/#xpath-expressions';

function docs(name: string): string {
  return `${DOCS}#${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function fn(
  name: string,
  category: FunctionCategory,
  params: readonly FunctionParam[],
  returns: string,
  description: string,
  options: { snippet?: string; docsUrl?: string } = {},
): XPathFunction {
  const signature = `${name}(${params
    .map((param) => (param.optional ? `[${param.name}]` : param.name))
    .join(', ')})`;
  return {
    name,
    category,
    signature,
    params,
    returns,
    description,
    snippet:
      options.snippet ??
      `${name}(${params.map((param, index) => `\${${index + 1}:${param.name}}`).join(', ')})`,
    docsUrl: options.docsUrl ?? docs(name),
  };
}

export const XPATH_FUNCTIONS: readonly XPathFunction[] = [
  // Selection (PRD §4.2)
  fn(
    'selected',
    'Selection',
    [
      { name: 'field', description: 'A select question, e.g. ${marital_status}' },
      { name: 'value', description: 'A choice name from that list' },
    ],
    'boolean',
    'True when the select question includes the given choice value.',
  ),
  fn(
    'count-selected',
    'Selection',
    [{ name: 'field' }],
    'number',
    'Number of choices selected in a select_multiple question.',
  ),
  fn(
    'selected-at',
    'Selection',
    [{ name: 'field' }, { name: 'index', description: 'Zero-based position' }],
    'string',
    'The choice name selected at a zero-based position.',
  ),
  fn(
    'jr:choice-name',
    'Selection',
    [{ name: 'value' }, { name: 'field', description: "Quoted field name, e.g. 'marital_status'" }],
    'string',
    'Display label of a choice value for the given select field.',
  ),
  fn(
    'jr:selected',
    'Selection',
    [{ name: 'field' }, { name: 'value' }],
    'boolean',
    'Alias of selected() used by some JavaRosa versions.',
  ),

  // Math & Logic (PRD §4.2)
  fn(
    'round',
    'Math & Logic',
    [{ name: 'num' }, { name: 'places' }],
    'number',
    'Rounds a number to the given number of decimal places.',
  ),
  fn('int', 'Math & Logic', [{ name: 'num' }], 'number', 'Truncates a number to an integer.'),
  fn(
    'pow',
    'Math & Logic',
    [{ name: 'base' }, { name: 'exp' }],
    'number',
    'Raises a base to an exponent.',
  ),
  fn(
    'coalesce',
    'Math & Logic',
    [{ name: 'a' }, { name: 'b', optional: true }],
    'any',
    'Returns the first non-empty argument.',
    { snippet: 'coalesce(${1:a}, ${2:b})' },
  ),
  fn(
    'if',
    'Math & Logic',
    [{ name: 'cond' }, { name: 'then' }, { name: 'else' }],
    'any',
    'Conditional expression. Both branches are evaluated lazily by the client.',
  ),
  fn('not', 'Math & Logic', [{ name: 'expr' }], 'boolean', 'Logical negation.'),
  fn(
    'boolean-from-string',
    'Math & Logic',
    [{ name: 'value' }],
    'boolean',
    "Parses 'true'/'1' and 'false'/'0' strings.",
  ),
  fn('true', 'Math & Logic', [], 'boolean', 'The boolean true value.'),
  fn('false', 'Math & Logic', [], 'boolean', 'The boolean false value.'),
  fn('number', 'Math & Logic', [{ name: 'value' }], 'number', 'Converts a value to a number.'),
  fn('string', 'Math & Logic', [{ name: 'value' }], 'string', 'Converts a value to a string.'),
  fn(
    'max',
    'Math & Logic',
    [{ name: 'a' }, { name: 'b', optional: true }],
    'number',
    'Largest of its arguments.',
    {
      snippet: 'max(${1:a}, ${2:b})',
    },
  ),
  fn(
    'min',
    'Math & Logic',
    [{ name: 'a' }, { name: 'b', optional: true }],
    'number',
    'Smallest of its arguments.',
    {
      snippet: 'min(${1:a}, ${2:b})',
    },
  ),
  fn('abs', 'Math & Logic', [{ name: 'num' }], 'number', 'Absolute value.'),
  fn('floor', 'Math & Logic', [{ name: 'num' }], 'number', 'Largest integer below the value.'),
  fn('ceiling', 'Math & Logic', [{ name: 'num' }], 'number', 'Smallest integer above the value.'),
  fn('sqrt', 'Math & Logic', [{ name: 'num' }], 'number', 'Square root.'),
  fn('exp', 'Math & Logic', [{ name: 'num' }], 'number', 'e raised to the given power.'),
  fn('log', 'Math & Logic', [{ name: 'num' }], 'number', 'Natural logarithm.'),
  fn('log10', 'Math & Logic', [{ name: 'num' }], 'number', 'Base-10 logarithm.'),
  fn('random', 'Math & Logic', [], 'number', 'Random number between 0 and 1.'),

  // Strings (PRD §4.2)
  fn(
    'regex',
    'Strings',
    [{ name: 'field' }, { name: 'pattern' }],
    'boolean',
    'True when the value matches the regular expression.',
  ),
  fn(
    'string-length',
    'Strings',
    [{ name: 'field' }],
    'number',
    'Number of characters in the value.',
  ),
  fn(
    'substr',
    'Strings',
    [{ name: 'field' }, { name: 'start' }, { name: 'end', optional: true }],
    'string',
    'Substring from the start index (1-based) to the optional end index.',
  ),
  fn(
    'concat',
    'Strings',
    [{ name: 'a' }, { name: 'b', optional: true }],
    'string',
    'Concatenates its arguments.',
    { snippet: 'concat(${1:a}, ${2:b})' },
  ),
  fn(
    'normalize-space',
    'Strings',
    [{ name: 'field' }],
    'string',
    'Trims and collapses whitespace.',
  ),
  fn(
    'contains',
    'Strings',
    [{ name: 'field' }, { name: 'value' }],
    'boolean',
    'True when the field contains the value.',
  ),
  fn(
    'starts-with',
    'Strings',
    [{ name: 'field' }, { name: 'value' }],
    'boolean',
    'True when the field starts with the value.',
  ),
  fn(
    'ends-with',
    'Strings',
    [{ name: 'field' }, { name: 'value' }],
    'boolean',
    'True when the field ends with the value.',
  ),
  fn(
    'translate',
    'Strings',
    [{ name: 'field' }, { name: 'from' }, { name: 'to' }],
    'string',
    'Replaces characters found in `from` with the matching character in `to`.',
  ),
  fn(
    'substring-before',
    'Strings',
    [{ name: 'field' }, { name: 'value' }],
    'string',
    'Text before the first occurrence of the value.',
  ),
  fn(
    'substring-after',
    'Strings',
    [{ name: 'field' }, { name: 'value' }],
    'string',
    'Text after the first occurrence of the value.',
  ),
  fn(
    'join',
    'Strings',
    [{ name: 'separator' }, { name: 'field' }],
    'string',
    'Joins selected choice names with a separator.',
  ),

  // Repeats & Groups (PRD §4.2)
  fn(
    'count',
    'Repeats & Groups',
    [{ name: 'nodeset' }],
    'number',
    'Number of nodes in a repeat or nodeset.',
    {
      docsUrl: SPEC,
    },
  ),
  fn('sum', 'Repeats & Groups', [{ name: 'nodeset' }], 'number', 'Sum of the values in a repeat.', {
    docsUrl: SPEC,
  }),
  fn(
    'position',
    'Repeats & Groups',
    [{ name: 'node', optional: true }],
    'number',
    'Position of the context node in a repeat.',
    {
      snippet: 'position(..)',
      docsUrl: SPEC,
    },
  ),
  fn(
    'indexed-repeat',
    'Repeats & Groups',
    [{ name: 'field' }, { name: 'group' }, { name: 'index' }],
    'any',
    'Reads a field from a specific repeat instance.',
  ),
  fn(
    'once',
    'Repeats & Groups',
    [{ name: 'expr' }],
    'any',
    'Evaluates the expression only once per form instance.',
  ),
  fn(
    'instance',
    'Repeats & Groups',
    [{ name: 'id' }],
    'nodeset',
    'Loads an external instance by id.',
    { docsUrl: SPEC },
  ),
  fn('current', 'Repeats & Groups', [], 'nodeset', 'The current context node.', {
    snippet: 'current()',
    docsUrl: SPEC,
  }),
  fn(
    'jr:itext',
    'Repeats & Groups',
    [{ name: 'id' }],
    'string',
    'Looks up a translation by itext id.',
    {
      docsUrl: DOCS,
    },
  ),
  fn(
    'pulldata',
    'Repeats & Groups',
    [{ name: 'csv' }, { name: 'column' }, { name: 'filterColumn' }, { name: 'filterValue' }],
    'any',
    'Looks up a value in an attached CSV file.',
  ),

  // Dates (PRD §4.2)
  fn('today', 'Dates', [], 'date', 'Current date.'),
  fn('now', 'Dates', [], 'dateTime', 'Current date and time.'),
  fn(
    'decimal-date-time',
    'Dates',
    [{ name: 'field' }],
    'number',
    'Converts a date or date-time to a decimal number of days since 1970-01-01.',
  ),
  fn(
    'format-date',
    'Dates',
    [{ name: 'field' }, { name: 'format', description: "e.g. '%Y-%m-%d'" }],
    'string',
    'Formats a date value.',
    { snippet: "format-date(${1:field}, '${2:%Y-%m-%d}')" },
  ),
  fn('date', 'Dates', [{ name: 'value' }], 'date', 'Converts a value to a date.', {
    docsUrl: SPEC,
  }),
  fn('date-time', 'Dates', [{ name: 'value' }], 'dateTime', 'Converts a value to a date-time.', {
    docsUrl: SPEC,
  }),
  fn(
    'format-date-time',
    'Dates',
    [{ name: 'value' }, { name: 'format' }],
    'string',
    'Formats a date-time value.',
    { snippet: "format-date-time(${1:value}, '${2:%Y-%m-%dT%H:%M:%S}')" },
  ),
  fn(
    'decimal-time',
    'Dates',
    [{ name: 'value' }],
    'number',
    'Converts a time to a decimal fraction of a day.',
    {
      docsUrl: SPEC,
    },
  ),

  // Other
  fn('uuid', 'Other', [], 'string', 'Generates a random UUID.', { docsUrl: SPEC }),
  fn(
    'digest',
    'Other',
    [{ name: 'value' }, { name: 'algorithm' }],
    'string',
    "Hashes a value, e.g. 'MD5' or 'SHA-1'.",
    {
      snippet: "digest(${1:value}, '${2:MD5}')",
      docsUrl: SPEC,
    },
  ),
  fn('area', 'Other', [{ name: 'geoshape' }], 'number', 'Area of a geoshape in square meters.', {
    docsUrl: SPEC,
  }),
  fn(
    'distance',
    'Other',
    [{ name: 'from' }, { name: 'to' }],
    'number',
    'Distance between two geopoints in meters.',
    { docsUrl: SPEC },
  ),
  fn('version', 'Other', [], 'string', 'Version of the XForms client.', {
    snippet: 'version()',
    docsUrl: SPEC,
  }),
  fn('jr:version', 'Other', [], 'string', 'Version of the form definition.', {
    snippet: 'jr:version()',
    docsUrl: SPEC,
  }),
];

export const XPATH_FUNCTION_MAP: ReadonlyMap<string, XPathFunction> = new Map(
  XPATH_FUNCTIONS.map((entry) => [entry.name, entry]),
);

export const FUNCTION_CATEGORIES: readonly FunctionCategory[] = [
  'Selection',
  'Math & Logic',
  'Strings',
  'Repeats & Groups',
  'Dates',
  'Other',
];

export function findFunction(name: string): XPathFunction | undefined {
  return XPATH_FUNCTION_MAP.get(name);
}

/** Functions from the PRD §4.2 table, used by the catalog completeness test. */
export const PRD_FUNCTION_NAMES: readonly string[] = [
  'selected',
  'count-selected',
  'selected-at',
  'jr:choice-name',
  'round',
  'int',
  'pow',
  'coalesce',
  'if',
  'not',
  'regex',
  'string-length',
  'substr',
  'concat',
  'normalize-space',
  'count',
  'position',
  'indexed-repeat',
  'sum',
  'today',
  'now',
  'decimal-date-time',
  'format-date',
];
