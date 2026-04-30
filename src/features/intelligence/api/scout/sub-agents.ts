/**
 * Scout sub-agents — focused OpenAI extraction prompts for contact, identity,
 * and classification. Master pipeline runs these in parallel.
 * @module features/intelligence/api/scout/sub-agents
 */

import 'server-only';
import type OpenAI from 'openai';
import type { ContactResult, IdentityResult, ClassificationResult } from './types';

/** Sub-agent: Contact extraction only. Small, focused prompt. */
export async function scoutContactAgent(
  openai: OpenAI,
  ctx: {
    targetUrl: string;
    html: string;
    mailtos: string[];
    tels: string[];
    contactPoints: Array<{ email?: string; telephone?: string }>;
    jsonLdContact: string;
    footerText: string;
  }
): Promise<ContactResult> {
  const contactText = ctx.footerText.substring(0, 6000);
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You extract contact information ONLY. Return JSON with: supportEmail, phone, address (object: street, city, state, postal_code, country).

RULES:
- supportEmail: Primary contact email. Prefer info@, hello@, contact@, booking@. Return null if none found.
- phone: Main business phone. Formats: (555) 123-4567, 555-123-4567, +1 555 123 4567. NEVER return placeholders (0000000001, 1111111111, 1234567890). Return null if only placeholders.
- address: Parse into street, city, state, postal_code, country. Return null if cannot parse.`,
      },
      {
        role: 'user',
        content: `URL: ${ctx.targetUrl}

SCRAPED (use if valid):
Emails: ${ctx.mailtos.length ? ctx.mailtos.join(', ') : 'none'}
Phones: ${ctx.tels.length ? ctx.tels.join(', ') : 'none'}
JSON-LD contactPoint: ${ctx.jsonLdContact || 'none'}

Text (footer + contact areas):
${contactText}`,
      },
    ],
    response_format: { type: 'json_object' },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return {};
  return JSON.parse(raw) as ContactResult;
}

/** Sub-agent: Identity extraction only. Name, DBA, entity type, brand color. */
export async function scoutIdentityAgent(
  openai: OpenAI,
  ctx: {
    targetUrl: string;
    title: string;
    h1Text: string;
    copyrightText: string;
    jsonLdSummary: string;
    bodySample: string;
  }
): Promise<IdentityResult> {
  const bodySample = ctx.bodySample.substring(0, 6000);
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You extract identity ONLY. Return JSON with: name, doingBusinessAs, entityType, brandColor.

RULES:
- name: Primary brand (e.g. "Neon Velvet"). NOT generic descriptors like "Bay Area Events".
- doingBusinessAs: Legal entity from copyright/footer (e.g. "NV Productions LLC").
- entityType: "organization" or "single_operator".
- brandColor: Action color (buttons, links). Hex format. IGNORE black/white/grey. Return null if only achromatic.`,
      },
      {
        role: 'user',
        content: `URL: ${ctx.targetUrl}
Title: ${ctx.title}
H1: ${ctx.h1Text}
Copyright: ${ctx.copyrightText}
JSON-LD (relevant): ${ctx.jsonLdSummary}

Body sample:
${bodySample}`,
      },
    ],
    response_format: { type: 'json_object' },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return {};
  return JSON.parse(raw) as IdentityResult;
}

/** Sub-agent: Tags/capabilities only. */
export async function scoutClassificationAgent(
  openai: OpenAI,
  ctx: { description: string; bodySample: string }
): Promise<ClassificationResult> {
  const sample = (ctx.description + '\n\n' + ctx.bodySample).substring(0, 5000);
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You extract capability/industry tags ONLY. Return JSON with: tags (array of strings).

Examples: Production, Lighting, Catering, AV, Union, Event Planning, Venue, Vendor.
Return 3-8 relevant tags. Empty array if none found.`,
      },
      {
        role: 'user',
        content: sample || 'No content.',
      },
    ],
    response_format: { type: 'json_object' },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return {};
  return JSON.parse(raw) as ClassificationResult;
}
