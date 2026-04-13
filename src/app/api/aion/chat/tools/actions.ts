/**
 * Action tools: deal management, crew, proposals, communication.
 * All write operations require canWrite permission and user confirmation.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { getDeal } from '@/app/(dashboard)/(features)/crm/actions/get-deal';
import { addManualDealCrew, confirmDealCrew, updateCrewDispatch, searchCrewMembers } from '@/app/(dashboard)/(features)/crm/actions/deal-crew';
import { getProposalForDeal, addPackageToProposal, publishProposal } from '@/features/sales/api/proposal-actions';
import { getCatalogPackagesWithTags } from '@/features/sales/api/package-actions';
import { createDeal } from '@/app/(dashboard)/(features)/crm/actions/deal-actions';
import { updateDealStatus } from '@/app/(dashboard)/(features)/crm/actions/update-deal-status';
import { updateDealScalars } from '@/app/(dashboard)/(features)/crm/actions/update-deal-scalars';
import { getCrewDecisionData } from '@/app/(dashboard)/(features)/crm/actions/get-crew-decision-data';
import { logFollowUpAction } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';
import { WRITE_DENIED, type AionToolContext } from './types';

export function createActionTools(ctx: AionToolContext) {
  const { workspaceId, canWrite } = ctx;

  // ---- Deal management ----

  const create_deal = tool({
    description: 'Create a new deal. IMPORTANT: Always confirm details with the user first. Offer [Confirm] [Cancel] chips.',
    inputSchema: z.object({
      title: z.string().optional().describe('Deal title'),
      proposedDate: z.string().describe('Event date in YYYY-MM-DD format'),
      eventArchetype: z.string().optional().describe('Event type: wedding, corporate_gala, product_launch, private_dinner'),
      clientName: z.string().optional().describe('Client name'),
      clientEmail: z.string().optional().describe('Client email'),
      clientPhone: z.string().optional().describe('Client phone'),
      budgetEstimated: z.number().optional().describe('Estimated budget in dollars'),
      notes: z.string().optional().describe('Deal notes'),
      venueName: z.string().optional().describe('Venue name'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;
      return createDeal({
        proposedDate: params.proposedDate,
        title: params.title,
        eventArchetype: params.eventArchetype as any,
        clientName: params.clientName,
        clientEmail: params.clientEmail,
        clientPhone: params.clientPhone,
        clientType: 'individual' as const,
        status: 'inquiry' as const,
        budgetEstimated: params.budgetEstimated,
        notes: params.notes,
        venueName: params.venueName,
      });
    },
  });

  const update_deal_status = tool({
    description: 'Update a deal\'s status. IMPORTANT: Confirm with the user first. Statuses: inquiry, proposal, contract_sent, won, lost.',
    inputSchema: z.object({
      dealId: z.string().describe('The deal ID'),
      status: z.string().describe('New status'),
      lostReason: z.string().optional().describe('If lost: budget, timing, competitor, scope, unresponsive, other'),
      lostToCompetitor: z.string().optional().describe('Competitor name if lost to competitor'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;
      const lostInput = params.status === 'lost' && params.lostReason
        ? { lost_reason: params.lostReason as any, lost_to_competitor_name: params.lostToCompetitor }
        : undefined;
      return updateDealStatus(params.dealId, params.status as any, lostInput);
    },
  });

  const update_deal_fields = tool({
    description: 'Update deal fields like title, date, budget, or notes.',
    inputSchema: z.object({
      dealId: z.string().describe('The deal ID'),
      title: z.string().optional(), proposed_date: z.string().optional(),
      event_archetype: z.string().optional(), budget_estimated: z.number().optional(),
      notes: z.string().optional(),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;
      const { dealId, ...patch } = params;
      return updateDealScalars(dealId, patch as any);
    },
  });

  // ---- Crew recommendation & management ----

  const recommend_crew = tool({
    description: 'Recommend crew members for a deal based on availability, skills, and past experience.',
    inputSchema: z.object({
      dealId: z.string().describe('The deal ID to staff'),
      role: z.string().optional().describe('Role to fill: DJ, Sound Engineer, Lighting, etc.'),
    }),
    execute: async (params) => {
      const deal = await getDeal(params.dealId);
      if (!deal) return { error: 'Deal not found' };
      if (!deal.proposed_date) return { error: 'Deal has no proposed date — set a date first' };

      const supabase = await createClient();
      const { data: orgEntity } = await supabase.schema('directory').from('entities')
        .select('id').eq('owner_workspace_id', workspaceId).in('type', ['organization', 'company']).limit(1).maybeSingle();
      if (!orgEntity) return { error: 'No organization found' };

      const candidates = await searchCrewMembers((orgEntity as any).id, params.role ?? '', params.role);
      if (candidates.length === 0) return { crew: [], message: 'No crew members found matching that role.' };

      const entityIds = candidates.slice(0, 10).map((c) => c.entity_id);
      const decisions = await getCrewDecisionData(entityIds, deal.proposed_date, params.role ?? null, workspaceId);

      const sorted = decisions.sort((a, b) => {
        if (a.availability === 'available' && b.availability !== 'available') return -1;
        if (b.availability === 'available' && a.availability !== 'available') return 1;
        if (b.skillMatchScore !== a.skillMatchScore) return b.skillMatchScore - a.skillMatchScore;
        return b.pastShowCount - a.pastShowCount;
      });

      const nameMap = new Map(candidates.map((c) => [c.entity_id, c.name]));
      return {
        crew: sorted.slice(0, 8).map((d) => ({
          entityId: d.entityId, name: nameMap.get(d.entityId) ?? 'Unknown',
          availability: d.availability, conflictEvent: d.conflictEventName,
          skillMatch: d.skillMatchScore, pastShows: d.pastShowCount, lastShow: d.lastShowDate, dayRate: d.dayRate,
        })),
      };
    },
  });

  const assign_crew = tool({
    description: 'Assign a crew member to a deal. IMPORTANT: Confirm with the user first.',
    inputSchema: z.object({
      dealId: z.string().describe('The deal ID'),
      entityId: z.string().describe('The crew member entity ID'),
      role: z.string().optional().describe('Role description'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;
      return addManualDealCrew(params.dealId, params.entityId, params.role);
    },
  });

  const confirm_crew = tool({
    description: 'Confirm a crew assignment on a deal.',
    inputSchema: z.object({ dealCrewRowId: z.string().describe('The deal_crew row ID') }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;
      return confirmDealCrew(params.dealCrewRowId);
    },
  });

  const update_crew_dispatch = tool({
    description: 'Update crew dispatch details: status, call time, day rate.',
    inputSchema: z.object({
      dealCrewRowId: z.string().describe('The deal_crew row ID'),
      dispatch_status: z.string().optional(), call_time: z.string().optional(),
      day_rate: z.number().optional(), payment_status: z.string().optional(),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;
      const { dealCrewRowId, ...updates } = params;
      return updateCrewDispatch(dealCrewRowId, updates as any);
    },
  });

  // ---- Proposals ----

  const search_catalog = tool({
    description: 'Search the catalog for packages and services.',
    inputSchema: z.object({
      query: z.string().optional().describe('Search term'),
      category: z.string().optional().describe('Filter: package, service, rental, talent, retail_sale, fee'),
    }),
    execute: async () => {
      const result = await getCatalogPackagesWithTags(workspaceId);
      const packages = result.packages ?? [];
      return {
        packages: packages.slice(0, 15).map((p: any) => ({ id: p.id, name: p.name, category: p.category, price: p.price, tags: p.tags?.map((t: any) => t.name) ?? [] })),
        total: packages.length,
      };
    },
  });

  const create_proposal = tool({
    description: 'Add packages to a deal\'s draft proposal. IMPORTANT: Confirm package selection first.',
    inputSchema: z.object({
      dealId: z.string().describe('The deal ID'),
      packageIds: z.array(z.string()).describe('Package IDs to add'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;
      for (const packageId of params.packageIds) {
        await addPackageToProposal(params.dealId, packageId);
      }
      const proposal = await getProposalForDeal(params.dealId);
      const total = proposal?.items?.reduce((sum: number, i: any) => sum + (i.total ?? 0), 0) ?? 0;
      return { proposalId: proposal?.id, total, itemCount: proposal?.items?.length ?? 0, packagesAdded: params.packageIds.length };
    },
  });

  const publish_proposal = tool({
    description: 'Publish a draft proposal. IMPORTANT: Confirm with the user — this makes it visible to the client.',
    inputSchema: z.object({ proposalId: z.string().describe('The proposal ID') }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;
      return publishProposal(params.proposalId);
    },
  });

  // ---- Communication ----

  const send_follow_up_email = tool({
    description: 'Send a follow-up email. IMPORTANT: Only call after the user explicitly says to send.',
    inputSchema: z.object({
      to: z.string().describe('Recipient email'), subject: z.string().describe('Subject line'),
      body: z.string().describe('Email body text'), dealId: z.string().describe('Deal ID for logging'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const from = process.env.EMAIL_FROM ?? 'noreply@unusonic.com';
        const { error } = await resend.emails.send({
          from, to: params.to, subject: params.subject,
          html: `<p>${params.body.replace(/\n/g, '<br>')}</p>`, text: params.body,
        });
        if (error) return { sent: false, error: error.message };
        await logFollowUpAction(params.dealId, 'email_sent', 'email', `Sent via Aion: ${params.subject}`, params.body);
        return { sent: true, to: params.to };
      } catch (err) {
        return { sent: false, error: err instanceof Error ? err.message : 'Email send failed' };
      }
    },
  });

  return {
    create_deal, update_deal_status, update_deal_fields,
    recommend_crew, assign_crew, confirm_crew, update_crew_dispatch,
    search_catalog, create_proposal, publish_proposal,
    send_follow_up_email,
  };
}
