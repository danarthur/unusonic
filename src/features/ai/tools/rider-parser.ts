/**
 * Aion – Technical rider parser.
 * Extracts equipment and crew requirements from pasted rider text,
 * then matches each requirement against the workspace catalog via semantic search.
 *
 * V1: text input (paste). PDF upload is a future enhancement.
 * @module features/ai/tools/rider-parser
 */

'use server';

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { semanticSearchCatalog } from '@/features/sales/api/catalog-embeddings';
import { createClient } from '@/shared/api/supabase/server';

// ---------------------------------------------------------------------------
// Schema for LLM-extracted rider requirements
// ---------------------------------------------------------------------------

const RiderRequirementSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe('Equipment or service name as stated in the rider'),
      quantity: z.number().int().min(1).describe('Quantity needed'),
      category: z
        .enum(['gear', 'crew', 'other'])
        .describe('Whether this is equipment, a crew role, or other'),
      originalText: z
        .string()
        .describe('The exact text from the rider that mentions this requirement'),
    })
  ),
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RiderMatch {
  requirement: {
    name: string;
    quantity: number;
    category: 'gear' | 'crew' | 'other';
    originalText: string;
  };
  matches: {
    packageId: string;
    packageName: string;
    price: number;
    similarity: number;
  }[];
  status: 'matched' | 'partial' | 'unmatched';
}

export interface RiderParseResult {
  requirements: RiderMatch[];
  totalMatched: number;
  totalPartial: number;
  totalUnmatched: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Main server action
// ---------------------------------------------------------------------------

const RIDER_SYSTEM = `You are an expert event production technical director. Extract all equipment, crew, and service requirements from the technical rider text provided.

For each requirement, identify:
- The specific item or role name (normalised — e.g. "SM58" not "Shure SM 58 microphone")
- The quantity needed (default to 1 if not specified)
- Whether it is gear (equipment / rentals), crew (people / roles), or other (services / misc)
- The exact text from the rider that mentions this requirement

Be thorough — include backline, monitors, front-of-house, lighting, staging, crew calls, and any ancillary requirements. Do not include hospitality or catering items.

If the input text is not a technical rider or contains no extractable requirements, return an empty items array.`;

export async function parseRiderText(
  workspaceId: string,
  riderText: string
): Promise<RiderParseResult> {
  const trimmed = riderText?.trim();
  if (!trimmed) {
    return {
      requirements: [],
      totalMatched: 0,
      totalPartial: 0,
      totalUnmatched: 0,
      error: 'No rider text provided.',
    };
  }

  try {
    // Step 1: Extract structured requirements via LLM
    const { object: extracted } = await generateObject({
      model: openai('gpt-4o'),
      schema: RiderRequirementSchema,
      system: RIDER_SYSTEM,
      prompt: trimmed,
    });

    if (extracted.items.length === 0) {
      return {
        requirements: [],
        totalMatched: 0,
        totalPartial: 0,
        totalUnmatched: 0,
      };
    }

    // Step 2: Match each requirement against catalog via semantic search
    const supabase = await createClient();
    const requirements: RiderMatch[] = [];

    for (const item of extracted.items) {
      // Build a search query that hints at the category for better embedding matches
      const categoryHint =
        item.category === 'crew' ? 'crew role labor technician' : 'equipment rental gear';
      const searchQuery = `${item.name} ${categoryHint}`;

      const searchResults = await semanticSearchCatalog(workspaceId, searchQuery, 5);

      const matches: RiderMatch['matches'] = [];

      if (searchResults.length > 0) {
        const { data: pkgs } = await supabase
          .from('packages')
          .select('id, name, price')
          .in(
            'id',
            searchResults.map((r) => r.packageId)
          );

        for (const result of searchResults) {
          const pkg = (pkgs ?? []).find((p) => p.id === result.packageId);
          if (pkg) {
            matches.push({
              packageId: pkg.id,
              packageName: pkg.name,
              price: Number(pkg.price),
              similarity: result.similarity,
            });
          }
        }
      }

      // Determine match quality
      const bestSimilarity = matches.length > 0 ? matches[0].similarity : 0;
      const status: RiderMatch['status'] =
        bestSimilarity > 0.6 ? 'matched' : bestSimilarity > 0.4 ? 'partial' : 'unmatched';

      requirements.push({
        requirement: item,
        matches,
        status,
      });
    }

    return {
      requirements,
      totalMatched: requirements.filter((r) => r.status === 'matched').length,
      totalPartial: requirements.filter((r) => r.status === 'partial').length,
      totalUnmatched: requirements.filter((r) => r.status === 'unmatched').length,
    };
  } catch (err) {
    console.error('[rider-parser] Failed:', err);
    const message =
      err instanceof Error && err.message.includes('rate')
        ? 'Rate limit reached — please wait a moment and try again.'
        : 'Failed to parse rider text.';
    return {
      requirements: [],
      totalMatched: 0,
      totalPartial: 0,
      totalUnmatched: 0,
      error: message,
    };
  }
}
