/**
 * InvoicePDF — react-pdf/renderer document for client invoices.
 *
 * Uses @react-pdf/renderer primitives only (no HTML, no Tailwind).
 * Style follows the existing ProposalPDF: dark Stage Engineering palette,
 * branded header, clean line-items table. Renders on server via renderToBuffer.
 *
 * Required fields per the plan:
 * - Branded header (workspace logo, name, address, EIN)
 * - PO number field (corporate AP requirement — Kristen persona)
 * - Line items table with quantity, unit price, amount
 * - Subtotal, tax, total
 * - Payment terms and notes to client
 * - Pay-now link (/i/{public_token})
 *
 * @module features/finance/ui/pdf/InvoicePDF
 */

import React from 'react';
import { Document, Page, View, Text, Link, StyleSheet } from '@react-pdf/renderer';
import type { BillToSnapshotV1, FromSnapshotV1 } from '../../schemas/invoice-snapshots';

/* eslint-disable stage-engineering/no-raw-colors -- react-pdf: PDF renderer does not support OKLCH or CSS custom properties */

export interface InvoicePDFLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  itemKind: string;
}

export interface InvoicePDFProps {
  invoiceNumber: string;
  invoiceKind: string;
  issueDate: string;
  dueDate: string;
  billTo: BillToSnapshotV1;
  from: FromSnapshotV1;
  lineItems: InvoicePDFLineItem[];
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  notesToClient?: string | null;
  poNumber?: string | null;
  terms?: string | null;
  publicToken: string;
}

// Fall back to the Vercel preview URL when NEXT_PUBLIC_APP_URL isn't set
// (common on staging). Only default to https://unusonic.com when neither is
// available — previously this always fell back to the prod domain, so
// staging/dev PDFs embedded a prod checkout link.
const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://unusonic.com');

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatAddress(addr: { street?: string; city?: string; state?: string; postal_code?: string; country?: string } | null | undefined): string {
  if (!addr) return '';
  return [addr.street, [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '), addr.country].filter(Boolean).join('\n');
}

// =============================================================================
// Styles — matches ProposalPDF dark Stage Engineering palette
// =============================================================================

const s = StyleSheet.create({
  page: {
    backgroundColor: '#0f0f13',
    color: '#f0eeeb',
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 48,
    paddingBottom: 64,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35',
  },
  headerLeft: {},
  wordmark: {
    fontSize: 20,
    fontFamily: 'Helvetica',
    fontWeight: 500,
    color: '#f0eeeb',
    letterSpacing: 2.4,
  },
  fromAddress: {
    fontSize: 8,
    color: '#6b6560',
    marginTop: 6,
    lineHeight: 1.5,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  invoiceLabel: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#f0eeeb',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  invoiceNumber: {
    fontSize: 11,
    color: '#a09a94',
    marginTop: 2,
  },

  // Meta grid (dates, PO, bill-to)
  metaRow: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 40,
  },
  metaBlock: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 7,
    color: '#6b6560',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 10,
    color: '#f0eeeb',
    lineHeight: 1.4,
  },

  // Line items table
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35',
    paddingBottom: 6,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a22',
  },
  colDesc: { flex: 3 },
  colQty: { width: 50, textAlign: 'right' as const },
  colRate: { width: 80, textAlign: 'right' as const },
  colAmount: { width: 80, textAlign: 'right' as const },
  tableHeaderText: {
    fontSize: 7,
    color: '#6b6560',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cellText: {
    fontSize: 9,
    color: '#d4d0cc',
  },

  // Totals
  totalsBlock: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 220,
    paddingVertical: 3,
  },
  totalLabel: {
    fontSize: 9,
    color: '#a09a94',
    flex: 1,
  },
  totalValue: {
    fontSize: 9,
    color: '#f0eeeb',
    width: 90,
    textAlign: 'right' as const,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 220,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#2a2a35',
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#f0eeeb',
    flex: 1,
  },
  grandTotalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#f0eeeb',
    width: 90,
    textAlign: 'right' as const,
  },

  // Footer
  footer: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a35',
  },
  footerSection: {
    marginBottom: 12,
  },
  footerLabel: {
    fontSize: 7,
    color: '#6b6560',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  footerText: {
    fontSize: 9,
    color: '#a09a94',
    lineHeight: 1.5,
  },
  payLink: {
    fontSize: 10,
    color: '#f0eeeb',
    textDecoration: 'none',
    marginTop: 8,
  },
});

// =============================================================================
// Component
// =============================================================================

