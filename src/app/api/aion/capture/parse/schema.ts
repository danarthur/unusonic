/**
 * What the capture parser returns.
 *
 * Lifted out of the route, which had grown past three times its line budget as
 * each new extracted fact -- the production link, the note scope, the rate --
 * brought its own field and its own description with it. The descriptions are
 * the feature here: they are what the model is actually instructed by, so they
 * are long on purpose.
 *
 * @module app/api/aion/capture/parse/schema
 */

import { z } from 'zod';

export const CaptureParseSchema = z.object({
  entity: z
    .object({
      type: z.enum(['person', 'company', 'venue', 'ambiguous']),
      name: z.string().describe('The person, company, or venue name as spoken in the transcript'),
      matched_entity_id: z
        .string()
        .nullable()
        .describe(
          'If a workspace entity in the provided list matches with high confidence, return its id. Otherwise null.',
        ),
      new_entity_proposal: z
        .object({
          name: z.string(),
          type: z.enum(['person', 'company', 'venue']),
          role_hint: z
            .string()
            .nullable()
            .describe('Any role/title mentioned (e.g. "GM", "event planner"). Null if none or if venue.'),
          organization_hint: z
            .string()
            .nullable()
            .describe('Any company/venue affiliation mentioned. Null if none.'),
        })
        .nullable()
        .describe('Only populate when matched_entity_id is null — this becomes a ghost entity.'),
      match_candidates: z
        .array(
          z.object({
            entity_id: z.string(),
            name: z.string(),
            confidence: z.number(),
          }),
        )
        .describe(
          'Candidate existing entities when the LLM is unsure. Also populated server-side after an ILIKE fallback match. The review card shows these as picker buttons when `matched_entity_id` is null. Empty array when no plausible candidates.',
        ),
    })
    .nullable()
    .describe('Null if the transcript names no person or company at all.'),

  follow_up: z
    .object({
      text: z.string().describe('A concise reminder for the user, not a message to send.'),
      suggested_channel: z.enum(['call', 'email', 'sms', 'unspecified']),
      suggested_when: z
        .string()
        .nullable()
        .describe('ISO 8601 date or null. Convert relative phrases like "next Monday" if clear.'),
    })
    .nullable()
    .describe('Null if the transcript does not imply a follow-up action.'),

  note: z
    .string()
    .nullable()
    .describe(
      'A short fact about the entity (role, context, preference, quirk, or a detail about one production). Null if none. Do NOT restate information already captured by the entity identity (the name, the organization the entity belongs to, or the role the entity already has) — that would be redundant with the Who field. Focus on what this capture adds beyond identity. Use note_scope to say which kind of fact it is.',
    ),

  note_scope: z
    .enum(['about', 'show'])
    .nullable()
    .describe(
      'Where this note belongs. "show" ONLY when the note is true for one production and nothing else — times, running order, song requests or bans, room layout, headcounts, name pronunciations, meal counts. "about" when it would change how you work with this entity next time, including things that happened on one show ("showed up two hours late", "stayed late when the cake was delayed"). Null when unsure. Null and "about" both render on the profile, so an unsure guess costs nothing; a wrong "show" hides something the user needed.',
    ),

  linked_production: z
    .object({
      kind: z.enum(['deal', 'event']),
      id: z.string().describe(
        'Must be one of the ids from the provided list (deals or events). Do not invent.',
      ),
      title: z.string().nullable().describe(
        'The display title of the matched production — server-replaces this with the canonical title after validation. Can be null; LLM may leave empty.',
      ),
    })
    .nullable()
    .describe(
      'When the transcript mentions a specific production ("Ally Emily wedding", "the Hilton gig"), pick the matching deal OR event from the provided lists. Null when no production is mentioned or no match is confident.',
    ),

  rate: z
    .object({
      amount: z.number().describe('The number spoken, e.g. 450 for "four fifty". Dollars.'),
      unit: z
        .string()
        .nullable()
        .describe(
          'What the rate buys, in their words, short: "4 hrs", "day", "hr". Null when not stated. A bare number is ambiguous, so do not invent a unit that was not said.',
        ),
      note: z
        .string()
        .nullable()
        .describe(
          'Any condition attached, verbatim and short (≤80 chars): "500 if over an hour drive", "plus gear". Null when none.',
        ),
    })
    .nullable()
    .describe(
      'What this PERSON costs to book, when the transcript states it plainly ("Marcus is four fifty for a four hour"). Null otherwise, which is most captures. Do NOT populate from a price the client is paying, from an invoice or an amount owed, or from a venue fee — this is only what we pay this person to work. When unsure whether the number is their rate or someone else\'s, return null.',
    ),

  venue_facts: z
    .object({
      load_in_notes: z
        .string()
        .nullable()
        .describe('How you get gear in: door, dock, stairs, which entrance. Verbatim and short.'),
      parking_notes: z.string().nullable().describe('Where to park, and anything that makes it hard.'),
      power_notes: z
        .string()
        .nullable()
        .describe('Where power is and what is on it, e.g. "only two circuits by the head table".'),
      curfew: z.string().nullable().describe('Hard stop time, e.g. "11:00 PM". Null unless stated.'),
      capacity: z.number().nullable().describe('Headcount the room holds. Null unless stated as a number.'),
      access_notes: z.string().nullable().describe('Anything else about getting in or moving around.'),
      venue_contact_name: z.string().nullable().describe('The house contact, when named.'),
      venue_contact_phone: z.string().nullable().describe('Their number, when spoken.'),
    })
    .nullable()
    .describe(
      'Standing facts about a VENUE -- the things asked at every venue, every time. Only populate when the capture is about a venue and the transcript states the fact plainly. Null for people and companies, and null for anything true of one show rather than of the room ("cocktail hour is outside if it is dry" is a show note, not a venue fact).',
    ),

  working_notes_signals: z
    .object({
      communication_style: z
        .string()
        .nullable()
        .describe(
          'A DURABLE communication preference about the person (how to contact them, their style, quirks). ≤100 chars, lowercase imperative ("prefers text over email", "anxious about audio — over-confirm", "decisive, skip the long pitch"). Null when the transcript does not state one. Do NOT invent; only populate when the transcript explicitly signals a preference.',
        ),
      dnr_reason: z
        .enum(['paid_late', 'unreliable', 'abuse', 'contractual', 'other'])
        .nullable()
        .describe(
          'When the transcript explicitly flags this person as do-not-rebook / avoid / blacklist / never work with again, choose the closest reason. Null when the transcript does not flag them.',
        ),
      dnr_note: z
        .string()
        .nullable()
        .describe(
          'Free-text justification for the DNR flag (≤120 chars). Only set when dnr_reason is set. Null otherwise.',
        ),
      preferred_channel: z
        .enum(['call', 'email', 'sms'])
        .nullable()
        .describe(
          'The channel the person prefers for contact. Only set when the transcript EXPLICITLY says so ("just text her", "call only, no email"). Null when no explicit preference is stated.',
        ),
    })
    .nullable()
    .describe(
      'Durable facts about how to work with this person. These populate the Working Notes card on the entity page. Return null when the transcript contains no working-notes signals (most captures will be null — only populate when signals are clear and explicit).',
    ),

  confidence: z
    .number()
    .describe(
      'A float from 0 to 1. Use ≥0.85 only when the entity match is unambiguous and the intent is clear. Below 0.5 when ambiguous or low signal. Drives whether the review card auto-saves or asks for review.',
    ),
});

export type CaptureParseResult = z.infer<typeof CaptureParseSchema>;
