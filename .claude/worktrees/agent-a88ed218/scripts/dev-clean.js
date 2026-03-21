#!/usr/bin/env node
/**
 * Clean dev start: free port 3000, clear .next, then start Next.js on 3000.
 * Run: npm run dev:clean
 * Use when the dev server keeps moving to 3003/3004 because old processes are still running.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = path.resolve(__dirname, '..');

function killPort(port) {
  if (process.platform === 'win32') return; // On Windows, Next will error if port in use
  try {
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, {
      stdio: 'ignore',
      shell: true,
      cwd: ROOT,
    });
  } catch {
    // Port was already free
  }
}

function rmNext() {
  const nextDir = path.join(ROOT, '.next');
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true });
    console.log('[dev:clean] Removed .next');
  }
}

killPort(PORT);
rmNext();

console.log(`[dev:clean] Starting Next.js on http://localhost:${PORT}`);
spawn('npx', ['next', 'dev', '--webpack', '-p', String(PORT)], {
  stdio: 'inherit',
  shell: true,
  cwd: ROOT,
  env: { ...process.env },
}).on('exit', (code) => process.exit(code ?? 0));
