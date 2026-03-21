'use client';

import { motion } from 'framer-motion';
import type { GhostOrgPreview } from '../model/types';
import { claimGhostOrganizationBySlug } from '../api/actions';

interface GhostClaimCardProps {
  data: GhostOrgPreview;
  isPending?: boolean;
}

export function GhostClaimCard({ data, isPending }: GhostClaimCardProps) {
  const eventText =
    data.event_count === 0
      ? 'no past events yet'
      : data.event_count === 1
        ? '1 past event'
        : `${data.event_count} past events`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="w-full"
    >
      <div className="w-full rounded-2xl border border-ceramic/10 bg-ceramic/5 p-6 backdrop-blur-md">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neon-blue/20 font-bold text-neon-blue">
            {data.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-ceramic">Is this your team?</h3>
            <p className="mt-1 text-sm text-ceramic/50">
              We found a profile for <strong>{data.name}</strong> with {eventText}.
            </p>
          </div>
        </div>

        <form
          action={(formData: FormData): Promise<void> =>
            claimGhostOrganizationBySlug(undefined as unknown, formData).then(() => {})}
          className="mt-6"
        >
          <input type="hidden" name="slug" value={data.slug} />
          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-ceramic py-3 font-semibold text-obsidian transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Claiming…' : 'Yes, Claim This Profile'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
