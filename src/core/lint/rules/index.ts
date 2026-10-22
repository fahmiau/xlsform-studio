/** All lint rules in ID order (Task 4.8/4.9). */
import type { LintRule } from '../types';

import { xls001 } from './xls001';
import { xls002 } from './xls002';
import { xls003 } from './xls003';
import { xls004 } from './xls004';
import { xls005 } from './xls005';
import { xls006 } from './xls006';
import { xls007 } from './xls007';
import { xls008 } from './xls008';
import { xls009 } from './xls009';
import { xls010 } from './xls010';
import { xls011 } from './xls011';

export const LINT_RULES: readonly LintRule[] = [
  xls001,
  xls002,
  xls003,
  xls004,
  xls005,
  xls006,
  xls007,
  xls008,
  xls009,
  xls010,
  xls011,
];