export function InvoicePDF(props: InvoicePDFProps) {
  const {
    invoiceNumber, invoiceKind, issueDate, dueDate,
    billTo, from, lineItems, subtotal, taxAmount, taxRate,
    totalAmount, notesToClient, poNumber, terms, publicToken,
  } = props;

  const payUrl = `${baseUrl.replace(/\/$/, '')}/i/${publicToken}`;
  const displayItems = lineItems.filter((li) => li.itemKind !== 'tax_line');
  const kindLabel = invoiceKind === 'deposit' ? 'Deposit Invoice'
    : invoiceKind === 'final' ? 'Invoice — Balance Due'
    : invoiceKind === 'credit_note' ? 'Credit Note'
    : 'Invoice';

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.wordmark}>
              {from.workspace_name?.toUpperCase() ?? 'UNUSONIC'}
            </Text>
            {from.address && (
              <Text style={s.fromAddress}>{formatAddress(from.address)}</Text>
            )}
            {from.ein && (
              <Text style={s.fromAddress}>EIN: {from.ein}</Text>
            )}
          </View>
          <View style={s.headerRight}>
            <Text style={s.invoiceLabel}>{kindLabel}</Text>
            <Text style={s.invoiceNumber}>{invoiceNumber}</Text>
          </View>
        </View>

        {/* ── Meta grid ────────────────────────────────────────���─────────── */}
        <View style={s.metaRow}>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Bill To</Text>
            <Text style={s.metaValue}>{billTo.display_name}</Text>
            {billTo.contact_name && (
              <Text style={[s.metaValue, { fontSize: 9, color: '#a09a94' }]}>
                {billTo.contact_name}
              </Text>
            )}
            {billTo.address && (
              <Text style={[s.metaValue, { fontSize: 8, color: '#a09a94' }]}>
                {formatAddress(billTo.address)}
              </Text>
            )}
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaLabel}>Issue Date</Text>
            <Text style={s.metaValue}>{fmtDate(issueDate)}</Text>
            <Text style={[s.metaLabel, { marginTop: 10 }]}>Due Date</Text>
            <Text style={s.metaValue}>{fmtDate(dueDate)}</Text>
          </View>
          {poNumber && (
            <View style={s.metaBlock}>
              <Text style={s.metaLabel}>PO Number</Text>
              <Text style={s.metaValue}>{poNumber}</Text>
            </View>
          )}
        </View>

        {/* ── Line Items Table ───────────────────────────────────────────── */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colDesc]}>Description</Text>
          <Text style={[s.tableHeaderText, s.colQty]}>Qty</Text>
          <Text style={[s.tableHeaderText, s.colRate]}>Rate</Text>
          <Text style={[s.tableHeaderText, s.colAmount]}>Amount</Text>
        </View>

        {displayItems.map((item, i) => (
          <View key={i} style={s.tableRow}>
            <Text style={[s.cellText, s.colDesc]}>{item.description}</Text>
            <Text style={[s.cellText, s.colQty]}>
              {item.quantity !== 1 ? String(item.quantity) : ''}
            </Text>
            <Text style={[s.cellText, s.colRate]}>
              {item.quantity !== 1 ? fmtCurrency(item.unitPrice) : ''}
            </Text>
            <Text style={[s.cellText, s.colAmount]}>{fmtCurrency(item.amount)}</Text>
          </View>
        ))}

        {/* ── Totals ─────────────────────────────────────────────────────── */}
        <View style={s.totalsBlock}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{fmtCurrency(subtotal)}</Text>
          </View>
          {taxAmount > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>
                Tax ({(taxRate * 100).toFixed(2)}%)
              </Text>
              <Text style={s.totalValue}>{fmtCurrency(taxAmount)}</Text>
            </View>
          )}
          <View style={s.grandTotalRow}>
            <Text style={s.grandTotalLabel}>Total Due</Text>
            <Text style={s.grandTotalValue}>{fmtCurrency(totalAmount)}</Text>
          </View>
        </View>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <View style={s.footer}>
          {notesToClient && (
            <View style={s.footerSection}>
              <Text style={s.footerLabel}>Notes</Text>
              <Text style={s.footerText}>{notesToClient}</Text>
            </View>
          )}
          {terms && (
            <View style={s.footerSection}>
              <Text style={s.footerLabel}>Terms</Text>
              <Text style={s.footerText}>{terms}</Text>
            </View>
          )}
          <View style={s.footerSection}>
            <Text style={s.footerLabel}>Pay Online</Text>
            <Link src={payUrl} style={s.payLink}>
              {payUrl}
            </Link>
          </View>
        </View>
      </Page>
    </Document>
  );
}
