/**
 * Server-side PDF generator for invoices.
 * Uses @react-pdf/renderer to produce a Buffer from the InvoicePDF component.
 * Follows the same pattern as features/sales/api/generate-proposal-pdf.ts.
 *
 * @module features/finance/api/generate-invoice-pdf
 */

import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { InvoicePDF, type InvoicePDFProps } from '../ui/pdf/InvoicePDF';

export type GenerateInvoicePdfInput = InvoicePDFProps;

export async function generateInvoicePdf(data: GenerateInvoicePdfInput): Promise<Buffer> {
  const element = React.createElement(InvoicePDF, data);
  const buffer = await renderToBuffer(element as any);
  return Buffer.from(buffer);
}
