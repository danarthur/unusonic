/**
 * ION – AI package definition generator (Guarded Garden + RAG).
 * Server actions only; schema and types live in package-generator-schema.ts.
 * @module features/ai/tools/package-generator
 */

'use server';

import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getCatalogPackagesWithTags, createPackage } from '@/features/sales/api/package-actions';
import {
  packageDefinitionSchema,
  type PackageDefinitionGenerated,
  type CatalogItemForION,
  type GetCatalogForIONResult,
  type GeneratePackageDefinitionResult,
  type CreatePackageWithIONResult,
} from '@/features/ai/tools/package-generator-schema';

const ION_SYSTEM = `You are ION, an AI that builds package definitions for an event-production catalog. You output strict JSON matching the given schema.

Block types you can use (catalog only — no signatures; those belong on the deal/proposal):
- header_hero: Package image and title. content: { image?: string, title?: string }
- text_block: Plain text (description, package-specific terms). content: string
- line_item_group: A group of line items (services/rentals). label: string, items: string[] — use REAL catalog item UUIDs from the context when the user asks for specific offerings (e.g. "photography" → use the Photography package id from catalog). If no match, use a short display label.

Rules:
1. Use the catalog context below. When the user mentions a service or product (e.g. "full-day photography", "3-piece band"), find the matching catalog item by name/description and put its id in line_item_group items. Only use UUIDs that appear in the catalog list.
2. Generate unique block ids like b1, b2, b3.
3. Prefer one header_hero at the start, then line_item_groups and text_blocks as needed. Do not add signature_block (signing belongs on the deal/proposal, not the catalog package).
4. Keep blocks ordered logically (package image → description/terms → line item groups).
5. staffing: set only if the package is a service that requires a role (e.g. DJ, Photographer). Otherwise omit or null.`;

/** Fetch workspace catalog for ION to use real IDs in line_item_group items. */
export async function getCatalogForION(
  workspaceId: string
): Promise<GetCatalogForIONResult> {
  const { packages, error } = await getCatalogPackagesWithTags(workspaceId);
  if (error) {
    return { items: [], error };
  }
  const items: CatalogItemForION[] = (packages ?? [])
    .filter((p) => p.is_active !== false)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      category: p.category,
      price: Number(p.price),
    }));
  return { items };
}

/** Generate a PackageDefinition from a natural-language prompt using catalog context (RAG). */
export async function generatePackageDefinition(
  workspaceId: string,
  userPrompt: string
): Promise<GeneratePackageDefinitionResult> {
  const trimmed = userPrompt?.trim();
  if (!trimmed) {
    return { definition: null, error: 'Describe the package you want.' };
  }

  const { items } = await getCatalogForION(workspaceId);
  const catalogContext =
    items.length > 0
      ? `Catalog (use these ids in line_item_group.items when relevant):\n${items
          .map(
            (i) =>
              `- id: ${i.id} | name: ${i.name} | category: ${i.category} | price: ${i.price}${i.description ? ` | ${i.description.slice(0, 80)}` : ''}`
          )
          .join('\n')}`
      : 'No catalog items in this workspace yet. Use short display labels in line_item_group items.';

  const systemPrompt = `${ION_SYSTEM}\n\n${catalogContext}`;

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o'),
      schema: packageDefinitionSchema,
      system: systemPrompt,
      prompt: trimmed,
    });

    return { definition: object as PackageDefinitionGenerated };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ION could not generate the package.';
    return { definition: null, error: message };
  }
}

// —— Catalog page: create new package from ION (name + price + definition) ——

const ionFullPackageSchema = z.object({
  suggestedName: z.string().describe('Short package name for the catalog, e.g. "Luxury Wedding Package"'),
  suggestedPrice: z.number().min(0).describe('Total package price in dollars (number)'),
  definition: packageDefinitionSchema,
});

const ION_FULL_SYSTEM = `${ION_SYSTEM}

Additionally you must output:
- suggestedName: A clear, short name for this package (e.g. "Luxury Wedding Package", "Corporate Gala Bundle").
- suggestedPrice: Total package price as a number. Infer from the user's request (e.g. "around $12k" → 12000, "under 5k" → 4500).`;

/** Create a new package from a natural-language prompt (catalog page flow). Returns package id and redirects to builder. */
export async function createPackageWithION(
  workspaceId: string,
  userPrompt: string
): Promise<CreatePackageWithIONResult> {
  const trimmed = userPrompt?.trim();
  if (!trimmed) {
    return { packageId: null, error: 'Describe the package you want.' };
  }

  const { items } = await getCatalogForION(workspaceId);
  const catalogContext =
    items.length > 0
      ? `Catalog (use these ids in line_item_group.items when relevant):\n${items
          .map(
            (i) =>
              `- id: ${i.id} | name: ${i.name} | category: ${i.category} | price: ${i.price}${i.description ? ` | ${i.description.slice(0, 80)}` : ''}`
          )
          .join('\n')}`
      : 'No catalog items in this workspace yet. Use short display labels in line_item_group items.';

  const systemPrompt = `${ION_FULL_SYSTEM}\n\n${catalogContext}`;

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o'),
      schema: ionFullPackageSchema,
      system: systemPrompt,
      prompt: trimmed,
    });

    const created = await createPackage(workspaceId, {
      name: (object as { suggestedName: string }).suggestedName,
      description: null,
      category: 'package',
      price: (object as { suggestedPrice: number }).suggestedPrice,
      definition: (object as { definition: PackageDefinitionGenerated }).definition,
      tagIds: null,
    });

    if (created.error) {
      return { packageId: null, error: created.error };
    }
    if (!created.package?.id) {
      return { packageId: null, error: 'Package could not be created.' };
    }
    return { packageId: created.package.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ION could not create the package.';
    return { packageId: null, error: message };
  }
}
