/**
 * Splitting captured notes into what belongs on a profile and what belongs to
 * one show.
 *
 * @module widgets/network-detail/ui/capture-note-scope
 */

import type { EntityCapture } from '../api/get-entity-captures';

/**
 * "About" is anything that would change how you work with this entity next
 * time -- including things that happened on a single show. "Show notes" is the
 * narrow class true for one production and nothing else: times, running order,
 * song bans, headcounts, pronunciations.
 *
 * Unclassified (null) counts as About. The two error directions are not
 * symmetric: a logistics note left on the profile is visible noise that gets
 * fixed in a tap, while a judgement wrongly demoted is invisible and the
 * profile quietly stops telling the truth. So an unsure classifier lands here.
 */
export function partitionByScope(captures: EntityCapture[]): {
  about: EntityCapture[];
  show: EntityCapture[];
} {
  const about: EntityCapture[] = [];
  const show: EntityCapture[] = [];
  for (const c of captures) {
    (c.noteScope === 'show' ? show : about).push(c);
  }
  return { about, show };
}
