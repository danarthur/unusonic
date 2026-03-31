'use server';
 

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { ExpenseCategory } from '../model/types';

export type { ExpenseCategory };

export type ExpensePaymentType =
  | 'bill'
  | 'check'
  | 'cash'
  | 'credit_card'
  | 'bank_transfer'
  | 'other';

export type ExpenseRow = {
  id: string;
  event_id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
  vendor_entity_id: string | null;
  vendor_name: string | null; // resolved from directory.entities
  paid_at: string | null;
  payment_type: ExpensePaymentType;
  note: string | null;
  qbo_purchase_id: string | null;
  qbo_account_id: string | null;
  qbo_synced_at: string | null;
  created_at: string;
};

export type UpsertExpensePayload = {
  id?: string;
  event_id: string;
  label: string;
  category: ExpenseCategory;
  amount: number;
  vendor_entity_id?: string | null;
  paid_at?: string | null;
  payment_type?: ExpensePaymentType;
  note?: string | null;
};

export type ExpenseResult =
  | { success: true; expense: ExpenseRow }
  | { success: false; error: string };

export type DeleteExpenseResult =
  | { success: true }
  | { success: false; error: string };

export async function getEventExpenses(eventId: string): Promise<ExpenseRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('ops')
    .from('event_expenses')
    .select('*')
    .eq('event_id', eventId)
    .order('paid_at', { ascending: false, nullsFirst: false });

  if (error || !data) return [];

  // Resolve vendor names in one batch query
  const vendorIds = [...new Set(data.map((r) => r.vendor_entity_id).filter(Boolean))] as string[];
  const vendorNames: Record<string, string> = {};
  if (vendorIds.length > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', vendorIds);
    for (const e of entities ?? []) {
      vendorNames[e.id] = (e as { id: string; display_name: string | null }).display_name ?? '';
    }
  }

  return data.map((r) => ({
    id: r.id,
    event_id: r.event_id,
    label: r.label,
    category: r.category as ExpenseCategory,
    amount: Number(r.amount),
    vendor_entity_id: r.vendor_entity_id,
    vendor_name: r.vendor_entity_id ? (vendorNames[r.vendor_entity_id] ?? null) : null,
    paid_at: r.paid_at,
    payment_type: r.payment_type as ExpensePaymentType,
    note: r.note,
    qbo_purchase_id: r.qbo_purchase_id,
    qbo_account_id: r.qbo_account_id,
    qbo_synced_at: r.qbo_synced_at,
    created_at: r.created_at,
  }));
}

export async function upsertExpense(payload: UpsertExpensePayload): Promise<ExpenseResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const row = {
    workspace_id: workspaceId,
    event_id: payload.event_id,
    label: payload.label.trim(),
    category: payload.category,
    amount: payload.amount,
    vendor_entity_id: payload.vendor_entity_id ?? null,
    paid_at: payload.paid_at ?? null,
    payment_type: payload.payment_type ?? 'other',
    note: payload.note?.trim() ?? null,
  };

  let result;
  if (payload.id) {
    const { data, error } = await supabase
      .schema('ops')
      .from('event_expenses')
      .update(row)
      .eq('id', payload.id)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error || !data) return { success: false, error: error?.message ?? 'Update failed.' };
    result = data;
  } else {
    const { data, error } = await supabase
      .schema('ops')
      .from('event_expenses')
      .insert(row)
      .select()
      .single();
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed.' };
    result = data;
  }

  return {
    success: true,
    expense: {
      id: result.id,
      event_id: result.event_id,
      label: result.label,
      category: result.category as ExpenseCategory,
      amount: Number(result.amount),
      vendor_entity_id: result.vendor_entity_id,
      vendor_name: null,
      paid_at: result.paid_at,
      payment_type: result.payment_type as ExpensePaymentType,
      note: result.note,
      qbo_purchase_id: result.qbo_purchase_id,
      qbo_account_id: result.qbo_account_id,
      qbo_synced_at: result.qbo_synced_at,
      created_at: result.created_at,
    },
  };
}

export async function deleteExpense(expenseId: string): Promise<DeleteExpenseResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('event_expenses')
    .delete()
    .eq('id', expenseId)
    .eq('workspace_id', workspaceId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
