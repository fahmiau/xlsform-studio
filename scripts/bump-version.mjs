#!/usr/bin/env node
/**
 * Single-source version bump (Task 6.8).
 *
 * `package.json` holds the version; this script syncs the Tauri config, the
 * Cargo manifest, and the workspace package entry in `Cargo.lock`.
 *
 * Usage:
 *   node scripts/bump-version.mjs 1.0.0     # write
 *   node scripts/bump-version.mjs --check   # verify (also checks a v* tag)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const PACKAGE = join(root, 'package.json');
const TAURI_CONF = join(root, 'src-tauri/tauri.conf.json');
const CARGO_TOML = join(root, 'src-tauri/Cargo.toml');
const CARGO_LOCK = join(root, 'src-tauri/Cargo.lock');

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const read = (path) => readFileSync(path, 'utf8');
const write = (path, text) => writeFileSync(path, text, 'utf8');

function cargoVersion(text) {
  const section = /\[package\][\s\S]*?(?=\n\[|$)/.exec(text)?.[0] ?? '';
  return /^version = "([^"]+)"$/m.exec(section)?.[1];
}

function lockVersion(text) {
  const blocks = text.split(/(?=\[\[package\]\])/);
  const block = blocks.find((entry) => /^name = "xlsform-studio"$/m.test(entry));
  return block ? /^version = "([^"]+)"$/m.exec(block)?.[1] : undefined;
}

function setCargoVersion(text, version) {
  return text.replace(/(\[package\][\s\S]*?)(?=\n\[|$)/, (section) =>
    section.replace(/^version = "[^"]+"$/m, `version = "${version}"`),
  );
}

function setLockVersion(text, version) {
  return text
    .split(/(?=\[\[package\]\])/)
    .map((block) =>
      /^name = "xlsform-studio"$/m.test(block)
        ? block.replace(/^version = "[^"]+"$/m, `version = "${version}"`)
        : block,
    )
    .join('');
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const requested = args.find((arg) => !arg.startsWith('--'));
const packageJson = JSON.parse(read(PACKAGE));
const version = requested ?? packageJson.version;

if (!SEMVER.test(version)) {
  console.error(`invalid semver: ${version}`);
  process.exit(2);
}

const tauriJson = JSON.parse(read(TAURI_CONF));
const versions = {
  'package.json': packageJson.version,
  'src-tauri/tauri.conf.json': tauriJson.version,
  'src-tauri/Cargo.toml': cargoVersion(read(CARGO_TOML)),
  'src-tauri/Cargo.lock': lockVersion(read(CARGO_LOCK)),
};

const drifted = Object.entries(versions).filter(([, value]) => value !== version);
const tag = process.env.GITHUB_REF_NAME;
const tagMismatch = Boolean(tag?.startsWith('v')) && tag !== `v${version}`;

if (check) {
  for (const [file, value] of Object.entries(versions)) {
    console.log(`${file}: ${value ?? '(missing)'}`);
  }
  if (drifted.length > 0) {
    console.error(
      `version drift: expected ${version}; run "node scripts/bump-version.mjs ${version}"`,
    );
    process.exit(1);
  }
  if (tagMismatch) {
    console.error(`tag ${tag} does not match version v${version}`);
    process.exit(1);
  }
  console.log(`versions are in sync at ${version}`);
  process.exit(0);
}

packageJson.version = version;
write(PACKAGE, `${JSON.stringify(packageJson, null, 2)}\n`);
tauriJson.version = version;
write(TAURI_CONF, `${JSON.stringify(tauriJson, null, 2)}\n`);
write(CARGO_TOML, setCargoVersion(read(CARGO_TOML), version));
write(CARGO_LOCK, setLockVersion(read(CARGO_LOCK), version));
console.log(`set package.json, tauri.conf.json, Cargo.toml, and Cargo.lock to ${version}`);
