/**
 * Map generated `AppError` variants to friendly copy (Task 1.10). The Rust
 * detail is appended when it adds information.
 */
import type { AppError } from '@/ipc/bindings';

function isAppError(value: unknown): value is AppError {
  return typeof value === 'object' && value !== null && 'kind' in value && 'detail' in value;
}

export function appErrorMessage(error: unknown): string {
  if (!isAppError(error)) {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  switch (error.kind) {
    case 'FileLocked':
      return 'File is open in another program (Excel?). Close it or use Save As.';
    case 'NotFound':
      return `File not found: ${error.detail}`;
    case 'InvalidPath':
      return error.detail;
    case 'Keyring':
      return `Could not access the OS credential store: ${error.detail}`;
    case 'Network':
      return `Network error: ${error.detail}`;
    case 'Provider':
      return `The AI provider returned an error: ${error.detail}`;
    case 'Io':
    default:
      return `File error: ${error.detail}`;
  }
}
