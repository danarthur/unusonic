/**
 * Matching a contact against what was typed.
 *
 * WHY THIS IS SHARED
 * Three searches existed on the contacts page with two different match rules:
 * the roster and clients matched name, role and tags, while vendors, venues and
 * unsorted matched the NAME ONLY. So the same query found someone in one
 * section and missed them in another, and nothing anywhere searched a phone
 * number, an email, or the company someone works for -- although every one of
 * those is already on the node.
 *
 * That matters more than it sounds. Most visits to this page are looking for
 * somebody already known by name, and a directory that misses a name the user
 * is certain is there does not get a second chance: they go back to their
 * phone's contact list and never say why.
 *
 * MATCHING RULES
 * Tokens, not substrings: every word typed must appear somewhere, in any order,
 * so "jane brandi" finds Brandi Jane. Matching is generous on purpose -- a
 * false positive costs a glance, a false negative costs the feature.
 *
 * @module entities/network/model/search-node
 */

import type { NetworkNode } from './types';

/** Digits only, so "(555) 123-4567" and "5551234567" are the same number. */
function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/** Enough digits to be a phone fragment rather than an incidental number. */
const MIN_PHONE_DIGITS = 3;

/**
 * Everything about a node worth matching against, lowercased.
 *
 * Employer and affiliate names are in here because that is how half of these
 * people are actually remembered -- "the planner at Pure Lavish" is a search
 * for Pure Lavish that has to return a person.
 */
function haystackOf(node: NetworkNode): string {
  const parts: (string | null | undefined)[] = [
    node.identity.name,
    node.identity.label,
    node.employer?.name,
    node.meta.email,
    node.meta.region,
    node.meta.market,
    ...(node.meta.tags ?? []),
    ...(node.crewRoles ?? []),
    ...(node.meta.capabilities ?? []),
    ...(node.affiliates ?? []).map((a) => a.name),
    ...(node.affiliates ?? []).map((a) => a.jobTitle),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Does this node match what was typed?
 *
 * An empty query matches everything, so callers can pass the raw input without
 * guarding first.
 */
export function matchesQuery(node: NetworkNode, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;

  const haystack = haystackOf(node);
  const phone = digitsOf(node.meta.phone ?? '');

  return trimmed.split(/\s+/).every((token) => {
    if (haystack.includes(token)) return true;

    // A typed number is almost certainly a phone fragment, and the separators
    // people type are never the separators that got stored.
    const typedDigits = digitsOf(token);
    return (
      typedDigits.length >= MIN_PHONE_DIGITS
      && phone.length > 0
      && phone.includes(typedDigits)
    );
  });
}

/** The matching subset, in the order given. */
export function filterNodes(nodes: NetworkNode[], query: string): NetworkNode[] {
  if (!query.trim()) return nodes;
  return nodes.filter((node) => matchesQuery(node, query));
}
