/**
 * Roster Hunter — Bloodhound (find team page) → Cluster Scanner (extract candidate
 * blocks) → AI Analyst (parse names, titles, avatars). Orchestrates the three-stage
 * roster discovery pipeline.
 * @module features/intelligence/api/scout/roster-hunter
 */

import 'server-only';
import * as cheerio from 'cheerio';
import type OpenAI from 'openai';
import {
  assignAvatarsToRoster,
  buildAvatarDebug,
  parseAvatarFromBlock,
} from '../scout-roster-avatars';
import { getImgSrc, normalizeUrl, normalizeRoleFallback } from './utils';
import type { RosterResult, ScoutRosterMember } from './types';

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
        headers: { 'User-Agent': 'UnusonicOS/1.0 (B2B Operating System; +https://unusonic.com)' },
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
              headers: { 'User-Agent': 'UnusonicOS/1.0 (B2B Operating System; +https://unusonic.com)' },
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
export async function rosterHunter(
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
