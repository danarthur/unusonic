/**
 * Catalog embeddings — semantic search via OpenAI text-embedding-3-small.
 * Generates embeddings on package create/update and searches via match_catalog RPC.
 * @module features/sales/api/catalog-embeddings
 */

'use server';

import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createClient } from '@/shared/api/supabase/server';

/**
 * Build content text for embedding from a package's fields.
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

/**
 * Generate an embedding for a single package and upsert into catalog_embeddings.
 * Fire-and-forget — does not throw on failure (logs to console).
 */
export async function generateAndUpsertEmbedding(
  workspaceId: string,
  packageId: string
): Promise<void> {
  try {
    const supabase = await createClient();

    // Fetch package
    const { data: pkg } = await supabase
      .from('packages')
      .select('id, name, description, category')
      .eq('id', packageId)
      .single();

    if (!pkg) return;

    // Fetch tags
    const { data: tagRows } = await supabase
      .from('package_tags')
      .select('workspace_tags(label)')
      .eq('package_id', packageId);

    const tags = (tagRows ?? [])
      .map((r: Record<string, unknown>) => {
        const wt = r.workspace_tags as
          | { label: string }
          | { label: string }[]
          | null;
        if (Array.isArray(wt)) return wt[0]?.label;
        return wt?.label;
      })
      .filter(Boolean)
      .map((label) => ({ label: label as string }));

    const contentText = buildContentText({ ...pkg, tags });

    // Generate embedding
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: contentText,
    });

    // Store as string representation for the vector column
    const embeddingStr = `[${embedding.join(',')}]`;

    await supabase
      .from('catalog_embeddings')
      .upsert(
        {
          workspace_id: workspaceId,
          package_id: packageId,
          content_text: contentText,
          embedding: embeddingStr,
        },
        { onConflict: 'workspace_id,package_id' }
      );
  } catch (err) {
    console.error(
      `[catalog-embeddings] Failed to generate embedding for package ${packageId}:`,
      err
    );
  }
}

/**
 * Backfill embeddings for all active packages in a workspace.
 * Rate-limited to avoid OpenAI throttling.
 */
export async function backfillWorkspaceEmbeddings(
  workspaceId: string
): Promise<{ processed: number; errors: number }> {
  const supabase = await createClient();

  const { data: pkgs } = await supabase
    .from('packages')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  let processed = 0;
  let errors = 0;

  for (const pkg of pkgs ?? []) {
    try {
      await generateAndUpsertEmbedding(workspaceId, pkg.id);
      processed++;
    } catch {
      errors++;
    }
    // Rate limit: ~50ms between calls to stay under OpenAI limits
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return { processed, errors };
}

/**
 * Perform semantic search against catalog embeddings.
 * Returns matched package IDs with similarity scores.
 */
export async function semanticSearchCatalog(
  workspaceId: string,
  query: string,
  limit: number = 10
): Promise<{ packageId: string; similarity: number }[]> {
  try {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: query,
    });

    const embeddingStr = `[${embedding.join(',')}]`;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('match_catalog', {
      filter_workspace_id: workspaceId,
      query_embedding: embeddingStr,
      match_count: limit,
      match_threshold: 0.3,
    });

    if (error || !data) return [];

    return (data as { package_id: string; similarity: number }[]).map((r) => ({
      packageId: r.package_id,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error('[catalog-embeddings] Semantic search failed:', err);
    return [];
  }
}
