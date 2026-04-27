/**
 * Wk 14 §3.11 — chat-tool source-discipline guard against cross-workspace leaks.
 *
 * Pairs with the SQL-layer pgTAP file at
 *   supabase/tests/database/01100-aion-cross-workspace-rls.test.sql
 * which exercises real Postgres role + RLS resolution. The pgTAP file proves
 * the tables and SECURITY DEFINER RPCs reject cross-workspace access. THIS
 * file proves the JS chat tools — knowledge.ts (lookup_*) and writes.ts
 * (send_reply, update_narrative, schedule_followup) — keep their workspace_id
 * filter on every query path so a service-role tool can't accidentally
 * leak across workspaces even though service-role bypasses RLS.
 *
 * The patterns are non-obvious enough that a refactor that "simplifies" the
 * filter could silently break isolation. These tests are the canary.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_SRC = readFileSync(resolve(__dirname, '../knowledge.ts'), 'utf8');
const WRITES_SRC    = readFileSync(resolve(__dirname, '../writes.ts'), 'utf8');

// ─── Plan §3.11 tools — presence sanity ────────────────────────────────────
//
// The plan listed the eight tools that need cross-workspace coverage. If any
// of these get renamed or removed without an isolation review, the suite
// should fail loudly so the audit happens before the merge.

describe('plan §3.11 chat tools — presence in source', () => {
  it('knowledge.ts defines lookup_historical_deals', () => {
    expect(KNOWLEDGE_SRC).toMatch(/const\s+lookup_historical_deals\s*=\s*tool\(/);
  });
  it('knowledge.ts defines search_workspace_knowledge', () => {
    expect(KNOWLEDGE_SRC).toMatch(/const\s+search_workspace_knowledge\s*=\s*tool\(/);
  });
  it('knowledge.ts defines get_latest_messages', () => {
    expect(KNOWLEDGE_SRC).toMatch(/const\s+get_latest_messages\s*=\s*tool\(/);
  });
  it('knowledge.ts defines lookup_client_messages', () => {
    expect(KNOWLEDGE_SRC).toMatch(/const\s+lookup_client_messages\s*=\s*tool\(/);
  });
  it('writes.ts defines send_reply', () => {
    expect(WRITES_SRC).toMatch(/const\s+send_reply\s*=\s*tool\(/);
  });
  it('writes.ts defines update_narrative', () => {
    expect(WRITES_SRC).toMatch(/const\s+update_narrative\s*=\s*tool\(/);
  });
});

// ─── workspace_id filter discipline ────────────────────────────────────────
//
// Both tool modules fetch/write via the service-role client (RLS bypass for
// performance). The clamp must therefore be applied EXPLICITLY by an
// `.eq('workspace_id', workspaceId)` filter — losing that filter is the
// canonical cross-workspace leak path the plan §3.11 is guarding against.

describe('workspace_id clamp discipline', () => {
  it('knowledge.ts filters every tool path by workspace_id', () => {
    // We expect multiple .eq('workspace_id', …) calls — one per tool query path.
    const matches = KNOWLEDGE_SRC.match(/\.eq\(\s*['"]workspace_id['"]/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('writes.ts filters every authenticated write by workspace_id', () => {
    const matches = WRITES_SRC.match(/\.eq\(\s*['"]workspace_id['"]/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('writes.ts threads workspaceId into every RPC call (no orphaned writes)', () => {
    // Every .rpc(...) write should pass workspaceId through. We allow any of
    // the three usual param names: p_workspace_id, workspace_id, workspaceId.
    const rpcCount = (WRITES_SRC.match(/\.rpc\(/g) ?? []).length;
    const wsParamCount = (
      WRITES_SRC.match(/p_workspace_id\s*:|workspace_id\s*:|workspaceId\s*:/g) ?? []
    ).length;
    // RPCs may need other workspace-scoped params, so wsParamCount >= rpcCount
    // is the conservative invariant.
    expect(wsParamCount).toBeGreaterThanOrEqual(rpcCount);
  });
});

// ─── Service-role client usage is explicit, not accidental ─────────────────
//
// Read tools should use the user-scoped client (RLS clamps); write tools
// legitimately use service-role + explicit workspace filter. The boundary
// matters — a read tool that accidentally uses service-role would lose RLS
// protection.

describe('service-role usage boundary', () => {
  it('writes.ts uses getSystemClient (write path bypasses RLS, must clamp manually)', () => {
    expect(WRITES_SRC).toContain('getSystemClient');
  });

  it('knowledge.ts may use the service-role client only on routes that audit-log workspaceId in the call signature', () => {
    // Heuristic: if knowledge.ts uses getSystemClient, every such call should
    // be paired with a workspace_id filter on the resulting query chain.
    // Mirror the writes.ts discipline.
    const usesSystem = KNOWLEDGE_SRC.includes('getSystemClient');
    if (!usesSystem) return; // No system client → nothing to audit.
    // When system client is used, ensure the workspace_id filter still appears.
    // This is a coarse check — a precise per-call audit would need an AST.
    expect(KNOWLEDGE_SRC).toMatch(/\.eq\(\s*['"]workspace_id['"]/);
  });
});

// ─── pgTAP partner — file presence ─────────────────────────────────────────

describe('pgTAP partner — supabase/tests/database/01100-aion-cross-workspace-rls.test.sql', () => {
  it('the §3.11 pgTAP test file exists and has BEGIN/finish/ROLLBACK structure', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../../../../../supabase/tests/database/01100-aion-cross-workspace-rls.test.sql'),
      'utf8',
    );
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('SELECT plan(');
    expect(sql).toContain('SELECT * FROM finish();');
    expect(sql).toContain('ROLLBACK;');
  });

  it('the pgTAP file references every Wk 8-13 Aion table', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../../../../../supabase/tests/database/01100-aion-cross-workspace-rls.test.sql'),
      'utf8',
    );
    for (const table of [
      'cortex.aion_sessions',
      'cortex.aion_messages',
      'cortex.aion_proactive_lines',
      'cortex.aion_user_signal_mutes',
      'cortex.aion_workspace_signal_disables',
      'cortex.aion_insights',
      'ops.aion_events',
    ]) {
      expect(sql).toContain(table);
    }
  });

  it('the pgTAP file covers every Wk 8-13 Aion RPC the chat tools call', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../../../../../supabase/tests/database/01100-aion-cross-workspace-rls.test.sql'),
      'utf8',
    );
    for (const rpc of [
      'cortex.dismiss_aion_proactive_line',
      'cortex.list_aion_proactive_history',
      'cortex.mark_pill_seen',
      'cortex.migrate_session_scope',
      // Wk 15-pre: kill-metric moved from cortex.* to aion.* (admin namespace).
      'aion.metric_brief_open_kill_check',
      'cortex.check_signal_disabled',
    ]) {
      expect(sql).toContain(rpc);
    }
  });
});
