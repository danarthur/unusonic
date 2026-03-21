/* eslint-disable no-restricted-syntax -- TODO: migrate entity attrs reads to readEntityAttrs() from @/shared/lib/entity-attrs */
/**
 * Signal Scout v3 — Sub-Agent Architecture (One-Way Mirror)
 * Fetches HTML, runs focused sub-agents (Contact, Identity, Classification),
 * Master validates/merges and presents. Fixes context overload and missed extractions.
 *
 * IMAGE HANDLING (Legal / Best Practice):
 * - Extract and store URL strings only (avatarUrl, logoUrl). Never download or re-host images.
 * - Render via <img src={url} /> so the browser fetches from source (hotlinking).
 * - User clicks Apply to save roster — that consent moment is when we persist avatar_url.
 * - Blank state uses initials avatar. Avoids storing biometric data without consent.
 * @module features/intelligence/api/scout
 */

'use server';

import 'server-only';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { createClient } from '@/shared/api/supabase/server';
import { getCurrentOrgId } from '@/features/network/api/actions';

/** Options for scoutEntity (authenticated, has org) vs scoutEntityForOnboarding (no org yet). */
type ScoutOptions = { debug?: boolean; forOnboarding?: boolean };

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'OpenAI API key not configured. Add OPENAI_API_KEY to your .env.local and restart the dev server.'
    );
  }
  return new OpenAI({ apiKey: key });
}

function normalizeUrl(baseUrl: string, relativeUrl?: string | null): string {
  if (!relativeUrl?.trim()) return '';
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch {
    return '';
  }
}

/** Get img URL: src, data-src, data-lazy-src, data-original, or first URL from srcset. */
function getImgSrc($img: { attr(name: string): string | undefined }, baseUrl: string): string | null {
  const tryUrl = (raw: string | undefined): string | null => {
    if (!raw?.trim()) return null;
    const url = normalizeUrl(baseUrl, raw);
    return url && /^https?:\/\//.test(url) ? url : null;
  };
  const src =
    tryUrl($img.attr('src')) ||
    tryUrl($img.attr('data-src')) ||
    tryUrl($img.attr('data-lazy-src')) ||
    tryUrl($img.attr('data-original'));
  if (src) return src;
  const srcset = $img.attr('srcset');
  if (srcset) {
    const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
    if (first) return tryUrl(first) || null;
  }
  return null;
}

// --- ROSTER HUNTER: Team Finder Sub-Agent (DOM Clustering + Bloodhound) ---

const BLOODHOUND_KEYWORDS: { word: string; weight: number }[] = [
  { word: 'leadership', weight: 10 },
  { word: 'team', weight: 9 },
  { word: 'our people', weight: 8 },
  { word: 'crew', weight: 7 },
  { word: 'staff', weight: 6 },
  { word: 'who we are', weight: 6 },
  { word: 'people', weight: 5 },
  { word: 'about', weight: 3 },
];

