import { describe, expect, it } from 'vitest';

import { bracketDiagnostics, extractVarRefs, findStringLiterals, tokenize } from './tokenize';

function shape(src: string): string[] {
  return tokenize(src)
    .filter((token) => token.kind !== 'ws')
    .map((token) => `${token.kind}:${token.text}`);
}

describe('XPath tokenizer (Task 4.1)', () => {
  const cases: Array<[string, string[]]> = [
    // PRD sample and mixed expressions.
    [
      "(${respondent_age} >= 18) and selected(${marital_status}, 'married')",
      [
        'paren:(',
        'varRef:${respondent_age}',
        'op:>=',
        'number:18',
        'paren:)',
        'keywordOp:and',
        'func:selected',
        'paren:(',
        'varRef:${marital_status}',
        'comma:,',
        "string:'married'",
        'paren:)',
      ],
    ],
    ['${a}', ['varRef:${a}']],
    ['${ a }', ['varRef:${ a }']],
    ['${_} ', ['varRef:${_}']],
    ['${nama_ü}', ['varRef:${nama_ü}']],
    ['${a}${b}', ['varRef:${a}', 'varRef:${b}']],
    ['${a', ['varRef:${a']],
    ['${', ['varRef:${']],
    ['${}', ['varRef:${}']],
    ['$', ['unknown:$']],
    ['$a', ['unknown:$', 'ident:a']],

    // Strings.
    ["'x'", ["string:'x'"]],
    ['"x"', ['string:"x"']],
    ["''", ["string:''"]],
    ["'it''s'", ["string:'it''s'"]],
    ['"a""b"', ['string:"a""b"']],
    ["'${a}'", ["string:'${a}'"]],
    ["'a b'", ["string:'a b'"]],
    ["'a", ["string:'a"]],
    ['"a', ['string:"a']],
    ["'a' 'b'", ["string:'a'", "string:'b'"]],

    // Numbers.
    ['12', ['number:12']],
    ['3.5', ['number:3.5']],
    ['.5', ['number:.5']],
    ['0', ['number:0']],
    ['18', ['number:18']],
    ['12 34', ['number:12', 'number:34']],

    // Keyword operators only in operator position.
    ['and', ['ident:and']],
    ['(and)', ['paren:(', 'ident:and', 'paren:)']],
    ['${a} and ${b}', ['varRef:${a}', 'keywordOp:and', 'varRef:${b}']],
    ['${a} or ${b}', ['varRef:${a}', 'keywordOp:or', 'varRef:${b}']],
    ['${a} mod ${b}', ['varRef:${a}', 'keywordOp:mod', 'varRef:${b}']],
    ['${a} div ${b}', ['varRef:${a}', 'keywordOp:div', 'varRef:${b}']],
    ['${a}and${b}', ['varRef:${a}', 'keywordOp:and', 'varRef:${b}']],
    ['18and${b}', ['number:18', 'keywordOp:and', 'varRef:${b}']],
    ["'x'and${b}", ["string:'x'", 'keywordOp:and', 'varRef:${b}']],
    ['(${a})and${b}', ['paren:(', 'varRef:${a}', 'paren:)', 'keywordOp:and', 'varRef:${b}']],
    ['. and ${b}', ['path:.', 'keywordOp:and', 'varRef:${b}']],
    ['not(and)', ['func:not', 'paren:(', 'ident:and', 'paren:)']],

    // Functions, including hyphen and namespace spellings.
    ['selected(', ['func:selected', 'paren:(']],
    ['count-selected(${a})', ['func:count-selected', 'paren:(', 'varRef:${a}', 'paren:)']],
    [
      "jr:choice-name(${a}, 'x')",
      ['func:jr:choice-name', 'paren:(', 'varRef:${a}', 'comma:,', "string:'x'", 'paren:)'],
    ],
    [
      'selected-at(${a}, 0)',
      ['func:selected-at', 'paren:(', 'varRef:${a}', 'comma:,', 'number:0', 'paren:)'],
    ],
    ['if(', ['func:if', 'paren:(']],
    ['true()', ['func:true', 'paren:(', 'paren:)']],
    ['a-b', ['ident:a', 'op:-', 'ident:b']],
    ['foo-bar(', ['func:foo-bar', 'paren:(']],
    ['a.b', ['ident:a', 'path:.b']],
    ['foo (', ['ident:foo', 'paren:(']],
    ['count(../item)', ['func:count', 'paren:(', 'path:../item', 'paren:)']],
    [
      "selected(${a},'',)",
      ['func:selected', 'paren:(', 'varRef:${a}', 'comma:,', "string:''", 'comma:,', 'paren:)'],
    ],

    // Paths.
    ['.', ['path:.']],
    ['..', ['path:..']],
    ['../x', ['path:../x']],
    ['/data/x', ['path:/data/x']],
    ['//data/x', ['path://data/x']],
    ['@attr', ['path:@attr']],
    ['/data/x[1]', ['path:/data/x', 'punct:[', 'number:1', 'punct:]']],
    [
      "instance('x')/root/item",
      ['func:instance', 'paren:(', "string:'x'", 'paren:)', 'path:/root/item'],
    ],
    ['data/x', ['ident:data', 'path:/x']],

    // Operators.
    ['a = b', ['ident:a', 'op:=', 'ident:b']],
    ['a != b', ['ident:a', 'op:!=', 'ident:b']],
    ['a < b', ['ident:a', 'op:<', 'ident:b']],
    ['a <= b', ['ident:a', 'op:<=', 'ident:b']],
    ['a > b', ['ident:a', 'op:>', 'ident:b']],
    ['a >= b', ['ident:a', 'op:>=', 'ident:b']],
    ['a + b', ['ident:a', 'op:+', 'ident:b']],
    ['a - b', ['ident:a', 'op:-', 'ident:b']],
    ['a * b', ['ident:a', 'op:*', 'ident:b']],
    ['a | b', ['ident:a', 'op:|', 'ident:b']],
    ['-1', ['op:-', 'number:1']],
    ['a>=18and${b}', ['ident:a', 'op:>=', 'number:18', 'keywordOp:and', 'varRef:${b}']],

    // Parens, commas, punctuation and fallbacks.
    ['()', ['paren:(', 'paren:)']],
    ['(a)', ['paren:(', 'ident:a', 'paren:)']],
    ['((a))', ['paren:(', 'paren:(', 'ident:a', 'paren:)', 'paren:)']],
    ['(', ['paren:(']],
    [')', ['paren:)']],
    ['(a))', ['paren:(', 'ident:a', 'paren:)', 'paren:)']],
    ['a, b', ['ident:a', 'comma:,', 'ident:b']],
    ['[]', ['punct:[', 'punct:]']],
    ['{}', ['punct:{', 'punct:}']],
    ['a ? b', ['ident:a', 'unknown:?', 'ident:b']],
    ['a : b', ['ident:a', 'unknown::', 'ident:b']],
    ['!', ['unknown:!']],
    ['   ', []],
  ];

  it.each(cases)('tokenizes %s', (src, expected) => {
    expect(shape(src)).toEqual(expected);
  });

  it('reproduces the input exactly with no gaps', () => {
    const sources = [
      "(${a} >= 18) and selected(${b}, 'x')",
      '   ',
      '${unclosed',
      "'unclosed",
      '((a) + [1])',
      'a>=18and${b}',
    ];
    for (const src of sources) {
      expect(
        tokenize(src)
          .map((token) => token.text)
          .join(''),
      ).toBe(src);
    }
  });

  it('captures var names and inner ranges', () => {
    const [token] = tokenize('${  marital_status  }');
    expect(token).toMatchObject({
      kind: 'varRef',
      from: 0,
      to: 21,
      name: 'marital_status',
      innerFrom: 2,
      innerTo: 20,
    });
  });

  it('matches nested parens in both directions', () => {
    const tokens = tokenize('((a))');
    expect(tokens[0]?.matchIndex).toBe(4);
    expect(tokens[1]?.matchIndex).toBe(3);
    expect(tokens[3]?.matchIndex).toBe(1);
    expect(tokens[4]?.matchIndex).toBe(0);
  });

  it('marks unmatched parens', () => {
    const open = tokenize('(')[0];
    expect(open?.error).toBe('unbalanced');
    expect(open?.matchIndex).toBe(-1);
    const close = tokenize(')')[0];
    expect(close?.error).toBe('unbalanced');
    expect(close?.matchIndex).toBe(-1);
    const extra = tokenize('(a))');
    expect(extra[3]?.error).toBe('unbalanced');
    expect(extra[1]?.error).toBeUndefined();
  });

  it('marks unclosed strings and var refs', () => {
    expect(tokenize("'a")[0]?.error).toBe('unclosed-string');
    expect(tokenize('${a')[0]?.error).toBe('unclosed-var');
    expect(tokenize("'a'")[0]?.error).toBeUndefined();
  });

  it('extracts variable refs with ranges, including unclosed refs', () => {
    const src = '${a} + ${ b } + ${c';
    const refs = extractVarRefs(src);
    expect(refs.map((ref) => ref.name)).toEqual(['a', 'b', 'c']);
    expect(refs[0]).toMatchObject({ from: 0, to: 4, innerFrom: 2, innerTo: 3, closed: true });
    expect(refs[1]).toMatchObject({ from: 7, to: 13, innerFrom: 9, innerTo: 12, closed: true });
    expect(refs[2]?.closed).toBe(false);
    expect(src.slice(refs[1]!.innerFrom, refs[1]!.innerTo)).toBe(' b ');
  });

  it('finds string literals, including unclosed ones', () => {
    const literals = findStringLiterals("selected(${a}, 'x') or 'y");
    expect(literals.map((token) => token.text)).toEqual(["'x'", "'y"]);
    expect(literals[1]?.error).toBe('unclosed-string');
  });

  it('reports bracket diagnostics in source order', () => {
    const diagnostics = bracketDiagnostics(tokenize("((a and 'x') or ${b"));
    // The `(` is never closed and `${b` is unclosed.
    expect(diagnostics.map((entry) => entry.code)).toEqual(['unbalanced-paren', 'unclosed-var']);
    expect(diagnostics.every((entry) => entry.to > entry.from)).toBe(true);
  });
});
