import { describe, test } from 'vitest';

import { tokenize } from './tokenize';

const expressions = Array.from({ length: 1500 }, (_, index) => {
  switch (index % 5) {
    case 0:
      return `selected(\${q_${index + 1}}, 'choice_1')`;
    case 1:
      return `\${q_${index + 1}} >= 18 and \${q_${index + 2}} != ''`;
    case 2:
      return `coalesce(\${q_${index + 1}}, 0) + round(\${q_${index + 2}}, 2)`;
    case 3:
      return `if(count(\${grp_${index + 1}}) > 0, 'yes', 'no')`;
    default:
      return `./data/root/item[${index + 1}]/value`;
  }
});

describe('XPath tokenizer', () => {
  test('measures 1,500 expressions', async ({ bench }) => {
    await bench('1,500 expressions', () => {
      for (const expression of expressions) tokenize(expression);
    }).run();
  });
});
