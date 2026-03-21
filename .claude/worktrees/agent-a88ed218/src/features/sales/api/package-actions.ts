/**
 * Sales feature – Server Actions: create and update packages (catalog)
 * @module features/sales/api/package-actions
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import type { Package } from '@/types/supabase';

/** Tag shape when hydrated on a package (from workspace_tags via package_tags). */
export interface PackageTag {
  id: string;
  label: string;
  color: string;
}

export type PackageWithTags = Package & { tags?: PackageTag[] };

/**
 * Categories are defined by BILLING BEHAVIOR, not just labels.
 * Package: container for other items.
 * Service: sold by time (hours/days). Includes DJs, Security, Bartenders. Can have staffing requirement (role + optional default staff).
 * Talent: sold by performance (flat rate). e.g. Keynote Speaker, Band Performance.
 * Rental: tracks stock/quantity. e.g. Chairs, Lights.
 * Retail/Sale: consumed/sold. e.g. Sparklers, Gaffer Tape.
 * Fee: pure money. e.g. Travel Fee, Admin Fee.
 */
export type PackageCategory =
  | 'package'
  | 'service'
  | 'rental'
  | 'talent'
  | 'retail_sale'
  | 'fee';

/** Staffing requirement for Service packages: sold by time, but constrained by a role (and optionally a specific person). */
export interface PackageDefinitionStaffing {
  /** When true, booking this package will check calendar for staff with the given role. */
  required: boolean;
  /** Role required (e.g. DJ, Photographer, Security). Used for availability check. */
  role?: string | null;
  /** Optional: default/named talent (e.g. "DJ Allegra"). Specific staff member for this package. */
  defaultStaffId?: string | null;
  /** Display name for default staff when no staff table (e.g. "Allegra"). */
  defaultStaffName?: string | null;
}

/** Single catalog item in a package: one row on canvas with quantity. No nesting. */
export type LineItemPricingType = 'included' | 'itemized';

/** Modular package content (JSONB definition column). Container (name, price, category) stays in columns. */
export type PackageDefinitionBlock =
  | { id: string; type: 'header_hero'; content: { image?: string; title?: string } }
  | { id: string; type: 'line_item'; catalogId: string; quantity: number; pricing_type?: LineItemPricingType }
  | { id: string; type: 'line_item_group'; label: string; items: string[] }
  | { id: string; type: 'text_block'; content: string }
  | { id: string; type: string; content?: unknown };

/** Ingredient-specific fields (Service/Rental/Talent/Retail) stored in definition.ingredient_meta. */
export interface IngredientMeta {
  duration_hours?: number | null;
  staff_role?: string | null;
  stock_quantity?: number | null;
  buffer_percent?: number | null;
  contact_info?: string | null;
}

export interface PackageDefinition {
  layout?: string;
  blocks: PackageDefinitionBlock[];
  /** For Service category: staffing requirement (role + optional default staff). */
  staffing?: PackageDefinitionStaffing | null;
  /** For non-package items: Service/Rental/Talent/Retail fields (duration, stock, contact, etc.). */
  ingredient_meta?: IngredientMeta | null;
}

export interface CreatePackageInput {
  name: string;
  description?: string | null;
  category: PackageCategory;
  price: number;
  /** Lowest acceptable price (negotiation floor). Optional. */
  floor_price?: number | null;
  /** Target cost (e.g. payout to talent); used for margin. Optional for packages (bundle cost = sum of ingredients). */
  target_cost?: number | null;
  /** Rental: total units owned/available. Default 0. */
  stock_quantity?: number | null;
  /** Rental: sourced from 3rd party vendor; target cost = vendor rental cost. */
  is_sub_rental?: boolean | null;
  /** Rental: charge to client if item destroyed/lost. */
  replacement_cost?: number | null;
  /** Rental: days for cleaning/prep before item can be rented again. */
  buffer_days?: number | null;
  definition?: PackageDefinition | null;
  /** Tag IDs (workspace_tags.id). Linked via package_tags. */
  tagIds?: string[] | null;
}

