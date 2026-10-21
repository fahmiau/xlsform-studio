#!/usr/bin/env node
/**
 * Fail a build when a produced binary exceeds the size budget (master plan §5:
 * 15 MB for the main executable).
 *
 * Usage: node scripts/check-binary-size.mjs <path> [limit-mb]
 */
import { statSync } from 'node:fs';

const [file, limitArg = '15'] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/check-binary-size.mjs <path> [limit-mb]');
  process.exit(2);
}

let size;
try {
  size = statSync(file).size;
} catch (error) {
  console.error(`binary not found: ${file}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const limit = Number(limitArg);
if (!Number.isFinite(limit) || limit <= 0) {
  console.error(`invalid limit: ${limitArg}`);
  process.exit(2);
}

const megabytes = size / (1024 * 1024);
console.log(`${file}: ${megabytes.toFixed(2)} MB (limit ${limit} MB)`);

if (megabytes > limit) {
  console.error(`Binary size budget exceeded: ${megabytes.toFixed(2)} MB > ${limit} MB.`);
  process.exit(1);
}
