'use client';

/**
 * Remove a connection, and let the user put it back.
 *
 * The page used to carry a bottom-of-page danger zone with a type-nothing
 * confirmation modal. Primer, which invented the danger zone, reserves it for
 * settings-level blast radius and puts a single record's delete in the header
 * overflow; both Primer and Carbon say the same thing about the modal, which is
 * that undo beats confirmation when the action is reversible. A confirmation
 * interrupts everyone and gets dismissed by habit; an undo protects the person
 * who erred without taxing the person who did not.
 *
 * Ours is reversible: the delete is soft, the edge keeps a `deleted_at`, and
 * /network lists it under "Recently deleted" for thirty days. So the toast
 * carries the undo, and there is no modal.
 *
 * Not offered for roster members. `softDeleteGhostRelationship` only matches
 * VENDOR / VENUE_PARTNER / CLIENT / PARTNER edges, so a ROSTER_MEMBER would get
 * "Relationship not found" — removing someone from your staff is a different
 * operation and does not belong behind the same word.
 *
 * @module app/network/entity/use-connection-delete
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  softDeleteGhostRelationship,
  restoreGhostRelationship,
} from '@/features/network-data';

export interface UseConnectionDeleteOptions {
  /** The edge to remove. Null when this record has none, which disables the action. */
  relationshipId: string | null;
  sourceOrgId: string;
  returnPath: string;
  /** Named in the toast, so the undo says what it is putting back. */
  name: string;
  /** "Removed from preferred." reads better than "Connection removed." for crew. */
  removedMessage?: string;
}

export function useConnectionDelete({
  relationshipId,
  sourceOrgId,
  returnPath,
  name,
  removedMessage,
}: UseConnectionDeleteOptions): (() => void) | undefined {
  const router = useRouter();

  const remove = React.useCallback(() => {
    if (!relationshipId) return;
    void (async () => {
      const result = await softDeleteGhostRelationship(relationshipId, sourceOrgId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not remove this connection.');
        return;
      }
      // Leave first, then offer the undo. Carbon's rule for a completed delete:
      // return to the list and say what happened there, rather than leaving the
      // user on a record that no longer exists.
      router.push(returnPath);
      router.refresh();
      toast.success(removedMessage ?? `${name} removed.`, {
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () => {
            void (async () => {
              const undone = await restoreGhostRelationship(relationshipId, sourceOrgId);
              if (undone.ok) {
                toast.success(`${name} restored.`);
                router.refresh();
              } else {
                toast.error(undone.error ?? 'Could not restore. Try Recently deleted on Network.');
              }
            })();
          },
        },
      });
    })();
  }, [relationshipId, sourceOrgId, returnPath, name, removedMessage, router]);

  return relationshipId ? remove : undefined;
}
