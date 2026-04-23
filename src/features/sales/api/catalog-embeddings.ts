/**
 * Catalog semantic-search bindings.
 *
 * Phase 3 Sprint 1 consolidation: catalog embeddings live in `cortex.memory`
 * with `source_type='catalog'` and `source_id=package_id`. The legacy
 * `public.catalog_embeddings` table was dropped in migration
 * 20260517000200 — this module now routes all reads and writes through the
 * unified Aion embedding pipeline (src/app/api/aion/lib/embeddings.ts).
 *
 * Public API kept stable so existing callers (palette, rider-parser,
 * proposal-builder-studio, package-actions) don't need signature changes.
 *
 * @module features/sales/api/catalog-embeddings
 */

'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import {
  buildContextHeader,
  deleteEmbedding,
  searchMemory,
  upsertEmbedding,
  upsertEmbeddingBatch,
  type EmbedItem,
  type UpsertOutcome,
} from '@/app/api/aion/lib/embeddings';

// ── Content-text builder ─────────────────────────────────────────────────────

/**
 * Build the body text that gets embedded for a catalog package. Header
 * (package name + category prose) is generated separately via
 * `buildContextHeader('catalog', …)`.
 */
function buildContentText(pkg: {
  name: string;
  description?: string | null;
  category: string;
  tags?: { label: string }[];
}): string {
  const parts = [
    pkg.name,
    pkg.description ?? '',
    `Category: ${pkg.category.replace(/_/g, ' ')}`,
    ...(pkg.tags ?? []).map((t) => t.label),
  ];
  return parts.filter(Boolean).join(' ').trim();
}

type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
};

type PackageTagRow = {
  package_id: string;
  workspace_tags: { label: string } | { label: string }[] | null;
};

function tagsForPackage(tagRows: PackageTagRow[], packageId: string): { label: string }[] {
  return tagRows
    .filter((r) => r.package_id === packageId)
    .map((r) => {
      const wt = r.workspace_tags;
      if (Array.isArray(wt)) return wt[0]?.label;
      return wt?.label;
    })
    .filter(Boolean)
    .map((label) => ({ label: label as string }));
}

// ── Single-package upsert (live-write path) ──────────────────────────────────

/**
 * Embed a single catalog package and upsert into cortex.memory. Called from
 * package-actions.ts on create/update. Fire-and-forget at the call site, but
 * the returned UpsertOutcome lets the caller observe failures (S0-1 fix
 * applies here too).
 */
export async function generateAndUpsertEmbedding(
  workspaceId: string,
  packageId: string,
): Promise<UpsertOutcome> {
  try {
    const supabase = await createClient();

    const { data: pkg } = await supabase
      .from('packages')
      .select('id, name, description, category')
      .eq('id', packageId)
      .single();

    if (!pkg) {
      return { status: 'skipped', reason: 'empty_content' };
    }
    const typed = pkg as PackageRow;

    const { data: tagRows } = await supabase
      .from('package_tags')
      .select('package_id, workspace_tags(label)')
      .eq('package_id', packageId);

    const tags = tagsForPackage((tagRows ?? []) as PackageTagRow[], packageId);
    const contentText = buildContentText({ ...typed, tags });
    const header = buildContextHeader('catalog', {
      packageName: typed.name,
      packageCategory: typed.category,
    });

    return await upsertEmbedding(
      workspaceId,
      'catalog',
      packageId,
      contentText,
      header,
    );
  } catch (err) {
    console.error(
      `[catalog-embeddings] Failed to generate embedding for package ${packageId}:`,
      err,
    );
    Sentry.captureException(err, { tags: { module: 'catalog', action: 'generateEmbedding' } });
    return { status: 'failed', stage: 'embed', message: err instanceof Error ? err.message : String(err) };
  }
}

// ── Bulk backfill (admin-triggered) ──────────────────────────────────────────

/**
 * Backfill embeddings for all active packages in a workspace via a single
 * batched embedMany call (vs the old 50-ms-spaced single-call loop). Returns
 * counters compatible with the previous API shape so /catalog admin UI keeps
 * rendering its progress line.
 */
export async function backfillWorkspaceEmbeddings(
  workspaceId: string,
): Promise<{ processed: number; errors: number }> {
  const supabase = await createClient();

  const { data: pkgs } = await supabase
    .from('packages')
    .select('id, name, description, category')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  const packages = (pkgs ?? []) as PackageRow[];
  if (packages.length === 0) return { processed: 0, errors: 0 };

  const { data: tagRows } = await supabase
    .from('package_tags')
    .select('package_id, workspace_tags(label)')
    .in('package_id', packages.map((p) => p.id));
  const typedTagRows = (tagRows ?? []) as PackageTagRow[];

  const items: EmbedItem[] = packages.map((pkg) => {
    const tags = tagsForPackage(typedTagRows, pkg.id);
    return {
      workspaceId,
      sourceType: 'catalog',
      sourceId: pkg.id,
      contentText: buildContentText({ ...pkg, tags }),
      contextHeader: buildContextHeader('catalog', {
        packageName: pkg.name,
        packageCategory: pkg.category,
      }),
    };
  });

  const outcomes = await upsertEmbeddingBatch(items);

  let processed = 0;
  let errors = 0;
  for (const outcome of outcomes) {
    if (outcome.status === 'inserted') processed++;
    else if (outcome.status === 'failed') errors++;
    // 'skipped' (empty content) counts as neither — package had no embeddable text.
  }
  return { processed, errors };
}

// ── Semantic search (read path) ──────────────────────────────────────────────

/**
 * Perform semantic search against catalog embeddings in cortex.memory.
 * Signature preserved for palette / rider-parser / proposal-builder-studio.
 */
export async function semanticSearchCatalog(
  workspaceId: string,
  query: string,
  limit: number = 10,
): Promise<{ packageId: string; similarity: number }[]> {
  try {
    const results = await searchMemory(workspaceId, query, {
      sourceTypes: ['catalog'],
      limit,
      threshold: 0.3,
    });

    return results.map((r) => ({ packageId: r.sourceId, similarity: r.similarity }));
  } catch (err) {
    console.error('[catalog-embeddings] Semantic search failed:', err);
    Sentry.captureException(err, { tags: { module: 'catalog', action: 'semanticSearch' } });
    return [];
  }
}

// ── Delete (hard removal on package delete) ─────────────────────────────────

/**
 * Remove catalog embeddings for given package ids. Called by catalog-delete
 * after hard-deleting packages. Safe to invoke on ids that never had
 * embeddings — `deleteEmbedding` is idempotent.
 */
export async function deleteCatalogEmbeddings(packageIds: string[]): Promise<void> {
  await Promise.all(packageIds.map((id) => deleteEmbedding('catalog', id)));
}