/** Level 1: Bloodhound – find the best team page. Scores links, fetches top target. Second-level scan on /about for team sub-links. */
async function getTeamPageHtml(
  baseUrl: string,
  homeHtml: string,
  signal?: AbortSignal
): Promise<{ html: string; url: string }> {
  const $ = cheerio.load(homeHtml);
  const foundLinks: { url: string; score: number }[] = [];

  const scoreByUrl = new Map<string, number>();
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto') || href.startsWith('tel')) return;
    const full = normalizeUrl(baseUrl, href);
    if (!full) return;
    try {
      const parsed = new URL(full);
      if (parsed.origin !== new URL(baseUrl).origin) return;
      const text = $(el).text().toLowerCase().trim();
      const hrefLower = href.toLowerCase();

      let score = 0;
      for (const k of BLOODHOUND_KEYWORDS) {
        if (text.includes(k.word)) score += k.weight;
        if (hrefLower.includes(k.word.replace(/\s/g, '-'))) score += k.weight;
        if (hrefLower.includes(k.word.replace(/\s/g, ''))) score += k.weight;
      }
      if (score > 0) {
        const prev = scoreByUrl.get(full) ?? 0;
        scoreByUrl.set(full, Math.max(prev, score));
      }
    } catch {
      /* skip */
    }
  });

  let candidates = [...scoreByUrl.entries()].map(([url, score]) => ({ url, score }));
  if (candidates.length === 0) {
    const base = new URL(baseUrl);
    candidates = ['/about', '/team', '/our-team', '/people', '/leadership'].map((p) => ({
      url: `${base.origin}${p}`,
      score: 5,
    }));
  }
  candidates.sort((a, b) => b.score - a.score);

  const top = candidates[0];
  if (top && top.url !== baseUrl && top.score >= 5) {
    try {
      const res = await fetch(top.url, {
        signal,
        headers: { 'User-Agent': 'SignalOS/1.0 (B2B Operating System; +https://signal.com)' },
      });
      if (res.ok) {
        const html = await res.text();
        const $sub = cheerio.load(html);
        const path = new URL(top.url).pathname.toLowerCase();
        if (path.includes('about') && !path.includes('team') && !path.includes('leadership')) {
          const teamSubLinks: { url: string; score: number }[] = [];
          $sub('a[href]').each((_i, el) => {
            const h = $sub(el).attr('href');
            if (!h || h.startsWith('#') || h.startsWith('mailto') || h.startsWith('tel')) return;
            const fullUrl = normalizeUrl(top.url, h);
            if (!fullUrl) return;
            try {
              const p = new URL(fullUrl);
              if (p.origin !== new URL(top.url).origin) return;
              const t = $sub(el).text().toLowerCase().trim();
              let s = 0;
              for (const k of BLOODHOUND_KEYWORDS) {
                if (t.includes('team') || t.includes('leadership') || t.includes('people')) s += k.weight;
              }
              if (s > 0) teamSubLinks.push({ url: fullUrl, score: s });
            } catch {
              /* skip */
            }
          });
          teamSubLinks.sort((a, b) => b.score - a.score);
          if (teamSubLinks.length > 0) {
            const subRes = await fetch(teamSubLinks[0].url, {
              signal,
              headers: { 'User-Agent': 'SignalOS/1.0 (B2B Operating System; +https://signal.com)' },
            });
            if (subRes.ok) return { html: await subRes.text(), url: teamSubLinks[0].url };
          }
        }
        return { html, url: top.url };
      }
    } catch {
      /* fallback to home */
    }
  }

  return { html: homeHtml, url: baseUrl };
}