export interface UpdatePackageInput {
  name?: string;
  description?: string | null;
  category?: PackageCategory;
  price?: number;
  floor_price?: number | null;
  target_cost?: number | null;
  is_active?: boolean;
  /** Rental: total units owned/available. */
  stock_quantity?: number | null;
  /** Rental: sourced from 3rd party vendor. */
  is_sub_rental?: boolean | null;
  /** Rental: charge to client if item destroyed/lost. */
  replacement_cost?: number | null;
  /** Rental: days for cleaning/prep before next rental. */
  buffer_days?: number | null;
  definition?: PackageDefinition | null;
  /** Tag IDs (workspace_tags.id). Replaces package_tags for this package. */
  tagIds?: string[] | null;
}

export interface CreatePackageResult {
  package: Package | null;
  error?: string;
}

export interface UpdatePackageResult {
  package: Package | null;
  error?: string;
}

export interface GetPackageResult {
  package: PackageWithTags | null;
  error?: string;
}

export interface GetCatalogPackagesWithTagsResult {
  packages: PackageWithTags[];
  error?: string;
}

async function fetchTagsForPackages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packageIds: string[]
): Promise<Map<string, PackageTag[]>> {
  if (packageIds.length === 0) return new Map();
  const { data } = await supabase
    .from('package_tags')
    .select('package_id, workspace_tags(id, label, color)')
    .in('package_id', packageIds);
  const map = new Map<string, PackageTag[]>();
  type TagShape = { id: string; label: string; color: string };
  for (const row of data ?? []) {
    const pkgId = (row as { package_id: string }).package_id;
    const raw = (row as { workspace_tags: TagShape | TagShape[] | null }).workspace_tags;
    const wt = Array.isArray(raw) ? raw[0] ?? null : raw;
    if (!wt) continue;
    const list = map.get(pkgId) ?? [];
    list.push({ id: wt.id, label: wt.label, color: wt.color });
    map.set(pkgId, list);
  }
  return map;
}

export async function getPackage(packageId: string): Promise<GetPackageResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('id', packageId)
    .single();
  if (error) {
    return { package: null, error: error.message };
  }
  const pkg = data as Package;
  const tagsMap = await fetchTagsForPackages(supabase, [pkg.id]);
  const tags = tagsMap.get(pkg.id) ?? [];
  return { package: { ...pkg, tags } };
}

export async function getCatalogPackagesWithTags(
  workspaceId: string
): Promise<GetCatalogPackagesWithTagsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });
  if (error) {
    return { packages: [], error: error.message };
  }
  const packages = (data ?? []) as Package[];
  const tagsMap = await fetchTagsForPackages(
    supabase,
    packages.map((p) => p.id)
  );
  const withTags: PackageWithTags[] = packages.map((p) => ({
    ...p,
    tags: tagsMap.get(p.id) ?? [],
  }));
  return { packages: withTags };
}

export async function createPackage(
  workspaceId: string,
  input: CreatePackageInput
): Promise<CreatePackageResult> {
  const supabase = await createClient();
  const name = input.name?.trim();
  if (!name) {
    return { package: null, error: 'Name is required.' };
  }
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) {
    return { package: null, error: 'Price must be a non-negative number.' };
  }
  const floorPrice = input.floor_price != null && Number.isFinite(Number(input.floor_price)) ? Number(input.floor_price) : null;
  const targetCost = input.target_cost != null && Number.isFinite(Number(input.target_cost)) ? Number(input.target_cost) : null;
  const stockQty = input.stock_quantity != null && Number.isFinite(Number(input.stock_quantity)) && Number(input.stock_quantity) >= 0 ? Number(input.stock_quantity) : 0;
  const isSubRental = input.is_sub_rental === true;
  const replacementCost = input.replacement_cost != null && Number.isFinite(Number(input.replacement_cost)) && Number(input.replacement_cost) >= 0 ? Number(input.replacement_cost) : null;
  const bufferDays = input.buffer_days != null && Number.isFinite(Number(input.buffer_days)) && Number(input.buffer_days) >= 0 ? Math.max(0, Math.floor(Number(input.buffer_days))) : 0;
  const { data, error } = await supabase
    .from('packages')
    .insert({
      workspace_id: workspaceId,
      name,
      description: input.description?.trim() || null,
      category: input.category ?? 'package',
      price,
      floor_price: floorPrice,
      target_cost: targetCost,
      stock_quantity: stockQty,
      is_sub_rental: isSubRental,
      replacement_cost: replacementCost,
      buffer_days: bufferDays,
      is_active: true,
      definition: input.definition ?? null,
    })
    .select()
    .single();

  if (error) {
    return { package: null, error: error.message };
  }
  const pkg = data as Package;
  const tagIds = input.tagIds?.filter(Boolean) ?? [];
  if (tagIds.length > 0) {
    await supabase.from('package_tags').insert(
      tagIds.map((tag_id) => ({ package_id: pkg.id, tag_id }))
    );
  }
  const tagsMap = await fetchTagsForPackages(supabase, [pkg.id]);
  return { package: { ...pkg, tags: tagsMap.get(pkg.id) ?? [] } as PackageWithTags };
}

