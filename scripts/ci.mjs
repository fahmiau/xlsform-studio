#!/usr/bin/env node
/**
 * Mirror `.github/workflows/ci.yml` locally before pushing.
 *
 * Usage:
 *   pnpm verify              # run every CI gate (including Playwright E2E)
 *   pnpm verify -- --skip-e2e
 */
import { spawnSync } from 'node:child_process';
import net from 'node:net';

const args = new Set(process.argv.slice(2));
if (args.has('--help') || args.has('-h')) {
  console.log('Usage: node scripts/ci.mjs [--skip-e2e]');
  process.exit(0);
}

const skipE2e = args.has('--skip-e2e');

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(300);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function ensurePortFree(port) {
  const [v4, v6] = await Promise.all([isPortOpen('127.0.0.1', port), isPortOpen('::1', port)]);
  if (v4 || v6) {
    console.error(
      `\nPort ${port} is already in use. Stop any running \`pnpm dev\` or \`pnpm tauri dev\` server ` +
        'so Playwright tests against a cold Vite server, matching GitHub CI.',
    );
    process.exit(1);
  }
}

function runStep(label, command) {
  console.log(`\n==> ${label}`);
  console.log(`$ ${command}`);
  const start = Date.now();
  const result = spawnSync(command, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  if (result.error) {
    console.error(`FAILED (${seconds}s): ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`FAILED (${seconds}s) with exit code ${result.status ?? 1}: ${label}`);
    process.exit(result.status ?? 1);
  }
  console.log(`PASSED (${seconds}s): ${label}`);
}

const totalStart = Date.now();

runStep('Lint (TypeScript + ESLint)', 'pnpm lint');
runStep('Typecheck', 'pnpm typecheck');
runStep('Unit tests with src/core coverage gate', 'pnpm coverage');
runStep('Rust format', 'cargo fmt --manifest-path src-tauri/Cargo.toml -- --check');
runStep(
  'Rust clippy',
  'cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings',
);
runStep('Rust tests', 'cargo test --manifest-path src-tauri/Cargo.toml');
runStep('Specta bindings sync', 'pnpm bindings:check');

if (!skipE2e) {
  await ensurePortFree(1420);
  // Match GitHub runner concurrency (2 workers) and reject accidental `.only`,
  // while keeping retries at 0 locally so flakes surface instead of being masked.
  runStep(
    'Playwright smoke tests (cold server, 2 workers)',
    'pnpm exec playwright test --forbid-only --workers=2',
  );
}

runStep('Lint performance gate (<= 15 ms local / 25 ms CI)', 'pnpm bench:lint');

const totalSeconds = ((Date.now() - totalStart) / 1000).toFixed(1);
console.log(`\nAll CI checks passed in ${totalSeconds}s.`);
