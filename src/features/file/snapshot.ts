/**
 * Crash-recovery snapshot (Task 2.9). Passthrough sheets are represented by the
 * original file path: restore re-reads the file for its style handle. Never
 * contains secrets or API keys.
 */
import type { WorkbookData } from '@/core/model/types';

export const SNAPSHOT_SCHEMA_VERSION = 1;

export interface RecoverySnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  data: WorkbookData;
  filePath: string | null;
  savedAt: string;
  appVersion: string;
}

export interface SnapshotInput {
  filePath: string | null;
  savedAt?: string;
  appVersion?: string;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export function serializeSnapshot(data: WorkbookData, input: SnapshotInput): string {
  const snapshot: RecoverySnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    data,
    filePath: input.filePath,
    savedAt: input.savedAt ?? new Date().toISOString(),
    appVersion: input.appVersion ?? 'unknown',
  };
  return JSON.stringify(snapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSheet(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.columns) && Array.isArray(value.rows);
}

export function parseSnapshot(json: string): RecoverySnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SnapshotError('The recovery snapshot is not valid JSON.');
  }
  if (!isRecord(parsed)) throw new SnapshotError('The recovery snapshot is not an object.');
  if (parsed.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new SnapshotError(
      `Unsupported recovery snapshot version ${String(parsed.schemaVersion)}.`,
    );
  }
  const data = parsed.data;
  if (!isRecord(data)) throw new SnapshotError('The recovery snapshot has no workbook data.');
  if (!isSheet(data.survey) || !isSheet(data.choices) || !isSheet(data.settings)) {
    throw new SnapshotError('The recovery snapshot is missing a managed sheet.');
  }
  if (!Array.isArray(data.passthrough) || !Array.isArray(data.sheetOrder)) {
    throw new SnapshotError('The recovery snapshot has an invalid workbook shape.');
  }
  return parsed as unknown as RecoverySnapshot;
}

/** Parse a snapshot for display without claiming success. */
export function describeSnapshot(snapshot: RecoverySnapshot): string {
  const when = new Date(snapshot.savedAt);
  return Number.isNaN(when.getTime()) ? snapshot.savedAt : when.toLocaleString();
}