/** Level 2: Cluster Scanner – find repeating patterns (Image + Name + Title) in DOM. */
function extractCandidateNodes($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const byKey = new Map<string, { block: string; hasImg: boolean }>();

  const add = (block: string, text: string, imgUrl: string | null) => {
    const key = text.slice(0, 60) + text.slice(-20);
    const hasImg = !!imgUrl;
    const existing = byKey.get(key);
    if (!existing || (hasImg && !existing.hasImg)) {
      byKey.set(key, {
        block: imgUrl ? `[HAS_IMAGE_URL: ${imgUrl}] ${text}` : text,
        hasImg,
      });
    }
  };

  const selector = `div[class*="member"], div[class*="profile"], div[class*="card"], div[class*="person"], div[class*="employee"], div[class*="bio"], div[class*="se-"], div[class*="about"], div[class*="people"], article[class*="member"], article[class*="profile"], li[class*="member"], li[class*="profile"]`;

  const matches: { text: string; imgUrl: string | null }[] = [];
  $(selector).each((_i, el) => {
    const $el = $(el);
    const hasMatchingChild = $el.find(selector).length > 0;
    if (hasMatchingChild) return;
    const imgs = $el.find('img');
    if (imgs.length > 1) return;
    const node = $el.clone();
    node.find('svg, script, style, iframe').remove();
    const text = node.text().replace(/\s+/g, ' ').trim();
    if (text.length < 12 || text.length > 900) return;
    const imgUrl = getImgSrc(node.find('img').first(), baseUrl);
    matches.push({ text, imgUrl });
  });

  matches.sort((a, b) => a.text.length - b.text.length);
  for (const m of matches) add(m.text, m.text, m.imgUrl);

  $('img').each((_i, el) => {
    const $el = $(el);
    const parent = $el.parent();
    if (parent.find('img').length > 1) return;
    const text = parent.text().replace(/\s+/g, ' ').trim();
    const hasHeaders = parent.find('h3, h4, h5, h2, strong').length > 0;
    if (text.length >= 8 && text.length <= 450 && (hasHeaders || text.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/))) {
      const imgUrl = getImgSrc($el, baseUrl);
      add(text, text, imgUrl);
    }
  });

  $('[class*="team"], [class*="staff"], [class*="leadership"], [class*="about"], [class*="people"]').each((_i, container) => {
    const $container = $(container);
    const directChildren = $container.children('div, article, li, section').filter((_j, c) => {
      const $c = $(c);
      return $c.find('img').length > 0 && ($c.find('h2, h3, h4, h5, strong').length > 0 || $c.text().trim().length > 15);
    });
    let toProcess = directChildren;
    if (directChildren.length < 2) {
      const nested = $container.find('div, article, li').filter((_j, c) => {
        const $c = $(c);
        if ($c.find(selector).length > 0) return false;
        return $c.find('img').length === 1 && $c.text().trim().length >= 10 && $c.text().trim().length <= 500;
      });
      toProcess = nested;
    }
    if (toProcess.length >= 1) {
      const byTextLen: Array<{ text: string; imgUrl: string | null }> = [];
      toProcess.each((_j, c) => {
        const $c = $(c).clone();
        $c.find('svg, script, style, iframe').remove();
        const text = $c.text().replace(/\s+/g, ' ').trim();
        if (text.length < 8 || text.length > 550) return;
        const imgUrl = getImgSrc($c.find('img').first(), baseUrl);
        byTextLen.push({ text, imgUrl });
      });
      byTextLen.sort((a, b) => a.text.length - b.text.length);
      for (const { text, imgUrl } of byTextLen) {
        const isParentOfShorter = byTextLen.some((o) => o.text.length < text.length && text.includes(o.text));
        if (isParentOfShorter) continue;
        add(text, text, imgUrl);
      }
    }
  });

  if (byKey.size === 0) {
    const fallbackSel = '[class*="team"], [class*="staff"], [class*="about"], [class*="people"]';
    $(fallbackSel).each((_i, container) => {
      $(container).find('div, section, article').each((_j, el) => {
        const $el = $(el);
        const imgs = $el.find('img');
        if (imgs.length !== 1) return;
        const text = $el.text().replace(/\s+/g, ' ').trim();
        if (text.length < 15 || text.length > 400) return;
        if ($el.children('div, section, article').length > 6) return;
        const imgUrl = getImgSrc($el.find('img').first(), baseUrl);
        add(text, text, imgUrl);
      });
    });
  }

  const candidates = [...byKey.values()].map((v) => v.block);
  if (candidates.length === 0) {
    $('nav, footer, script, style, iframe').remove();
    const body = $('body').text().replace(/\s+/g, ' ').trim();
    if (body.length > 100) candidates.push(body.substring(0, 12000));
  }

  return candidates.slice(0, 50);
}

function isValidPhone(digits: string): boolean {
  if (!digits || digits.length < 10) return false;
  const d = digits.replace(/\D/g, '');
  if (d.length < 10) return false;
  if (d.startsWith('0')) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  const zeroCount = (d.match(/0/g) || []).length;
  if (zeroCount >= d.length - 1) return false;
  if (/^0123456789$|^1234567890$|^9876543210$/.test(d.slice(-10))) return false;
  return true;
}