export async function updatePackage(
  packageId: string,
  input: UpdatePackageInput
): Promise<UpdatePackageResult> {
  const supabase = await createClient();
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description?.trim() ?? null;
  if (input.category !== undefined) updates.category = input.category;
  if (input.price !== undefined) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0) {
      return { package: null, error: 'Price must be a non-negative number.' };
    }
    updates.price = price;
  }
  if (input.floor_price !== undefined) {
    updates.floor_price =
      input.floor_price != null && Number.isFinite(Number(input.floor_price)) ? Number(input.floor_price) : null;
  }
  if (input.target_cost !== undefined) {
    updates.target_cost =
      input.target_cost != null && Number.isFinite(Number(input.target_cost)) ? Number(input.target_cost) : null;
  }
  if (input.is_active !== undefined) updates.is_active = input.is_active;
  if (input.stock_quantity !== undefined) {
    const v = input.stock_quantity != null && Number.isFinite(Number(input.stock_quantity)) && Number(input.stock_quantity) >= 0 ? Number(input.stock_quantity) : 0;
    updates.stock_quantity = v;
  }
  if (input.is_sub_rental !== undefined) updates.is_sub_rental = input.is_sub_rental === true;
  if (input.replacement_cost !== undefined) {
    updates.replacement_cost =
      input.replacement_cost != null && Number.isFinite(Number(input.replacement_cost)) && Number(input.replacement_cost) >= 0 ? Number(input.replacement_cost) : null;
  }
  if (input.buffer_days !== undefined) {
    const v = input.buffer_days != null && Number.isFinite(Number(input.buffer_days)) && Number(input.buffer_days) >= 0 ? Math.max(0, Math.floor(Number(input.buffer_days))) : 0;
    updates.buffer_days = v;
  }
  if (input.definition !== undefined) updates.definition = input.definition;
  if (input.tagIds !== undefined) {
    await supabase.from('package_tags').delete().eq('package_id', packageId);
    const ids = (input.tagIds ?? []).filter(Boolean);
    if (ids.length > 0) {
      await supabase.from('package_tags').insert(ids.map((tag_id) => ({ package_id: packageId, tag_id })));
    }
  }
  if (Object.keys(updates).length === 0 && input.tagIds === undefined) {
    const { data } = await supabase.from('packages').select('*').eq('id', packageId).single();
    const pkg = (data ?? null) as Package | null;
    if (pkg) {
      const tagsMap = await fetchTagsForPackages(supabase, [pkg.id]);
      return { package: { ...pkg, tags: tagsMap.get(pkg.id) ?? [] } as PackageWithTags };
    }
    return { package: null };
  }
  const { data, error } = await supabase
    .from('packages')
    .update(updates)
    .eq('id', packageId)
    .select()
    .single();

  if (error) {
    return { package: null, error: error.message };
  }
  const pkg = data as Package;
  const tagsMap = await fetchTagsForPackages(supabase, [pkg.id]);
  return { package: { ...pkg, tags: tagsMap.get(pkg.id) ?? [] } as PackageWithTags };
}
