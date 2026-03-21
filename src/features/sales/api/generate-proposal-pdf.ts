/**
 * Server-side PDF generator for proposals.
 * Uses @react-pdf/renderer to render a Buffer from the ProposalPDF component.
 * @module features/sales/api/generate-proposal-pdf
 */

'use server';
import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { ProposalPDF } from '../ui/pdf/ProposalPDF';
import type { PublicProposalDTO } from '../model/public-proposal';

export async function generateProposalPdf(data: PublicProposalDTO): Promise<Buffer> {
  const element = React.createElement(ProposalPDF, { data });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);
  return Buffer.from(buffer);
}
