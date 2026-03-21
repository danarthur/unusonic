/**
 * Canonical display labels for contact-related fields.
 * Use these whenever a contact field is shown (CRM, network crew, ION roster, Genesis, search).
 * Keeps labels consistent across the site when fields are "called" for display.
 */

export const CONTACT_FIELD_LABELS: Record<string, string> = {
  // Person (contacts + org_members)
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  job_title: 'Job title',
  role: 'Role',
  avatar_url: 'Avatar',

  // Org-level (when shown in contact/org context)
  name: 'Name',
  website: 'Website',
  support_email: 'Support email',
  logo_url: 'Logo',
  address: 'Address',
  doing_business_as: 'Doing business as',
  category: 'Category',
} as const;

export type ContactFieldKey = keyof typeof CONTACT_FIELD_LABELS;

/**
 * Returns the display label for a contact field key.
 * Use when rendering a contact field so labels are consistent everywhere.
 */
export function getContactFieldLabel(key: string): string {
  return CONTACT_FIELD_LABELS[key] ?? key.replace(/_/g, ' ');
}
