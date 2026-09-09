/**
 * Naming two people as one client.
 *
 * "Jane & Marcus Okafor" is derivable. "Jane Okafor & Marcus Bell" is a choice
 * about whose name comes first, and no rule settles it -- Blackbaud cannot even
 * express "same surname → format A, different → format B" and makes a human
 * pick between two saved formats.
 *
 * So this derives, and derives only. It is deliberately NOT stored anywhere.
 * NPSP caches its household name and then ships a Refresh batch that
 * "overwrites custom entries with no undo capability" -- the whole failure mode
 * comes from having a copy that can drift from the people it describes. Two
 * live entities are the source; compute from them every time and there is
 * nothing to go stale and nothing to stomp.
 *
 * This existed twice already -- once in the create-show modal, once in its cast
 * summary -- which is how two copies of a rule start disagreeing.
 *
 * @module entities/network/model/couple-name
 */

export type NamedPerson = {
  firstName?: string | null;
  lastName?: string | null;
};

function fullName(person: NamedPerson): string {
  return [person.firstName?.trim(), person.lastName?.trim()].filter(Boolean).join(' ');
}

/**
 * Both people as one string, collapsing a shared surname.
 *
 * Returns '' when neither has a first name -- a pair of surnames is not a name
 * anyone would recognise, and an empty string lets the caller fall back to
 * whatever it would have shown anyway.
 */
/**
 * Case-insensitive, because "OKAFOR" and "Okafor" are one family, not two.
 * Two blanks are not a shared surname.
 */
function shareSurname(a: NamedPerson, b: NamedPerson): boolean {
  const aLast = a.lastName?.trim() ?? '';
  const bLast = b.lastName?.trim() ?? '';
  return Boolean(aLast) && Boolean(bLast) && aLast.toLowerCase() === bLast.toLowerCase();
}

export function coupleDisplayName(a: NamedPerson, b: NamedPerson): string {
  const aFirst = a.firstName?.trim() ?? '';
  const bFirst = b.firstName?.trim() ?? '';

  if (!aFirst && !bFirst) return '';

  // The surname is said once when it is shared.
  if (shareSurname(a, b)) {
    return `${aFirst} & ${bFirst} ${a.lastName?.trim() ?? ''}`.replace(/\s+/g, ' ').trim();
  }

  return [fullName(a), fullName(b)].filter(Boolean).join(' & ');
}

/**
 * Split a stored display name into first and last.
 *
 * Everything before the final space is the given name, which keeps "Mary Jane"
 * and "van der Berg" intact more often than splitting on the first space would.
 * A single word is a first name -- someone with one name has a first name, not
 * a surname.
 */
export function splitDisplayName(displayName: string | null | undefined): NamedPerson {
  const trimmed = displayName?.trim() ?? '';
  if (!trimmed) return { firstName: '', lastName: '' };
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return { firstName: trimmed, lastName: '' };
  return {
    firstName: trimmed.slice(0, lastSpace),
    lastName: trimmed.slice(lastSpace + 1),
  };
}
