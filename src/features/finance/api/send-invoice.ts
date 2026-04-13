'use server';

/**
 * Finance feature — Send Invoice server action
 *
 * Orchestrates the full send flow:
 * 1. Validate draft state + acquire lock
 * 2. Assign invoice number via finance.next_invoice_number RPC
 * 3. Snapshot tax: read workspace rate, compute tax_amount, write tax_rate_snapshot
 * 4. Snapshot bill_to and from entity/workspace data into JSONB columns
 * 5. Set issue_date, due_date, issued_at, sent_at, status='sent'
 * 6. Generate PDF (versioned path), upload to Supabase Storage
 * 7. Send email via workspace-aware from address with /i/{public_token} link
 * 8. Enqueue QBO push job (if QBO connected)
 *
 * @module features/finance/api/send-invoice
 */

import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { parseBillToSnapshot, parseFromSnapshot } from '../schemas/invoice-snapshots';
import type { BillToSnapshotV1, FromSnapshotV1 } from '../schemas/invoice-snapshots';

export interface SendInvoiceResult {
  success: boolean;
  invoiceNumber: string | null;
  error: string | null;
}

export async function sendInvoice(
  invoiceId: string,
  eventId?: string,
): Promise<SendInvoiceResult> {
  const sessionClient = await createClient();
  const system = getSystemClient();

  // ── 1. Verify caller access + fetch invoice ────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types
  const { data: invoice, error: fetchErr } = await (sessionClient as any)
    .schema('finance')
    .from('invoices')
    .select(`
      id, workspace_id, status, invoice_kind, invoice_number,
      bill_to_entity_id, subtotal_amount, total_amount,
      public_token, billing_email, notes_to_client, terms,
      po_number, deal_id, event_id, proposal_id, pdf_version
    `)
    .eq('id', invoiceId)
    .maybeSingle();

  if (fetchErr || !invoice) {
    return { success: false, invoiceNumber: null, error: fetchErr?.message ?? 'Invoice not found or access denied' };
  }

  if (invoice.status !== 'draft') {
    return { success: false, invoiceNumber: null, error: `Cannot send invoice with status "${invoice.status}". Only draft invoices can be sent.` };
  }

  // ── 2. Assign invoice number ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoiceNumber, error: numErr } = await (system as any)
    .schema('finance')
    .rpc('next_invoice_number', { p_workspace_id: invoice.workspace_id });

  if (numErr || !invoiceNumber) {
    return { success: false, invoiceNumber: null, error: numErr?.message ?? 'Failed to allocate invoice number' };
  }

  // ── 3. Snapshot tax ────────────────────────────────────────────────────────
  // payment_due_days, logo_url not yet in generated types (added post-typegen)
  const { data: workspace } = await (system as any)
    .from('workspaces')
    .select('name, default_tax_rate, logo_url, payment_due_days, slug')
    .eq('id', invoice.workspace_id)
    .maybeSingle() as { data: { name: string; default_tax_rate: number | null; logo_url: string | null; payment_due_days: number | null; slug: string | null } | null };

  const taxRate = Number(workspace?.default_tax_rate ?? 0);

  // Read line items to compute taxable subtotal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lineItems } = await (system as any)
    .schema('finance')
    .from('invoice_line_items')
    .select('id, amount, is_taxable, item_kind')
    .eq('invoice_id', invoiceId);

  const taxableSubtotal = (lineItems ?? [])
    .filter((li: { is_taxable: boolean; item_kind: string }) => li.is_taxable && li.item_kind !== 'tax_line')
    .reduce((sum: number, li: { amount: number }) => sum + Number(li.amount), 0);

  const taxAmount = taxRate > 0 && taxableSubtotal > 0
    ? Math.round(taxableSubtotal * taxRate * 100) / 100
    : 0;

  const subtotal = (lineItems ?? [])
    .filter((li: { item_kind: string }) => li.item_kind !== 'tax_line')
    .reduce((sum: number, li: { amount: number }) => sum + Number(li.amount), 0);

  const totalAmount = subtotal + taxAmount;

  // ── 4. Snapshot bill_to and from ───────────────────────────────────────────
  // Read the bill_to entity (directory schema)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entity } = await (system as any)
    .schema('directory')
    .from('entities')
    .select('display_name, type, attributes')
    .eq('id', invoice.bill_to_entity_id)
    .maybeSingle();

  // Build snapshot with safe fallbacks (entities may have sparse attributes)
  const entityAttrs = (entity as any)?.attributes ?? {};

  // contact_name precedence:
  //   1. explicit attrs.contact_name
  //   2. first_name + last_name joined (when either exists)
  //   3. null
  // Previous `(a ?? b) ? template : null` parsed with the ternary binding
  // lower than `??`, so when contact_name was null and first_name was also
  // null/"", the ternary fell through to the template and produced an empty
  // concat that looked truthy — sent invoices ended up with a bogus " " name.
  const explicitContactName =
    typeof entityAttrs.contact_name === 'string' ? entityAttrs.contact_name.trim() : '';
  const firstName = typeof entityAttrs.first_name === 'string' ? entityAttrs.first_name : '';
  const lastName = typeof entityAttrs.last_name === 'string' ? entityAttrs.last_name : '';
  const composedContactName = `${firstName} ${lastName}`.trim();
  const resolvedContactName = explicitContactName || composedContactName || null;

  const billToSnapshot: BillToSnapshotV1 = parseBillToSnapshot({
    v: 1,
    display_name: (entity as any)?.display_name ?? 'Unknown',
    entity_type: (entity as any)?.type ?? undefined,
    email: invoice.billing_email ?? entityAttrs.email ?? entityAttrs.primary_email ?? null,
    phone: entityAttrs.phone ?? entityAttrs.primary_phone ?? null,
    address: entityAttrs.address ?? null,
    contact_name: resolvedContactName,
  });

  const fromSnapshot: FromSnapshotV1 = parseFromSnapshot({
    v: 1,
    workspace_name: workspace?.name ?? 'Unusonic',
    logo_url: workspace?.logo_url ?? null,
    address: null, // Workspace address not yet stored; Wave 2 finance onboarding adds this
    ein: null, // Same — Wave 2
    phone: null,
    email: null,
    website: null,
  });

  // ── 5. Compute dates + update invoice ──────────────────────────────────────
  const today = new Date();
  const issueDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const paymentDueDays = Number(workspace?.payment_due_days ?? 30);
  const dueDate = new Date(today.getTime() + paymentDueDays * 86400000)
    .toISOString().split('T')[0];
  const nowIso = today.toISOString();
  const newPdfVersion = (invoice.pdf_version ?? 0) + 1;

  // ── 5a. Persist snapshots + numbering, but keep status='draft' until PDF
  //       and email both succeed. This makes the "sent" flip atomic — clients
  //       never receive a "sent" invoice with a 404 PDF or no email delivery.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: stageErr } = await (system as any)
    .schema('finance')
    .from('invoices')
    .update({
      invoice_number: invoiceNumber,
      subtotal_amount: subtotal,
      discount_amount: 0,
      tax_amount: taxAmount,
      tax_rate_snapshot: taxRate,
      total_amount: totalAmount,
      issue_date: issueDate,
      due_date: dueDate,
      issued_at: nowIso,
      bill_to_snapshot: billToSnapshot,
      from_snapshot: fromSnapshot,
      pdf_version: newPdfVersion,
    })
    .eq('id', invoiceId);

  if (stageErr) {
    return { success: false, invoiceNumber: null, error: stageErr.message };
  }

  // ── 6. Generate PDF + upload (must succeed; otherwise invoice stays draft) ──
  try {
    const { generateInvoicePdf } = await import('./generate-invoice-pdf');
    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoiceNumber as string,
      invoiceKind: invoice.invoice_kind,
      issueDate,
      dueDate,
      billTo: billToSnapshot,
      from: fromSnapshot,
      lineItems: (lineItems ?? []).map((li: any) => ({
        description: li.description ?? '',
        quantity: li.quantity ?? 1,
        unitPrice: li.unit_price ?? 0,
        amount: li.amount ?? 0,
        itemKind: li.item_kind ?? 'service',
      })),
      subtotal,
      taxAmount,
      taxRate,
      totalAmount,
      notesToClient: invoice.notes_to_client,
      poNumber: invoice.po_number,
      terms: invoice.terms,
      publicToken: invoice.public_token,
    });

    const dealPath = invoice.deal_id ?? 'standalone';
    const storagePath = `${invoice.workspace_id}/${dealPath}/invoices/${invoiceNumber}/v${newPdfVersion}.pdf`;

    const { error: uploadErr } = await system.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadErr) throw uploadErr;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[sendInvoice] PDF generation failed — leaving invoice in draft:', message);
    Sentry.captureException(e, {
      tags: { area: 'finance.send-invoice', phase: 'pdf' },
      extra: { invoiceId, invoiceNumber },
    });
    return { success: false, invoiceNumber: null, error: `Failed to generate invoice PDF: ${message}` };
  }

  // ── 7. Send email (must succeed; otherwise invoice stays draft) ─────────────
  const recipientEmail = billToSnapshot.email;
  if (!recipientEmail) {
    return { success: false, invoiceNumber: null, error: 'Bill-to entity has no email — add one before sending.' };
  }

  try {
    const { sendInvoiceEmail } = await import('./send-invoice-email');
    await sendInvoiceEmail({
      to: recipientEmail,
      workspaceId: invoice.workspace_id,
      invoiceNumber: invoiceNumber as string,
      totalAmount,
      dueDate,
      publicToken: invoice.public_token,
      billToName: billToSnapshot.display_name,
      workspaceName: fromSnapshot.workspace_name,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[sendInvoice] Email send failed — leaving invoice in draft:', message);
    Sentry.captureException(e, {
      tags: { area: 'finance.send-invoice', phase: 'email' },
      extra: { invoiceId, invoiceNumber, recipientEmail },
    });
    return { success: false, invoiceNumber: null, error: `Failed to send invoice email: ${message}` };
  }

  // ── 7a. Atomic flip: only now mark as sent ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: flipErr } = await (system as any)
    .schema('finance')
    .from('invoices')
    .update({ status: 'sent', sent_at: nowIso })
    .eq('id', invoiceId);

  if (flipErr) {
    return { success: false, invoiceNumber: null, error: flipErr.message };
  }

  // ── 8. Enqueue QBO push (if connected) ─────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: qboConn } = await (system as any)
      .schema('finance')
      .from('qbo_connections')
      .select('id')
      .eq('workspace_id', invoice.workspace_id)
      .eq('status', 'active')
      .maybeSingle();

    if (qboConn) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (system as any)
        .schema('finance')
        .from('sync_jobs')
        .insert({
          workspace_id: invoice.workspace_id,
          job_kind: 'push_invoice',
          local_id: invoiceId,
          state: 'queued',
          next_attempt_at: new Date().toISOString(),
        });
    }
  } catch {
    // QBO push failure is non-fatal — will be caught by nightly backfill
  }

  // ── Revalidate ─────────────────────────────────────────────────────────────
  if (eventId) revalidatePath(`/events/${eventId}/finance`);
  revalidatePath('/crm');
  revalidatePath('/finance');

  return { success: true, invoiceNumber: invoiceNumber as string, error: null };
}
