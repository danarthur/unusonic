#!/usr/bin/env node
/**
 * Generate Supabase TypeScript types.
 * Reads project ref from .env.local (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_PROJECT_REF).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const envLocal = path.join(root, '.env.local');
const env = path.join(root, '.env');
const outFile = path.join(root, 'src/types/supabase.ts');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const envVars = { ...process.env, ...loadEnv(env), ...loadEnv(envLocal) };

let projectRef = envVars.SUPABASE_PROJECT_REF;
if (!projectRef && envVars.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const url = new URL(envVars.NEXT_PUBLIC_SUPABASE_URL);
    projectRef = url.hostname.split('.')[0];
  } catch (_) {
    // ignore
  }
}

if (!projectRef || projectRef.length < 10) {
  console.error('gen-db-types: Need SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL in .env.local');
  console.error('  Example: NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co');
  process.exit(1);
}

const cmd = `npx supabase gen types typescript --project-id ${projectRef} --schema public,directory,cortex,ops,finance`;
const result = execSync(cmd, { encoding: 'utf-8', cwd: root });
fs.writeFileSync(outFile, result, 'utf8');
console.log('Wrote src/types/supabase.ts');
