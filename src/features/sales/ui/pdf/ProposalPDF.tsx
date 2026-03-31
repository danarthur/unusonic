/**
 * ProposalPDF — react-pdf/renderer document for e-signature flow.
 * Uses @react-pdf/renderer primitives only (no HTML, no Tailwind).
 * @module features/sales/ui/pdf/ProposalPDF
 */

import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { PublicProposalDTO } from '../../model/public-proposal';

/* eslint-disable stage-engineering/no-raw-colors -- react-pdf: PDF renderer does not support OKLCH or CSS custom properties */

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#0f0f13',
    color: '#f0eeeb',
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 48,
    paddingBottom: 64,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35',
  },
  wordmark: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#f0eeeb',
    letterSpacing: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  workspaceName: {
    fontSize: 11,
    color: '#a09a94',
  },
  proposalLabel: {
    fontSize: 9,
    color: '#6b6560',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Event info block
  eventBlock: {
    marginBottom: 24,
  },
  eventTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#f0eeeb',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 8,
    color: '#6b6560',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    width: 52,
  },
  metaValue: {
    fontSize: 10,
    color: '#a09a94',
    flex: 1,
  },

  // Section heading
  sectionHeading: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#6b6560',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 24,
  },

  // Line items table
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35',
    marginBottom: 4,
  },
  tableHeaderCell: {
    fontSize: 8,
    color: '#6b6560',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  colName: { flex: 3 },
  colQty: { width: 36, textAlign: 'center' },
  colUnit: { width: 64, textAlign: 'right' },
  colTotal: { width: 64, textAlign: 'right' },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c24',
    alignItems: 'flex-start',
  },
  tableRowAlt: {
    backgroundColor: '#13131a',
  },
  groupHeaderRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 6,
    backgroundColor: '#17171f',
    borderRadius: 4,
  },
  groupHeaderText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#c8c4bf',
  },
  childRow: {
    paddingLeft: 12,
  },
  cellName: {
    fontSize: 10,
    color: '#c8c4bf',
    flex: 3,
  },
  cellQty: {
    fontSize: 10,
    color: '#a09a94',
    width: 36,
    textAlign: 'center',
  },
  cellUnit: {
    fontSize: 10,
    color: '#a09a94',
    width: 64,
    textAlign: 'right',
  },
  cellTotal: {
    fontSize: 10,
    color: '#f0eeeb',
    width: 64,
    textAlign: 'right',
  },

  // Totals
  totalsBlock: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a35',
    alignItems: 'flex-end',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginBottom: 4,
  },
  totalsLabel: {
    fontSize: 10,
    color: '#6b6560',
    width: 80,
    textAlign: 'right',
  },
  totalsValue: {
    fontSize: 10,
    color: '#a09a94',
    width: 72,
    textAlign: 'right',
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#f0eeeb',
    width: 80,
    textAlign: 'right',
  },
  grandTotalValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#f0eeeb',
    width: 72,
    textAlign: 'right',
  },

  // Scope / Terms blocks
  textBlock: {
    marginTop: 20,
  },
  textBlockBody: {
    fontSize: 9,
    color: '#a09a94',
    lineHeight: 1.6,
  },

  // Signature block
  signatureBlock: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#2a2a35',
    flexDirection: 'row',
    gap: 24,
  },
  signatureBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2a2a35',
    borderRadius: 6,
    padding: 16,
    minHeight: 72,
  },
  signatureLabel: {
    fontSize: 8,
    color: '#6b6560',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 20,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a46',
    marginBottom: 6,
  },
  signatureDateLabel: {
    fontSize: 8,
    color: '#6b6560',
  },
  signaturePreFilled: {
    fontSize: 10,
    color: '#c8c4bf',
    marginBottom: 6,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#3a3a46',
  },
});

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

// =============================================================================
// ProposalPDF component
// =============================================================================

interface ProposalPDFProps {
  data: PublicProposalDTO;
}

