import { describe, expect, it } from 'vitest';

import {
  QUESTION_TYPES,
  QUESTION_TYPE_MAP,
  getQuestionType,
  isMetadataType,
  isSelectType,
  isStructuralType,
  normalizeQuestionTypeName,
} from './questionTypes';

describe('question type catalog', () => {
  it('lists every PRD §4.2 type exactly once', () => {
    const names = QUESTION_TYPES.map((type) => type.name);
    expect(new Set(names).size).toBe(names.length);
    for (const required of [
      'integer',
      'decimal',
      'range',
      'text',
      'select_one',
      'select_multiple',
      'select_one_from_file',
      'rank',
      'note',
      'geopoint',
      'geotrace',
      'geoshape',
      'date',
      'time',
      'dateTime',
      'image',
      'audio',
      'video',
      'file',
      'barcode',
      'calculate',
      'acknowledge',
      'hidden',
      'begin_group',
      'end_group',
      'begin_repeat',
      'end_repeat',
      'start',
      'end',
      'today',
      'deviceid',
      'phonenumber',
      'username',
      'email',
      'audit',
    ]) {
      expect(QUESTION_TYPE_MAP.get(required), required).toBeDefined();
    }
  });

  it('marks structural rows correctly', () => {
    for (const name of ['begin_group', 'end_group', 'begin_repeat', 'end_repeat']) {
      const type = QUESTION_TYPE_MAP.get(name);
      expect(type?.category).toBe('structural');
      expect(type?.isVisible, name).toBe(name.startsWith('begin'));
    }
    expect(QUESTION_TYPE_MAP.get('end_group')?.requiresName).toBe(false);
    expect(QUESTION_TYPE_MAP.get('begin_group')?.requiresName).toBe(true);
  });

  it('marks metadata and calculated rows as invisible without a label', () => {
    for (const name of ['calculate', 'hidden', 'start', 'end', 'today', 'deviceid', 'audit']) {
      const type = QUESTION_TYPE_MAP.get(name);
      expect(type?.isVisible, name).toBe(false);
      expect(type?.hasLabel, name).toBe(false);
    }
  });

  it('requires a name for questions but not for notes or end rows', () => {
    expect(QUESTION_TYPE_MAP.get('text')?.requiresName).toBe(true);
    expect(QUESTION_TYPE_MAP.get('note')?.requiresName).toBe(false);
    expect(QUESTION_TYPE_MAP.get('end_repeat')?.requiresName).toBe(false);
  });

  it('normalizes aliases and casing', () => {
    expect(normalizeQuestionTypeName('Select One gender')).toBe('select_one');
    expect(normalizeQuestionTypeName('SELECT ALL THAT APPLY x')).toBe('select_multiple');
    expect(normalizeQuestionTypeName('Begin Group')).toBe('begin_group');
    expect(normalizeQuestionTypeName('DateTime')).toBe('dateTime');
    expect(normalizeQuestionTypeName('  ')).toBe('');
  });

  it('classifies helpers', () => {
    expect(isStructuralType('begin_repeat x')).toBe(true);
    expect(isStructuralType('text')).toBe(false);
    expect(isSelectType('select_one list')).toBe(true);
    expect(isSelectType('rank list')).toBe(true);
    expect(isSelectType('integer')).toBe(false);
    expect(isMetadataType('calculate')).toBe(true);
    expect(isMetadataType('text')).toBe(false);
    expect(getQuestionType('select_multiple l')).toBe(QUESTION_TYPE_MAP.get('select_multiple'));
    expect(getQuestionType('nope')).toBeUndefined();
  });
});
