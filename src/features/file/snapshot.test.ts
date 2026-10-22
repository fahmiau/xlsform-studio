import { describe, expect, it } from 'vitest';

import { createEmptyWorkbook, createRow } from '@/core/model/factory';

import {
  SNAPSHOT_SCHEMA_VERSION,
  describeSnapshot,
  parseSnapshot,
  serializeSnapshot,
  SnapshotError,
} from './snapshot';

function dataWithEdits() {
  const data = createEmptyWorkbook();
  data.survey.rows.push(createRow({ type: 'text', name: 'q1', label: 'One' }));
  data.choices.rows.push({
    ...createRow({ list_name: 'yes_no', name: 'yes', label: 'Yes' }),
    meta: { nameLocked: true },
  });
  data.settings.rows.push(createRow({ form_title: 'Recovered form' }));
  data.passthrough.push({ sheetName: 'external_choices' });
  return data;
}

describe('recovery snapshots (Task 2.9)', () => {
  it('round-trips data, RowMeta, path, time, and version', () => {
    const data = dataWithEdits();
    const json = serializeSnapshot(data, {
      filePath: 'C:/forms/test.xlsx',
      savedAt: '2026-10-22T12:00:00.000Z',
      appVersion: '0.1.0',
    });
    const snapshot = parseSnapshot(json);
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.data.survey.rows[0]?.cells.name).toBe('q1');
    expect(snapshot.data.choices.rows[0]?.meta?.nameLocked).toBe(true);
    expect(snapshot.data.passthrough).toEqual([{ sheetName: 'external_choices' }]);
    expect(snapshot.filePath).toBe('C:/forms/test.xlsx');
    expect(snapshot.savedAt).toBe('2026-10-22T12:00:00.000Z');
    expect(snapshot.appVersion).toBe('0.1.0');
  });

  it('defaults the timestamp and version', () => {
    const snapshot = parseSnapshot(serializeSnapshot(createEmptyWorkbook(), { filePath: null }));
    expect(Number.isNaN(new Date(snapshot.savedAt).getTime())).toBe(false);
    expect(snapshot.appVersion).toBe('unknown');
  });

  it('rejects invalid JSON', () => {
    expect(() => parseSnapshot('{nope')).toThrow(SnapshotError);
  });

  it('rejects an unsupported schema version', () => {
    expect(() => parseSnapshot(JSON.stringify({ schemaVersion: 99 }))).toThrow(
      /Unsupported recovery snapshot version/,
    );
  });

  it('rejects a missing managed sheet or workbook fields', () => {
    const snapshot = JSON.parse(serializeSnapshot(createEmptyWorkbook(), { filePath: null })) as {
      data: Record<string, unknown>;
    };
    delete snapshot.data.choices;
    expect(() => parseSnapshot(JSON.stringify(snapshot))).toThrow(/missing a managed sheet/);
  });

  it('rejects wrong workbook arrays', () => {
    const snapshot = JSON.parse(serializeSnapshot(createEmptyWorkbook(), { filePath: null })) as {
      data: Record<string, unknown>;
    };
    snapshot.data.passthrough = {};
    expect(() => parseSnapshot(JSON.stringify(snapshot))).toThrow(/invalid workbook shape/);
  });

  it('describes a timestamp for the dialog', () => {
    const snapshot = parseSnapshot(
      serializeSnapshot(createEmptyWorkbook(), {
        filePath: null,
        savedAt: '2026-10-22T12:00:00.000Z',
      }),
    );
    expect(describeSnapshot(snapshot)).not.toBe('');
  });
});
