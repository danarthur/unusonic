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

const cmd = `npx supabase gen types typescript --project-id ${projectRef} --schema public,directory,cortex,ops,finance,aion`;

// Forward loaded env vars (esp. SUPABASE_ACCESS_TOKEN from .env.local) to the
// supabase CLI child process. Without this, the CLI sees only process.env and
// fails with "Unauthorized" even when .env.local has a valid token. Fixed
// 2026-04-11 as part of rescan §6.0 (PR 6.5).
const generated = execSync(cmd, { encoding: 'utf-8', cwd: root, env: envVars });

// Auto-append convenience aliases so callers don't have to re-add them after
// every regen. Previously this was a manual step documented in CLAUDE.md;
// automating it here removes the entire failure mode (PR 11a, 2026-04-11).
const conveniences = `
// =============================================================================
// Convenience aliases — auto-appended by scripts/gen-db-types.js.
// If you regenerate manually via \`supabase gen types ...\`, the aliases will
// be missing. Use \`npm run db:types\` to ensure they're present.
//
// These stay in \`public\` schema because the backing tables are grandfathered
// in public per the CLAUDE.md Legacy & Grandfathered Tables section. They
// will migrate to \`finance\` in a future project.
// =============================================================================

export type Proposal = Database['public']['Tables']['proposals']['Row'];
export type ProposalItem = Database['public']['Tables']['proposal_items']['Row'];
export type Package = Database['public']['Tables']['packages']['Row'];
export type CueType = Database['public']['Enums']['cue_type'];
export type PaymentMethod = Database['public']['Enums']['payment_method'];
`;

fs.writeFileSync(outFile, generated + conveniences, 'utf8');
console.log('Wrote src/types/supabase.ts (with convenience aliases appended)');
