#!/usr/bin/env node
/**
 * SHA-256 checksums for release installers (Task 6.8).
 *
 * Usage: node scripts/checksums.mjs <output-file> <directory> [more dirs...]
 *
 * Walks the bundle output recursively, hashes installers, and writes lines in
 * the classic `sha256sum` format. Skips signatures and updater metadata.
 */
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const INSTALLER_EXTENSIONS = ['.msi', '.exe', '.deb', '.rpm', '.appimage', '.dmg', '.pkg'];
const SKIP_EXTENSIONS = ['.sig', '.json', '.yml', '.yaml', '.txt'];

function extension(name) {
  const lower = name.toLowerCase();
  const index = lower.lastIndexOf('.');
  return index >= 0 ? lower.slice(index) : '';
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // macOS `.app` bundles contain the binary but are not installer files.
      if (entry.name.endsWith('.app')) continue;
      files.push(...walk(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function hashFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

const [output, ...directories] = process.argv.slice(2);
if (!output || directories.length === 0) {
  console.error('usage: node scripts/checksums.mjs <output-file> <directory> [more dirs...]');
  process.exit(2);
}

const installers = directories
  .flatMap((dir) => walk(dir))
  .filter((path) => {
    const ext = extension(path);
    if (SKIP_EXTENSIONS.includes(ext)) return false;
    return INSTALLER_EXTENSIONS.includes(ext);
  })
  .sort();

if (installers.length === 0) {
  console.error(`no installer files found under: ${directories.join(', ')}`);
  process.exit(1);
}

const lines = [];
for (const path of installers) {
  const size = statSync(path).size;
  if (size === 0) {
    console.error(`refusing to checksum an empty file: ${path}`);
    process.exit(1);
  }
  lines.push(`${await hashFile(path)}  ${basename(path)}`);
}

writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');
console.log(`wrote ${lines.length} checksum(s) to ${output}`);
for (const line of lines) console.log(`  ${line}`);
