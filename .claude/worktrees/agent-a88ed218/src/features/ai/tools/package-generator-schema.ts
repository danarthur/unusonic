/**
 * ION package definition – Zod schema and types (no 'use server').
 * Used by package-generator.ts server actions.
 * @module features/ai/tools/package-generator-schema
 */

import { z } from 'zod';

// —— Zod schema (matches PackageDefinition) ——

const headerHeroContentSchema = z.object({
  image: z.string().optional().describe('Image URL for hero; use placeholder if none'),
  title: z.string().optional().describe('Hero headline'),
});

const lineItemGroupSchema = z.object({
  id: z.string().describe('Unique block id, e.g. b1, b2'),
  type: z.literal('line_item_group'),
  label: z.string().describe('Group label, e.g. Ceremony services'),
  items: z.array(z.string()).describe('Item IDs (UUIDs from catalog when available) or display labels'),
});

const textBlockSchema = z.object({
  id: z.string().describe('Unique block id'),
  type: z.literal('text_block'),
  content: z.string().describe('Plain text content (terms, description)'),
});

const headerHeroBlockSchema = z.object({
  id: z.string().describe('Unique block id'),
  type: z.literal('header_hero'),
  content: headerHeroContentSchema,
});

const blockSchema = z.discriminatedUnion('type', [
  headerHeroBlockSchema,
  lineItemGroupSchema,
  textBlockSchema,
]);

const staffingSchema = z
  .object({
    required: z.boolean(),
    role: z.string().nullable().optional(),
    defaultStaffId: z.string().nullable().optional(),
    defaultStaffName: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

export const packageDefinitionSchema = z.object({
  layout: z.string().optional().describe('Layout key, e.g. standard_v1'),
  blocks: z.array(blockSchema).describe('Ordered list of blocks'),
  staffing: staffingSchema,
});

export type PackageDefinitionGenerated = z.infer<typeof packageDefinitionSchema>;

/** Catalog item summary for ION context (RAG). */
export interface CatalogItemForION {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
}

export interface GetCatalogForIONResult {
  items: CatalogItemForION[];
  error?: string;
}

export interface GeneratePackageDefinitionResult {
  definition: PackageDefinitionGenerated | null;
  error?: string;
}

export interface CreatePackageWithIONResult {
  packageId: string | null;
  error?: string;
}