const CANONICAL_ROLES: Record<string, string[]> = {
  CEO: ['ceo', 'chief executive', 'chief exec', 'principal', 'founder', 'owner'],
  COO: ['coo', 'chief operating', 'operations director'],
  President: ['president'],
  VP: ['vice president', ' vp ', 'evp', 'svp'],
  Director: ['director', 'head of'],
  Producer: ['producer', 'executive producer', 'lead producer', 'sr. producer', 'senior producer'],
  Manager: ['manager', 'managing'],
  Coordinator: ['coordinator', 'coordinating'],
  Designer: ['designer', 'creative director'],
  Engineer: ['engineer', 'technical director', ' td '],
  Lead: ['team lead', 'project lead', 'lead '],
  Specialist: ['specialist', 'senior ', 'sr. '],
};

function normalizeRoleFallback(title: string | null): string | null {
  if (!title || !title.trim()) return null;
  const t = title.toLowerCase().trim();
  for (const [canonical, variants] of Object.entries(CANONICAL_ROLES)) {
    if (variants.some((v) => t.includes(v))) return canonical;
  }
  return title.trim().length > 0 ? title.trim() : null;
}

function resolveTags(aiTags: string[], existingTags: string[]): string[] {
  const existingLower = new Map(existingTags.map((t) => [t.toLowerCase().trim(), t]));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of aiTags) {
    const t = tag?.trim();
    if (!t || t.length > 120) continue;
    const key = t.toLowerCase();
    const existing = existingLower.get(key);
    const use = existing ?? t;
    if (seen.has(use.toLowerCase())) continue;
    seen.add(use.toLowerCase());
    result.push(use);
  }
  return result;
}

export type ScoutRosterMember = {
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
};

export type ScoutResult = {
  name?: string | null;
  doingBusinessAs?: string | null;
  entityType?: 'organization' | 'single_operator' | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  website?: string | null;
  supportEmail?: string | null;
  phone?: string | null;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  } | null;
  tags?: string[] | null;
  roster?: ScoutRosterMember[] | null;
};

type ContactResult = { supportEmail?: string | null; phone?: string | null; address?: ScoutResult['address'] };
type IdentityResult = { name?: string | null; doingBusinessAs?: string | null; entityType?: string; brandColor?: string | null };
type ClassificationResult = { tags?: string[] | null };
type RosterResult = {
  roster?: ScoutRosterMember[];
  _debug?: {
    teamPageUrl: string;
    blockCount: number;
    blocksWithImage: number;
    blockAvatars: (string | null)[];
    blockPreviews: string[];
    allImgUrls?: string[];
    avatarPool?: string[];
    rosterOrder?: string[];
  };
};

