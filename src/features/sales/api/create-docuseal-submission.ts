/**
 * Creates a DocuSeal e-signature submission for a proposal.
 * Generates a PDF, uploads it to DocuSeal, and returns the embed_src for the client iframe.
 * @module features/sales/api/create-docuseal-submission
 */

'use server';
import 'server-only';
import { getDocuSealClient } from '@/shared/api/docuseal/server';
import { getPublicProposal } from './get-public-proposal';
import { generateProposalPdf } from './generate-proposal-pdf';

export type CreateSubmissionResult =
  | { success: true; submissionId: string; embedSrc: string }
  | { success: false; error: string };

export async function createDocuSealSubmission(
  proposalId: string,
  publicToken: string,
  clientEmail: string,
  clientName: string,
  eventTitle: string,
  workspaceId: string
): Promise<CreateSubmissionResult> {
  const docuseal = getDocuSealClient();
  if (!docuseal) {
    return { success: false, error: 'E-signature not configured. Add DOCUSEAL_API_KEY to environment.' };
  }

  // Fetch full public proposal data for PDF generation
  const data = await getPublicProposal(publicToken);
  if (!data) {
    return { success: false, error: 'Proposal not found.' };
  }

  // Generate PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateProposalPdf(data);
  } catch (e) {
    console.error('[docuseal] PDF generation failed:', e);
    return { success: false, error: 'Failed to generate proposal PDF.' };
  }

  const base64Pdf = pdfBuffer.toString('base64');

  // Create submission
  const response = await docuseal.post('/submissions/pdf', {
    name: `${eventTitle} — Proposal`,
    send_email: false,
    documents: [
      {
        name: 'Proposal',
        file: base64Pdf,
        fields: [
          {
            name: 'Signature',
            type: 'signature',
            role: 'Client',
            required: true,
            areas: [{ x: 0.05, y: 0.88, w: 0.45, h: 0.05, page: 1 }],
          },
          {
            name: 'Signed Date',
            type: 'date',
            role: 'Client',
            required: true,
            areas: [{ x: 0.55, y: 0.88, w: 0.35, h: 0.05, page: 1 }],
          },
        ],
      },
    ],
    submitters: [
      {
        role: 'Client',
        name: clientName,
        email: clientEmail,
        send_email: false,
        metadata: {
          proposal_id: proposalId,
          workspace_id: workspaceId,
        },
      },
    ],
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[docuseal] create submission failed:', response.status, text);
    return { success: false, error: `DocuSeal API error: ${response.status}` };
  }

  const json = await response.json() as {
    id: number;
    submitters: Array<{ embed_src: string }>;
  };

  const submissionId = String(json.id);
  const embedSrc = json.submitters?.[0]?.embed_src ?? '';

  if (!embedSrc) {
    return { success: false, error: 'No signing URL returned from DocuSeal.' };
  }

  return { success: true, submissionId, embedSrc };
}