export function ProposalPDF({ data }: ProposalPDFProps) {
  const { proposal, event, workspace, items } = data;

  // Only show client-visible items
  const visibleItems = items.filter((item) => item.is_client_visible !== false);

  // Compute subtotal from visible items
  const subtotal = visibleItems.reduce(
    (sum, item) => sum + (item.quantity ?? 1) * parseFloat(String(item.unit_price ?? 0)),
    0
  );

  const p = proposal as {
    tax_amount?: number | null;
    scope_of_work?: string | null;
    terms_and_conditions?: string | null;
    signer_name?: string | null;
  };

  const taxAmount = p.tax_amount != null ? Number(p.tax_amount) : 0;
  const grandTotal = subtotal + taxAmount;

  // Group items: each group keyed by package_instance_id (or null for standalone)
  type ItemRow = (typeof visibleItems)[number];
  const groups: Array<{
    displayGroupName: string | null;
    isHeaderGroup: boolean;
    items: ItemRow[];
  }> = [];

  const seenInstances = new Set<string>();
  for (const item of visibleItems) {
    const instId = (item as { package_instance_id?: string | null }).package_instance_id ?? null;
    if (instId && !seenInstances.has(instId)) {
      seenInstances.add(instId);
      const groupItems = visibleItems.filter(
        (i) => (i as { package_instance_id?: string | null }).package_instance_id === instId
      );
      const displayGroupName = (item as { display_group_name?: string | null }).display_group_name ?? null;
      groups.push({ displayGroupName, isHeaderGroup: true, items: groupItems });
    } else if (!instId) {
      groups.push({ displayGroupName: null, isHeaderGroup: false, items: [item] });
    }
  }

  let rowIndex = 0;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>UNUSONIC</Text>
          <View style={styles.headerRight}>
            <Text style={styles.workspaceName}>{workspace.name}</Text>
            <Text style={styles.proposalLabel}>Proposal</Text>
          </View>
        </View>

        {/* ── Event info ───────────────────────────────────────────────────── */}
        <View style={styles.eventBlock}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          {event.startsAt && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{formatDate(event.startsAt)}</Text>
            </View>
          )}
          {event.clientName && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Client</Text>
              <Text style={styles.metaValue}>{event.clientName}</Text>
            </View>
          )}
        </View>

        {/* ── Line items ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionHeading}>Scope of Work</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colName]}>Item</Text>
          <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
          <Text style={[styles.tableHeaderCell, styles.colUnit]}>Unit</Text>
          <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
        </View>

        {groups.map((group, gIdx) => {
          if (group.isHeaderGroup && group.displayGroupName) {
            // Find header row and child rows
            const headerItem = group.items.find(
              (i) => (i as { is_package_header?: boolean }).is_package_header === true
            );
            const childItems = group.items.filter(
              (i) => (i as { is_package_header?: boolean }).is_package_header !== true
            );
            const headerPrice = headerItem
              ? headerItem.quantity * parseFloat(String(headerItem.unit_price ?? 0))
              : 0;

            return (
              <View key={`group-${gIdx}`}>
                {/* Package header row */}
                <View style={[styles.tableRow, styles.groupHeaderRow]}>
                  <Text style={[styles.groupHeaderText, styles.colName]}>{group.displayGroupName}</Text>
                  <Text style={[styles.cellQty, { fontFamily: 'Helvetica-Bold', color: '#c8c4bf' }]}>
                    {headerItem?.quantity ?? 1}
                  </Text>
                  <Text style={[styles.cellUnit, { fontFamily: 'Helvetica-Bold', color: '#c8c4bf' }]}>
                    {headerItem ? formatCurrency(parseFloat(String(headerItem.unit_price ?? 0))) : ''}
                  </Text>
                  <Text style={[styles.cellTotal, { fontFamily: 'Helvetica-Bold' }]}>
                    {formatCurrency(headerPrice)}
                  </Text>
                </View>
                {/* Child rows */}
                {childItems.map((item, cIdx) => {
                  const lineAlt = rowIndex++ % 2 === 1;
                  const lineTotal2 = item.quantity * parseFloat(String(item.unit_price ?? 0));
                  return (
                    <View key={`child-${gIdx}-${cIdx}`} style={[styles.tableRow, styles.childRow, lineAlt ? styles.tableRowAlt : {}]}>
                      <Text style={[styles.cellName, { color: '#8c887f', fontSize: 9 }]}>{item.name}</Text>
                      <Text style={[styles.cellQty, { color: '#6b6560', fontSize: 9 }]}>{item.quantity}</Text>
                      <Text style={[styles.cellUnit, { color: '#6b6560', fontSize: 9 }]}>
                        {lineTotal2 === 0 ? 'Included' : formatCurrency(parseFloat(String(item.unit_price ?? 0)))}
                      </Text>
                      <Text style={[styles.cellTotal, { color: '#8c887f', fontSize: 9 }]}>
                        {lineTotal2 === 0 ? '—' : formatCurrency(lineTotal2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          } else {
            // Standalone item(s)
            return group.items.map((item, iIdx) => {
              const lineAlt = rowIndex++ % 2 === 1;
              const lineTotal2 = item.quantity * parseFloat(String(item.unit_price ?? 0));
              return (
                <View key={`standalone-${gIdx}-${iIdx}`} style={[styles.tableRow, lineAlt ? styles.tableRowAlt : {}]}>
                  <Text style={styles.cellName}>{item.name}</Text>
                  <Text style={styles.cellQty}>{item.quantity}</Text>
                  <Text style={styles.cellUnit}>{formatCurrency(parseFloat(String(item.unit_price ?? 0)))}</Text>
                  <Text style={styles.cellTotal}>{formatCurrency(lineTotal2)}</Text>
                </View>
              );
            });
          }
        })}

        {/* ── Totals ───────────────────────────────────────────────────────── */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatCurrency(subtotal)}</Text>
          </View>
          {taxAmount > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Tax</Text>
              <Text style={styles.totalsValue}>{formatCurrency(taxAmount)}</Text>
            </View>
          )}
          <View style={styles.totalsRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(grandTotal)}</Text>
          </View>
        </View>

        {/* ── Scope of work ────────────────────────────────────────────────── */}
        {p.scope_of_work && (
          <View style={styles.textBlock}>
            <Text style={styles.sectionHeading}>Scope Details</Text>
            <Text style={styles.textBlockBody}>{p.scope_of_work}</Text>
          </View>
        )}

        {/* ── Terms & conditions ───────────────────────────────────────────── */}
        {p.terms_and_conditions && (
          <View style={styles.textBlock}>
            <Text style={styles.sectionHeading}>Terms {'&'} Conditions</Text>
            <Text style={styles.textBlockBody}>{p.terms_and_conditions}</Text>
          </View>
        )}

        {/* ── Signature block ──────────────────────────────────────────────── */}
        <View style={styles.signatureBlock}>
          {/* Client signature box */}
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Client signature</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureDateLabel}>Date</Text>
          </View>

          {/* Accepted by box */}
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Accepted by</Text>
            {p.signer_name && (
              <Text style={styles.signaturePreFilled}>{p.signer_name}</Text>
            )}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureDateLabel}>Signed Date</Text>
          </View>
        </View>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Prepared by Unusonic</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