/** Sub-agent: Contact extraction only. Small, focused prompt. */
async function scoutContactAgent(
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
async function scoutIdentityAgent(
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
async function scoutClassificationAgent(
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

import {
  assignAvatarsToRoster,
  buildAvatarDebug,
  parseAvatarFromBlock,
} from './scout-roster-avatars';

/** Level 3: AI Analyst – extract team members. AI returns avatarUrl when present; fallback: parse from block. */
async function analyzeRoster(
  openai: OpenAI,
  blocks: string[],
  sourceUrl: string
): Promise<RosterResult> {
  if (blocks.length === 0) return { roster: [] };
  const blockAvatars = blocks.map(parseAvatarFromBlock);
  const promptContent = blocks.map((c, i) => `BLOCK ${i + 1}: ${c}`).join('\n---\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `Extract team members from website blocks. Each block typically has one person (name + optional title).

For each person:
- firstName, lastName (split full name)
- jobTitle: the role/title text from the block, or null if none
- normalizedRole: map to CEO, COO, President, VP, Director, Producer, Manager, Coordinator, Designer, Engineer, Specialist when jobTitle exists
- avatarUrl: when a block contains [HAS_IMAGE_URL: url], copy that exact url here. Otherwise null.

Output one entry per block in block order. Include everyone who looks like a real person (not "Support Team" or testimonials).
Return JSON: { "roster": [{ "firstName", "lastName", "jobTitle", "normalizedRole", "avatarUrl" }] }`,
      },
      {
        role: 'user',
        content: `Source: ${sourceUrl}\n\n${promptContent.substring(0, 22000)}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return { roster: [] };
  const parsed = JSON.parse(raw) as {
    roster?: Array<Record<string, unknown>> | Record<string, unknown>;
  };
  const rawRoster = Array.isArray(parsed?.roster)
    ? parsed.roster
    : parsed?.roster && typeof parsed.roster === 'object' && !Array.isArray(parsed.roster)
      ? [parsed.roster]
      : [];
  const avatarAssignments = assignAvatarsToRoster(blocks, rawRoster, blockAvatars);

  /** Normalize name from AI output (camelCase, snake_case, or single name field). */
  function pickName(entry: Record<string, unknown>): { firstName: string; lastName: string } {
    const first = (entry.firstName ?? entry.first_name) as string | undefined;
    const last = (entry.lastName ?? entry.last_name) as string | undefined;
    if (typeof first === 'string' && first.trim()) {
      return { firstName: first.trim(), lastName: (typeof last === 'string' ? last.trim() : '') || '' };
    }
    const name = (entry.name ?? entry.full_name ?? entry.fullName) as string | undefined;
    if (typeof name === 'string' && name.trim()) {
      const parts = name.trim().split(/\s+/);
      return { firstName: parts[0] ?? 'Contact', lastName: parts.slice(1).join(' ') ?? '' };
    }
    return { firstName: '', lastName: '' };
  }

  const roster: ScoutRosterMember[] = [];
  rawRoster.slice(0, 20).forEach((r, i) => {
    const entry = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const { firstName, lastName } = pickName(entry);
    if (!firstName) return;
    const rawTitle =
      (entry.jobTitle ?? entry.job_title ?? entry.role) != null &&
      typeof (entry.jobTitle ?? entry.job_title ?? entry.role) === 'string'
        ? String(entry.jobTitle ?? entry.job_title ?? entry.role).trim() || null
        : null;
    const normalizedRole =
      rawTitle && entry.normalizedRole != null && typeof entry.normalizedRole === 'string'
        ? String(entry.normalizedRole).trim() || null
        : null;
    const jobTitle = rawTitle
      ? (normalizedRole ?? normalizeRoleFallback(rawTitle) ?? rawTitle)
      : null;
    const avatarUrl =
      (typeof entry.avatarUrl === 'string' ? entry.avatarUrl.trim() || null : null) ??
      avatarAssignments[i]?.avatarUrl ??
      null;
    roster.push({ firstName, lastName, jobTitle, avatarUrl, email: null });
  });
  return { roster };
}

/** Roster Hunter – orchestrates Bloodhound → Cluster Scanner → AI Analyst. */
async function rosterHunter(
  openai: OpenAI,
  baseUrl: string,
  homeHtml: string,
  signal?: AbortSignal,
  debug?: boolean
): Promise<RosterResult> {
  const { html: teamPageHtml, url: teamPageUrl } = await getTeamPageHtml(baseUrl, homeHtml, signal);
  const $ = cheerio.load(teamPageHtml);
  $('script, style, iframe, svg, path').remove();
  const blocks = extractCandidateNodes($, teamPageUrl);
  if (blocks.length === 0) return { roster: [] };

  const result = await analyzeRoster(openai, blocks, teamPageUrl);

  if (debug) {
    const blockAvatars = blocks.map(parseAvatarFromBlock);
    const blocksWithImage = blockAvatars.filter(Boolean).length;
    result._debug = {
      teamPageUrl: teamPageUrl,
      blockCount: blocks.length,
      blocksWithImage,
      blockAvatars,
      blockPreviews: blocks.map((b) => (b.length > 120 ? b.slice(0, 117) + '...' : b)),
      ...(result.roster && buildAvatarDebug(blocks, result.roster, blockAvatars)),
    };
  }

  return result;
}

/** Parse JSON-LD address (string or object) into ScoutResult address. */
function parseJsonLdAddress(v: unknown): ScoutResult['address'] | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const parts = v.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    return { street: parts[0] || undefined, city: parts[1], country: parts[parts.length - 1] };
  }
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    const street = [o.streetAddress, o.street].find((x) => typeof x === 'string') as string | undefined;
    const city = [o.addressLocality, o.city].find((x) => typeof x === 'string') as string | undefined;
    const state = [o.addressRegion, o.state].find((x) => typeof x === 'string') as string | undefined;
    const postal = [o.postalCode, o.postal_code].find((x) => typeof x === 'string') as string | undefined;
    const country = [o.addressCountry, o.country].find((x) => typeof x === 'string') as string | undefined;
    if (street || city || state || postal || country) {
      return { street, city, state, postal_code: postal, country } as ScoutResult['address'];
    }
  }
  return null;
}

/**
 * Internal pipeline: run scout with a given existingTags list (for tag resolution).
 * Used by scoutEntity (with org context) and scoutEntityForOnboarding (empty tags).
 */
async function runScoutPipeline(
  url: string,
  existingTags: string[],
  debug: boolean
): Promise<
  | { success: true; data: ScoutResult; _debug?: RosterResult['_debug'] }
  | { error: string }
> {
  try {
    const openai = getOpenAI();
    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 18000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SignalOS/1.0 (B2B Operating System; +https://signal.com)' },
    });
    if (!response.ok) return { error: 'Could not access site.' };
    const html = await response.text();
    const $ = cheerio.load(html);

    // JSON-LD harvest
    let jsonLdData: Record<string, unknown> = {};
    const contactPointData: unknown[] = [];
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const raw = $(el).html();
        if (!raw) return;
        const json = JSON.parse(raw) as Record<string, unknown>;
        const type = json['@type'];
        const types = Array.isArray(type) ? type : type ? [type] : [];
        if (types.some((t) => ['Organization', 'LocalBusiness', 'Corporation'].includes(String(t)))) {
          jsonLdData = { ...jsonLdData, ...json };
        }
        const process = (obj: unknown) => {
          if (!obj || typeof obj !== 'object') return;
          const o = obj as Record<string, unknown>;
          if (o['@type'] === 'ContactPoint' || (Array.isArray(o['@type']) && (o['@type'] as string[]).includes('ContactPoint'))) {
            contactPointData.push(o);
          }
          if (o.contactPoint) (Array.isArray(o.contactPoint) ? o.contactPoint : [o.contactPoint]).forEach(process);
        };
        process(json);
        if (Array.isArray(json['@graph'])) (json['@graph'] as unknown[]).forEach(process);
      } catch {
        /* ignore */
      }
    });

    const meta = {
      title: $('meta[property="og:title"]').attr('content')?.trim() || $('title').text().trim(),
      description: $('meta[property="og:description"]').attr('content')?.trim() || $('meta[name="description"]').attr('content')?.trim() || '',
      image: $('meta[property="og:image"]').attr('content')?.trim() || null,
      themeColor: $('meta[name="theme-color"]').attr('content')?.trim() || null,
      icon: $('link[rel="apple-touch-icon"]').attr('href')?.trim() || $('link[rel="icon"]').attr('href')?.trim() || null,
    };

    $('script, style, iframe, svg, path').remove();
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
    const footerText = $('footer').text().replace(/\s+/g, ' ').trim();
    const copyrightMatch = $('footer').text().match(/©\s*\d{4}\s*([A-Za-z0-9\s.,&'-]+)/);
    const copyrightText = copyrightMatch?.[1]?.trim() ?? '';
    const h1Text = $('h1').first().text().trim();

    // Deterministic contact harvest
    const mailtos: string[] = [];
    $('a[href^="mailto:"]').each((_i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const addr = href.replace(/^mailto:/i, '').split(/[?&]/)[0]?.trim();
        if (addr && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) && !mailtos.includes(addr)) mailtos.push(addr);
      }
    });
    const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    const badDomains = /@(example\.com|domain\.com|email\.com|test\.com|yourdomain\.com|example\.org)/i;
    let m: RegExpExecArray | null;
    while ((m = emailRegex.exec(html)) !== null) {
      const e = m[0].toLowerCase();
      if (!mailtos.includes(e) && !badDomains.test(e) && e.length <= 80) mailtos.push(e);
    }
    const priorityPrefixes = ['info', 'hello', 'contact', 'booking', 'sales', 'support', 'team'];
    mailtos.sort((a, b) => {
      const ai = priorityPrefixes.findIndex((p) => a.startsWith(p + '@'));
      const bi = priorityPrefixes.findIndex((p) => b.startsWith(p + '@'));
      if (ai >= 0 && bi < 0) return -1;
      if (ai < 0 && bi >= 0) return 1;
      return ai - bi;
    });

    const tels: string[] = [];
    $('a[href^="tel:"]').each((_i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const digits = href.replace(/^tel:/i, '').replace(/\D/g, '');
        if (digits.length >= 10 && isValidPhone(digits) && !tels.some((t) => t.replace(/\D/g, '') === digits)) {
          tels.push(href.replace(/^tel:/i, '').trim());
        }
      }
    });
    const phoneRegex = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;
    const seenPhones = new Set(tels.map((t) => t.replace(/\D/g, '')));
    while ((m = phoneRegex.exec(html)) !== null) {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length >= 10 && isValidPhone(digits) && !seenPhones.has(digits)) {
        seenPhones.add(digits);
        tels.push(m[0].trim());
      }
    }

    const contactPoints = contactPointData.map((o) => {
      const r: { email?: string; telephone?: string } = {};
      if (typeof (o as Record<string, unknown>).email === 'string') r.email = (o as Record<string, unknown>).email as string;
      if (typeof (o as Record<string, unknown>).telephone === 'string') r.telephone = (o as Record<string, unknown>).telephone as string;
      return r;
    }).filter((cp) => cp.email || cp.telephone);

    const jsonLdContact = contactPointData.length ? JSON.stringify(contactPointData) : '';
    const jsonLdSummary = JSON.stringify({
      name: jsonLdData.name,
      email: jsonLdData.email,
      telephone: jsonLdData.telephone,
      address: jsonLdData.address,
    });

    // Run sub-agents in parallel (Roster Hunter runs Bloodhound → Cluster → AI internally)
    const [contactResult, identityResult, classificationResult, rosterResult] = await Promise.all([
      scoutContactAgent(openai, {
        targetUrl,
        html,
        mailtos,
        tels,
        contactPoints,
        jsonLdContact,
        footerText: footerText || cleanText.substring(0, 8000),
      }),
      scoutIdentityAgent(openai, {
        targetUrl,
        title: meta.title,
        h1Text,
        copyrightText,
        jsonLdSummary,
        bodySample: cleanText,
      }),
      scoutClassificationAgent(openai, { description: meta.description, bodySample: cleanText }),
      rosterHunter(openai, targetUrl, html, controller.signal, debug),
    ]);

    // MASTER: Validate, merge, format (existingTags passed in for resolution)
    // If no scraped evidence (no mailto, no tel:), do NOT trust JSON-LD or AI for contact.
    // Many themes ship placeholder schema (e.g. "0155240003") — only use when we found real links.
    const hasScrapedContact = mailtos.length > 0 || tels.length > 0;
    const supportEmail = hasScrapedContact
      ? (mailtos[0] ??
         contactPoints.find((cp) => cp.email)?.email ??
         (jsonLdData.email as string) ??
         contactResult.supportEmail ??
         null)
      : null;

    const phoneCandidates = hasScrapedContact
      ? [
          tels[0],
          contactPoints.find((cp) => cp.telephone)?.telephone,
          jsonLdData.telephone as string,
          contactResult.phone,
        ].filter((p): p is string => !!p && typeof p === 'string')
      : [];
    const phone = phoneCandidates.find((p) => isValidPhone(p.replace(/\D/g, ''))) ?? null;

    const address =
      parseJsonLdAddress(jsonLdData.address) ??
      contactResult.address ??
      null;

    const toHex = (v: string) => (v?.trim() && !v.startsWith('#') ? `#${v}` : v?.trim() || '');
    const isAchromatic = (c: string) => {
      const h = toHex(c).toLowerCase();
      if (!h || ['#000', '#000000', '#fff', '#ffffff'].includes(h)) return true;
      const mm = h.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
      if (!mm) return false;
      const [r, g, b] = mm.slice(1).map((x) => parseInt(x, 16));
      const avg = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      return avg < 40 || avg > 220 || sat < 30;
    };
    const aiColor = toHex((identityResult.brandColor as string) || '');
    const themeColor = toHex(meta.themeColor || '');
    const brandColor =
      aiColor && !isAchromatic(aiColor)
        ? aiColor
        : themeColor && !isAchromatic(themeColor)
          ? themeColor
          : '#1a1a2e';

    const jsonLdLogo =
      typeof jsonLdData.logo === 'string'
        ? jsonLdData.logo
        : jsonLdData.logo && typeof jsonLdData.logo === 'object' && 'url' in (jsonLdData.logo as object)
          ? (jsonLdData.logo as { url?: string }).url
          : null;
    let logoUrl = meta.image || jsonLdLogo || meta.icon || null;
    logoUrl = logoUrl ? normalizeUrl(targetUrl, logoUrl) : null;

    const entityType =
      identityResult.entityType === 'single_operator' ? 'single_operator' : 'organization';

    const roster = Array.isArray(rosterResult?.roster)
      ? rosterResult.roster.map((m) => ({
          ...m,
          avatarUrl: m.avatarUrl ? normalizeUrl(targetUrl, m.avatarUrl) || null : null,
        }))
      : null;

    const rosterDebug = rosterResult && '_debug' in rosterResult ? rosterResult._debug : undefined;
    if (debug && rosterDebug) {
      // eslint-disable-next-line no-console
      console.log('[Scout Debug]', JSON.stringify(rosterDebug, null, 2));
    }

    return {
      success: true,
      data: {
        name:
          (identityResult.name as string) ||
          (jsonLdData.name as string) ||
          meta.title ||
          h1Text ||
          null,
        doingBusinessAs: (identityResult.doingBusinessAs as string) ?? null,
        entityType,
        brandColor,
        logoUrl,
        website: targetUrl,
        supportEmail,
        phone,
        address,
        tags: Array.isArray(classificationResult.tags)
          ? resolveTags(classificationResult.tags, existingTags)
          : null,
        roster: roster?.length ? roster : null,
      },
      ...(rosterDebug && { _debug: rosterDebug }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signal lost. Target scrambled.';
    return { error: msg };
  }
}

