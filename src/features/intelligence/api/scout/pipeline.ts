/**
 * Scout pipeline — internal orchestrator. Fetches HTML, harvests JSON-LD/meta/
 * deterministic contact info, runs sub-agents (contact, identity, classification,
 * roster) in parallel, then merges into a ScoutResult.
 * @module features/intelligence/api/scout/pipeline
 */

import 'server-only';
import * as cheerio from 'cheerio';
import {
  getOpenAI,
  isValidPhone,
  normalizeUrl,
  parseJsonLdAddress,
  resolveTags,
} from './utils';
import {
  scoutContactAgent,
  scoutIdentityAgent,
  scoutClassificationAgent,
} from './sub-agents';
import { rosterHunter } from './roster-hunter';
import type { ScoutPipelineResult } from './types';

/**
 * Internal pipeline: run scout with a given existingTags list (for tag resolution).
 * Used by scoutEntity (with org context) and scoutEntityForOnboarding (empty tags).
 */
export async function runScoutPipeline(
  url: string,
  existingTags: string[],
  debug: boolean
): Promise<ScoutPipelineResult> {
  try {
    const openai = getOpenAI();
    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 18000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'UnusonicOS/1.0 (B2B Operating System; +https://unusonic.com)' },
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
    const msg = err instanceof Error ? err.message : 'Connection lost. Target scrambled.';
    return { error: msg };
  }
}
