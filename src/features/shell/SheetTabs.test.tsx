import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { createEmptyWorkbook } from '@/core/model/factory';
import { useDerivedStore } from '@/state/derivedStore';
import { useUiStore } from '@/state/uiStore';
import { useWorkbookStore } from '@/state/workbookStore';

import { SheetTabs } from './SheetTabs';

function loadForm() {
  const data = createEmptyWorkbook();
  data.survey.rows.push(
    { id: 's1', cells: { type: 'text', name: 'q1', label: 'One' } },
    { id: 's2', cells: { type: 'select_one yes_no', name: 'q2', label: 'Two' } },
  );
  data.choices.rows.push(
    { id: 'c1', cells: { list_name: 'yes_no', name: 'yes', label: 'Yes' } },
    { id: 'c2', cells: { list_name: 'yes_no', name: 'no', label: 'No' } },
    { id: 'c3', cells: { list_name: 'gender', name: 'f', label: 'Female' } },
  );
  useWorkbookStore.getState().load(data);
  useDerivedStore.getState().rebuild();
}

describe('SheetTabs (Tasks 2.1/2.7)', () => {
  beforeEach(() => {
    useUiStore.getState().setActiveSheet('survey');
    loadForm();
  });

  it('shows live row and list counts', () => {
    render(<SheetTabs />);
    expect(screen.getByTestId('sheet-tab-survey')).toHaveTextContent('survey (2)');
    expect(screen.getByTestId('sheet-tab-choices')).toHaveTextContent('choices (2 lists)');
    expect(screen.getByTestId('sheet-tab-settings')).toHaveTextContent('settings');
  });

  it('updates after a row is added', () => {
    render(<SheetTabs />);
    act(() => {
      useWorkbookStore.getState().apply('Add question', (data) => ({
        ...data,
        survey: {
          ...data.survey,
          rows: [...data.survey.rows, { id: 's3', cells: { type: 'text', name: 'q3' } }],
        },
      }));
    });
    expect(screen.getByTestId('sheet-tab-survey')).toHaveTextContent('survey (3)');
  });

  it('switches the active sheet', () => {
    render(<SheetTabs />);
    act(() => {
      screen.getByTestId('sheet-tab-choices').click();
    });
    expect(useUiStore.getState().activeSheet).toBe('choices');
    expect(screen.getByTestId('sheet-tab-choices')).toHaveAttribute('aria-selected', 'true');
  });
});
