'use server';

import { createClient } from '@/shared/api/supabase/server';

export async function bulkArchivePackages(packageIds: string[]): Promise<{ error?: string }> {
  if (packageIds.length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from('packages')
    .update({ is_active: false })
    .in('id', packageIds);
  return error ? { error: error.message } : {};
}

export async function bulkRestorePackages(packageIds: string[]): Promise<{ error?: string }> {
  if (packageIds.length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from('packages')
    .update({ is_active: true })
    .in('id', packageIds);
  return error ? { error: error.message } : {};
}

export async function bulkAdjustPrice(
  packageIds: string[],
  adjustmentPercent: number
): Promise<{ error?: string }> {
  if (packageIds.length === 0) return {};
  const supabase = await createClient();
  const { data: pkgs, error: fetchError } = await supabase
    .from('packages')
    .select('id, price')
    .in('id', packageIds);
  if (fetchError) return { error: fetchError.message };
  const multiplier = 1 + adjustmentPercent / 100;
  for (const pkg of pkgs ?? []) {
    const newPrice = Math.round(Number(pkg.price) * multiplier * 100) / 100;
    await supabase.from('packages').update({ price: Math.max(0, newPrice) }).eq('id', pkg.id);
  }
  return {};
}

export async function bulkSetTags(
  packageIds: string[],
  tagIds: string[],
  mode: 'add' | 'remove'
): Promise<{ error?: string }> {
  if (packageIds.length === 0 || tagIds.length === 0) return {};
  const supabase = await createClient();
  if (mode === 'remove') {
    for (const packageId of packageIds) {
      await supabase
        .from('package_tags')
        .delete()
        .eq('package_id', packageId)
        .in('tag_id', tagIds);
    }
  } else {
    const rows = packageIds.flatMap((packageId) =>
      tagIds.map((tagId) => ({ package_id: packageId, tag_id: tagId }))
    );
    await supabase.from('package_tags').upsert(rows, { ignoreDuplicates: true });
  }
  return {};
}

export async function bulkSetTaxStatus(
  packageIds: string[],
  isTaxable: boolean
): Promise<{ error?: string }> {
  if (packageIds.length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from('packages')
    .update({ is_taxable: isTaxable })
    .in('id', packageIds);
  return error ? { error: error.message } : {};
}

/* ─── CSV Import ─── */

export interface CatalogImportRow {
  name: string;
  category: string;
  price: number;
  target_cost?: number | null;
  stock_quantity?: number | null;
}

export async function importCatalogFromCSV(
  workspaceId: string,
  rows: CatalogImportRow[]
): Promise<{ imported: number; errors: { row: number; message: string }[] }> {
  const supabase = await createClient();
  const CATEGORY_MAP: Record<string, string> = {
    package: 'package',
    bundle: 'package',
    service: 'service',
    labor: 'service',
    rental: 'rental',
    gear: 'rental',
    equipment: 'rental',
    talent: 'talent',
    performer: 'talent',
    artist: 'talent',
    retail: 'retail_sale',
    retail_sale: 'retail_sale',
    consumable: 'retail_sale',
    fee: 'fee',
    admin: 'fee',
    surcharge: 'fee',
  };

  let imported = 0;
  const errors: { row: number; message: string }[] = [];

  const batch: Record<string, unknown>[] = [];

  async function flushBatch(currentRow: number) {
    if (batch.length === 0) return;
    const { error } = await supabase
      .from('packages')
      .insert(batch as never[], { ignoreDuplicates: true } as never);
    if (!error) {
      imported += batch.length;
    } else {
      errors.push({ row: currentRow, message: error.message });
    }
    batch.length = 0;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name?.trim();
    if (!name) {
      errors.push({ row: i + 1, message: 'Missing name' });
      continue;
    }

    const catKey = (row.category ?? '').trim().toLowerCase();
    const category = CATEGORY_MAP[catKey];
    if (!category) {
      errors.push({ row: i + 1, message: `Unknown category: "${row.category}"` });
      continue;
    }

    const price = Number(row.price);
    if (!Number.isFinite(price) || price < 0) {
      errors.push({ row: i + 1, message: 'Invalid price' });
      continue;
    }

    batch.push({
      workspace_id: workspaceId,
      name,
      category,
      price,
      target_cost:
        row.target_cost != null && Number.isFinite(Number(row.target_cost))
          ? Number(row.target_cost)
          : null,
      stock_quantity:
        row.stock_quantity != null && Number.isFinite(Number(row.stock_quantity))
          ? Math.max(0, Number(row.stock_quantity))
          : 0,
      is_active: true,
      is_taxable: category === 'rental' || category === 'retail_sale',
    });

    if (batch.length >= 50) {
      await flushBatch(i + 1);
    }
  }

  await flushBatch(rows.length);

  return { imported, errors };
}
