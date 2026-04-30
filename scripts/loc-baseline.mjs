#!/usr/bin/env node
// Per-file LOC ratchet — companion to scripts/eslint-baseline.mjs.
//
// Why this exists:
//   The ESLint `max-lines` rule fires once per file regardless of how badly
//   the file exceeds the limit. A file at 301 LOC and the same file at 3,000
//   LOC both register as "1 max-lines warning." Once flagged, the existing
//   .eslint-baseline.json ratchet cannot detect further raw growth.
//
//   This script closes that gap. It snapshots the raw line count for every
//   file currently flagged by `max-lines` in .eslint-baseline.json, and
//   fails CI if any tracked file grew beyond its snapshot. Files not yet
//   over the limit stay gated by the existing `max-lines` warning — when
//   they cross threshold, the eslint-baseline ratchet flags them as a new
//   violation count.
//
// Usage:
//   node scripts/loc-baseline.mjs --snapshot   Snapshot current LOC for
//                                              every file flagged by
//                                              max-lines in eslint-baseline.
//   node scripts/loc-baseline.mjs --check      Fail if any tracked file's
//                                              raw LOC exceeds its snapshot.
//
// Ratchet semantics (matches scripts/eslint-baseline.mjs):
//   - Tracked set = files with a `max-lines` warning in .eslint-baseline.json.
//   - cur LOC <= snapshot LOC → pass.
//   - cur LOC > snapshot LOC → fail with diff list.
//   - File newly flagged but not in LOC snapshot → soft warning + nudge to
//     run --snapshot. Hard-fail of the new violation is already handled by
//     the eslint-baseline ratchet (which sees a new max-lines warning).
//   - File deleted or trimmed below threshold (no longer flagged) → simply
//     not tracked this run. Stale entries in .loc-baseline.json clear on
//     the next --snapshot.
//
// Philosophy: legacy oversized files may stay oversized. They cannot get
// worse. New code is gated by the existing `max-lines` rule + ratchet.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ESLINT_BASELINE = new URL("../.eslint-baseline.json", import.meta.url).pathname;
const LOC_BASELINE = new URL("../.loc-baseline.json", import.meta.url).pathname;

const mode = process.argv[2];
if (mode !== "--snapshot" && mode !== "--check") {
  console.error("Usage: loc-baseline.mjs --snapshot | --check");
  process.exit(2);
}

if (!existsSync(ESLINT_BASELINE)) {
  console.error(`Missing ${ESLINT_BASELINE}. Run npm run lint:baseline:snapshot first.`);
  process.exit(2);
}

const eslintBaseline = JSON.parse(readFileSync(ESLINT_BASELINE, "utf8"));
const trackedFiles = Object.entries(eslintBaseline.files ?? {})
  .filter(([, rules]) => rules["max-lines"])
  .map(([f]) => f)
  .sort();

function countLines(path) {
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  // Match `wc -l` semantics: count newline characters. A file with no
  // trailing newline reports one less than its visible line count, but
  // ESLint's max-lines uses the same definition, so this stays consistent.
  let n = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) n++;
  }
  return n;
}

const current = {};
for (const file of trackedFiles) {
  const loc = countLines(file);
  if (loc !== null) current[file] = loc;
}

if (mode === "--snapshot") {
  const sorted = Object.fromEntries(
    Object.entries(current).sort(([a], [b]) => a.localeCompare(b)),
  );
  const out = {
    generatedAt: new Date().toISOString(),
    note: "Per-file raw LOC snapshot for every file currently flagged by max-lines in .eslint-baseline.json. Closes the gap where max-lines fires once-per-file regardless of size, letting flagged files grow invisibly. Regenerate with: npm run loc:baseline:snapshot. Check with: npm run loc:baseline:check.",
    files: sorted,
  };
  writeFileSync(LOC_BASELINE, JSON.stringify(out, null, 2) + "\n");
  console.log(`✓ Snapshot written to .loc-baseline.json (${Object.keys(sorted).length} files tracked).`);
  process.exit(0);
}

// --check
if (!existsSync(LOC_BASELINE)) {
  console.error(`Missing ${LOC_BASELINE}. Run npm run loc:baseline:snapshot first.`);
  process.exit(2);
}

const snapshot = JSON.parse(readFileSync(LOC_BASELINE, "utf8")).files ?? {};

const grew = [];
const newlyTracked = [];
for (const file of trackedFiles) {
  const cur = current[file];
  if (cur === undefined) continue;
  const base = snapshot[file];
  if (base === undefined) {
    newlyTracked.push({ file, cur });
    continue;
  }
  if (cur > base) grew.push({ file, base, cur, delta: cur - base });
}

if (grew.length === 0 && newlyTracked.length === 0) {
  console.log(`✓ LOC ratchet OK (${trackedFiles.length} files tracked).`);
  process.exit(0);
}

if (grew.length > 0) {
  console.error("✗ LOC ratchet failed — files grew beyond snapshot:");
  for (const { file, base, cur, delta } of grew) {
    console.error(`  ${file}: ${base} → ${cur} (+${delta})`);
  }
}

if (newlyTracked.length > 0) {
  console.error(grew.length > 0 ? "" : "");
  console.error("ℹ Files newly flagged by max-lines, not yet in LOC snapshot:");
  for (const { file, cur } of newlyTracked) {
    console.error(`  ${file}: ${cur} LOC`);
  }
  console.error("  Run npm run loc:baseline:snapshot to capture them.");
}

if (grew.length > 0) {
  console.error("");
  console.error("If the growth is intentional (genuinely larger feature, not");
  console.error("drift), run:");
  console.error("  npm run loc:baseline:snapshot");
  console.error("…and commit the updated .loc-baseline.json with your change.");
  process.exit(1);
}

// newlyTracked alone is non-fatal — eslint-baseline ratchet already catches
// the new max-lines warning. Exit clean so the soft nudge doesn't break CI.
process.exit(0);
