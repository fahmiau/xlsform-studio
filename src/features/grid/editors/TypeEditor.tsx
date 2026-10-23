/**
 * `type` column editor (Task 3.1). Two steps: fuzzy question type, then a
 * choice list (existing lists, new list from the question name, `or_other`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import type { ProvideEditorComponent } from '@glideapps/glide-data-grid';

import { findColumnKey } from '@/core/indexes/columns';
import { resolveColumn } from '@/core/model/columns';
import { parseType } from '@/core/model/parseType';
import { QUESTION_TYPES, type QuestionCategory } from '@/core/model/questionTypes';
import { suggestListName } from '@/core/ops/choices';
import { slugify } from '@/core/slug/slugify';
import { useDerivedStore } from '@/state/derivedStore';
import { usePrefsStore } from '@/state/prefsStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { makeEnumCell, type EnumCell } from '../cells/EnumCell';
import { filterByFuzzy } from './fuzzy';

type EditorProps = Parameters<ProvideEditorComponent<EnumCell>>[0];

const TYPE_HINTS: Record<string, string> = {
  integer: 'Whole number',
  decimal: 'Decimal number',
  range: 'Slider between two values',
  text: 'Free text',
  select_one: 'Pick one choice',
  select_multiple: 'Pick multiple choices',
  select_one_from_file: 'Choices from a CSV file',
  rank: 'Rank a set of choices',
  note: 'Read-only message',
  geopoint: 'Capture one GPS point',
  geotrace: 'Draw a line',
  geoshape: 'Draw a polygon',
  date: 'Calendar date',
  time: 'Clock time',
  dateTime: 'Date and time',
  image: 'Photo capture',
  audio: 'Audio recording',
  video: 'Video recording',
  file: 'File attachment',
  barcode: 'Scan a barcode',
  acknowledge: 'Consent checkbox',
  calculate: 'Computed value',
  hidden: 'Hidden value',
  begin_group: 'Start a group',
  end_group: 'End a group',
  begin_repeat: 'Start a repeat',
  end_repeat: 'End a repeat',
  start: 'Form start time',
  end: 'Form end time',
  today: 'Today’s date',
  deviceid: 'Device identifier',
  phonenumber: 'Phone number',
  username: 'Username',
  email: 'Email address',
  audit: 'Audit log',
};

const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  input: 'Input',
  select: 'Choice',
  structural: 'Structure',
  metadata: 'Metadata',
};

const SELECT_BASES = new Set(['select_one', 'select_multiple', 'rank']);

interface ListOption {
  name: string;
  count: number;
  labels: string[];
}

function labelKeyForSurvey(): string | undefined {
  const sheet = useWorkbookStore.getState().data.survey;
  const labels = sheet.columns.filter((column) => resolveColumn(column).base === 'label');
  return labels.find((column) => !resolveColumn(column).language) ?? labels[0];
}

function listOptions(): ListOption[] {
  const byList = useDerivedStore.getState().indexes.choices.byList;
  const labelKey = labelKeyForSurvey();
  return Object.entries(byList)
    .map(([name, rows]) => ({
      name,
      count: rows.length,
      labels: rows
        .slice(0, 3)
        .map((row) => (labelKey ? (row.cells[labelKey] ?? '') : ''))
        .filter(Boolean),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function TypeEditor({ value, onChange, onFinishedEditing, forceEditMode }: EditorProps) {
  const parsed = useMemo(() => parseType(value.data.value), [value.data.value]);
  const [step, setStep] = useState<'type' | 'list'>(() =>
    SELECT_BASES.has(parsed.base) && parsed.listName ? 'list' : 'type',
  );
  const [pendingBase, setPendingBase] = useState(SELECT_BASES.has(parsed.base) ? parsed.base : '');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [orOther, setOrOther] = useState(parsed.orOther === true);
  const inputRef = useRef<HTMLInputElement>(null);

  const types = useMemo(
    () =>
      filterByFuzzy(
        query,
        QUESTION_TYPES,
        (type) => `${type.name} ${TYPE_HINTS[type.name] ?? ''} ${CATEGORY_LABEL[type.category]}`,
      ),
    [query],
  );

  const lists = useMemo(() => listOptions(), []);
  const visibleLists = useMemo(
    () => filterByFuzzy(query, lists, (option) => `${option.name} ${option.labels.join(' ')}`),
    [lists, query],
  );

  const canCreate = step === 'list';
  const itemCount = step === 'type' ? types.length : visibleLists.length + (canCreate ? 1 : 0);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [step]);

  function finish(nextValue: string, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) {
    const cell = makeEnumCell({
      ...value.data,
      value: nextValue,
      choiceCount: undefined,
      baseType: parseType(nextValue).base,
    });
    onChange(cell);
    onFinishedEditing(cell, movement);
  }

  function commitType(typeName: string, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) {
    if (SELECT_BASES.has(typeName)) {
      setPendingBase(typeName);
      setQuery('');
      setActiveIndex(0);
      setStep('list');
      return;
    }
    finish(typeName, movement);
  }

  function questionBasis(): string {
    const data = useWorkbookStore.getState().data;
    const row = data.survey.rows.find((candidate) => candidate.id === value.data.rowId);
    if (!row) return 'list';
    const nameKey = findColumnKey(data.survey, 'name') ?? 'name';
    const labelKey = labelKeyForSurvey() ?? 'label';
    const name = (row.cells[nameKey] ?? '').trim();
    if (name) return name;
    return slugify(row.cells[labelKey] ?? '') || 'list';
  }

  /** Honor the Preferences `{name}` pattern and length cap (Task 5.7). */
  function suggestedListName(): string {
    const { listNamePattern, slugMaxLength } = usePrefsStore.getState();
    return suggestListName(
      useWorkbookStore.getState().data,
      value.data.rowId,
      questionBasis(),
      listNamePattern,
      slugMaxLength,
    );
  }

  function commitList(listName: string, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) {
    const name = listName || suggestedListName();
    finish(`${pendingBase} ${name}${orOther ? ' or_other' : ''}`, movement);
  }

  function createList(movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) {
    commitList(suggestedListName(), movement);
  }

  function commitActive(movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) {
    if (step === 'type') {
      const type = types[activeIndex];
      if (type) commitType(type.name, movement);
      else if (query.trim()) finish(query.trim());
      return;
    }
    const list = visibleLists[activeIndex];
    if (list) commitList(list.name);
    else if (canCreate) createList();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (itemCount === 0) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex((index) =>
        event.key === 'ArrowDown' ? (index + 1) % itemCount : (index - 1 + itemCount) % itemCount,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commitActive();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      commitActive([1, 0]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onFinishedEditing(undefined);
      return;
    }
    if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
      setActiveIndex(0);
    }
  }

  const placeholder = step === 'type' ? 'Search question types…' : 'Search or type a list name…';

  return (
    <Command
      shouldFilter={false}
      className="bg-popover text-popover-foreground w-[340px] overflow-hidden rounded-md border shadow-lg"
      data-testid="type-editor"
      loop
    >
      <div className="border-b px-2 py-1 text-[11px] font-medium">
        {step === 'type' ? 'Question type' : `${pendingBase} — choose a list`}
      </div>
      <Command.Input
        ref={inputRef}
        value={query}
        onValueChange={(value) => {
          setQuery(value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="border-b bg-transparent px-2 py-1.5 text-sm outline-none"
        data-testid="type-editor-input"
        autoFocus={forceEditMode}
      />
      <Command.List className="max-h-72 overflow-auto p-1">
        {itemCount === 0 ? (
          <div className="text-muted-foreground px-2 py-2 text-xs">
            {step === 'type'
              ? 'No matching type — press Enter to use the raw value.'
              : 'No list yet — type a name.'}
          </div>
        ) : null}

        {step === 'type'
          ? types.map((type, index) => (
              <Command.Item
                key={type.name}
                value={type.name}
                onSelect={() => commitType(type.name)}
                onMouseEnter={() => setActiveIndex(index)}
                aria-selected={index === activeIndex}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                  index === activeIndex ? 'bg-accent' : ''
                }`}
              >
                <span className="font-mono">{type.name}</span>
                <span className="text-muted-foreground truncate text-[11px]">
                  {TYPE_HINTS[type.name] ?? CATEGORY_LABEL[type.category]}
                </span>
              </Command.Item>
            ))
          : visibleLists.map((option, index) => (
              <Command.Item
                key={option.name}
                value={option.name}
                onSelect={() => commitList(option.name)}
                onMouseEnter={() => setActiveIndex(index)}
                aria-selected={index === activeIndex}
                className={`flex cursor-pointer flex-col rounded px-2 py-1 text-sm ${
                  index === activeIndex ? 'bg-accent' : ''
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono">{option.name}</span>
                  <span className="text-muted-foreground text-[11px]">{option.count} choices</span>
                </span>
                <span className="text-muted-foreground truncate text-[11px]">
                  {option.labels.join(' · ') || 'No labels yet'}
                </span>
              </Command.Item>
            ))}

        {step === 'list' && canCreate ? (
          <Command.Item
            value={`__create__${query}`}
            onSelect={() => createList()}
            onMouseEnter={() => setActiveIndex(visibleLists.length)}
            aria-selected={activeIndex === visibleLists.length}
            className={`cursor-pointer rounded px-2 py-1 text-sm ${
              activeIndex === visibleLists.length ? 'bg-accent' : ''
            }`}
            data-testid="create-list-option"
          >
            + Create new list <span className="font-mono">{suggestedListName()}</span>
          </Command.Item>
        ) : null}
      </Command.List>

      {step === 'list' ? (
        <label className="flex items-center gap-2 border-t px-2 py-1.5 text-xs">
          <input
            type="checkbox"
            checked={orOther}
            onChange={(event) => setOrOther(event.target.checked)}
            data-testid="or-other-checkbox"
          />
          Allow an “Other” choice (or_other)
        </label>
      ) : null}
    </Command>
  );
}