export async function scoutEntity(
  url: string,
  options?: ScoutOptions
): Promise<
  | { success: true; data: ScoutResult; _debug?: RosterResult['_debug'] }
  | { error: string }
> {
  const debug = options?.debug ?? process.env.SCOUT_DEBUG === '1';
  const currentOrgId = await getCurrentOrgId();
  if (!currentOrgId) return { error: 'Unauthorized' };
  let existingTags: string[] = [];
  try {
    const supabase = await createClient();
    const { data: srcEnt } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('legacy_org_id', currentOrgId).maybeSingle();
    if (srcEnt?.id) {
      const { data } = await supabase
        .schema('cortex').from('relationships')
        .select('context_data')
        .eq('source_entity_id', srcEnt.id)
        .in('relationship_type', ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER']);
      existingTags = [...new Set(
        (data ?? []).flatMap((r) => ((r.context_data as Record<string, unknown>)?.tags as string[]) ?? [])
      )];
    }
  } catch {
    /* ignore */
  }
  return runScoutPipeline(url, existingTags, debug);
}

/**
 * Scout for onboarding: no org required. Use when user is setting up (e.g. website step).
 * Resolves tags against empty list. Caller must be authenticated (session).
 */
export async function scoutEntityForOnboarding(
  url: string,
  options?: { debug?: boolean }
): Promise<
  | { success: true; data: ScoutResult; _debug?: RosterResult['_debug'] }
  | { error: string }
> {
  const debug = options?.debug ?? process.env.SCOUT_DEBUG === '1';
  return runScoutPipeline(url, [], debug);
}
