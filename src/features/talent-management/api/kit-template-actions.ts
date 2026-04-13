'use server';

import 'server-only';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type KitTemplateItem = {
  catalog_item_id?: string;
  name: string;
  category: string;
  quantity: number;
  optional: boolean;
};

export type KitTemplate = {
  id: string;
  role_tag: string;
  name: string;
  items: KitTemplateItem[];
};

export type KitComplianceResult = {
  total: number;
  matched: number;
  missing: KitTemplateItem[];
};

// =============================================================================
// Schemas
// =============================================================================

const CATEGORIES = ['audio', 'lighting', 'video', 'staging', 'power', 'misc'] as const;

const KitTemplateItemSchema = z.object({
  catalog_item_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  category: z.enum(CATEGORIES),
  quantity: z.number().int().positive(),
  optional: z.boolean(),
});

const upsertKitTemplateSchema = z.object({
  role_tag: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  items: z.array(KitTemplateItemSchema),
});

const deleteKitTemplateSchema = z.object({
  template_id: z.string().uuid(),
});

// =============================================================================
// Helpers
// =============================================================================

async function requireAdminOrOwner(): Promise<
  { ok: true; workspaceId: string } | { ok: false; error: string }
> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'Not signed in.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return { ok: false, error: 'Only workspace owners and admins can manage kit templates.' };
  }

  return { ok: true, workspaceId };
}

// =============================================================================
// getKitTemplates
// =============================================================================

export async function getKitTemplates(): Promise<KitTemplate[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .schema('ops')
    .from('kit_templates')
    .select('id, role_tag, name, items')
    .eq('workspace_id', workspaceId)
    .order('name');

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    role_tag: row.role_tag as string,
    name: row.name as string,
    items: Array.isArray(row.items) ? (row.items as KitTemplateItem[]) : [],
  }));
}

// =============================================================================
// getKitTemplateForRole
// =============================================================================

export async function getKitTemplateForRole(
  roleTag: string,
): Promise<KitTemplate | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .schema('ops')
    .from('kit_templates')
    .select('id, role_tag, name, items')
    .eq('workspace_id', workspaceId)
    .eq('role_tag', roleTag)
    .maybeSingle();

  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    role_tag: row.role_tag as string,
    name: row.name as string,
    items: Array.isArray(row.items) ? (row.items as KitTemplateItem[]) : [],
  };
}

// =============================================================================
// upsertKitTemplate
// =============================================================================

export type KitTemplateUpsertResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function upsertKitTemplate(
  input: unknown,
): Promise<KitTemplateUpsertResult> {
  const parsed = upsertKitTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const auth = await requireAdminOrOwner();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('ops')
    .from('kit_templates')
    .upsert(
      {
        workspace_id: auth.workspaceId,
        role_tag: parsed.data.role_tag.trim(),
        name: parsed.data.name.trim(),
        items: parsed.data.items,
      },
      { onConflict: 'workspace_id,role_tag' },
    )
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data.id };
}

// =============================================================================
// deleteKitTemplate
// =============================================================================

export type KitTemplateDeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteKitTemplate(
  templateId: string,
): Promise<KitTemplateDeleteResult> {
  const parsed = deleteKitTemplateSchema.safeParse({ template_id: templateId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const auth = await requireAdminOrOwner();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('kit_templates')
    .delete()
    .eq('id', parsed.data.template_id)
    .eq('workspace_id', auth.workspaceId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// =============================================================================
// getKitComplianceForEntity
//
// Compares a person's approved crew_equipment against the template items for
// a given role. Returns total required items, how many matched, and what's
// missing. Matching: catalog_item_id if present, else case-insensitive name.
// =============================================================================

export async function getKitComplianceForEntity(
  entityId: string,
  roleTag: string,
): Promise<KitComplianceResult | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();

  // 1. Get the template for this role
  const { data: template } = await supabase
    .schema('ops')
    .from('kit_templates')
    .select('items')
    .eq('workspace_id', workspaceId)
    .eq('role_tag', roleTag)
    .maybeSingle();

  if (!template) return null;

  const items: KitTemplateItem[] = Array.isArray(template.items)
    ? (template.items as KitTemplateItem[])
    : [];

  // Only count required (non-optional) items for compliance
  const requiredItems = items.filter((i) => !i.optional);
  if (requiredItems.length === 0) {
    return { total: 0, matched: 0, missing: [] };
  }

  // 2. Get approved equipment for this entity
  const { data: equipment } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .select('catalog_item_id, name')
    .eq('entity_id', entityId)
    .eq('workspace_id', workspaceId)
    .eq('verification_status', 'approved');

  const ownedEquipment = (equipment ?? []) as {
    catalog_item_id: string | null;
    name: string;
  }[];

  // 3. Match each required template item against owned equipment
  const missing: KitTemplateItem[] = [];
  let matched = 0;

  for (const item of requiredItems) {
    let found = false;

    if (item.catalog_item_id) {
      // Match by catalog_item_id
      found = ownedEquipment.some(
        (eq) => eq.catalog_item_id === item.catalog_item_id,
      );
    } else {
      // Fuzzy match by name (case-insensitive includes)
      const needle = item.name.toLowerCase();
      found = ownedEquipment.some((eq) =>
        eq.name.toLowerCase().includes(needle),
      );
    }

    if (found) {
      matched++;
    } else {
      missing.push(item);
    }
  }

  return {
    total: requiredItems.length,
    matched,
    missing,
  };
}
