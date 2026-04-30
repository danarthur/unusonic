/**
 * Scout shared utilities — OpenAI client, URL/image helpers, validation,
 * role normalization, tag resolution, JSON-LD address parsing.
 * @module features/intelligence/api/scout/utils
 */

import 'server-only';
import OpenAI from 'openai';
import type { ScoutResult } from './types';

export function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'OpenAI API key not configured. Add OPENAI_API_KEY to your .env.local and restart the dev server.'
    );
  }
  return new OpenAI({ apiKey: key });
}

export function normalizeUrl(baseUrl: string, relativeUrl?: string | null): string {
  if (!relativeUrl?.trim()) return '';
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch {
    return '';
  }
}

/** Get img URL: src, data-src, data-lazy-src, data-original, or first URL from srcset. */
export function getImgSrc(
  $img: { attr(name: string): string | undefined },
  baseUrl: string
): string | null {
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

export function isValidPhone(digits: string): boolean {
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

export function normalizeRoleFallback(title: string | null): string | null {
  if (!title || !title.trim()) return null;
  const t = title.toLowerCase().trim();
  for (const [canonical, variants] of Object.entries(CANONICAL_ROLES)) {
    if (variants.some((v) => t.includes(v))) return canonical;
  }
  return title.trim().length > 0 ? title.trim() : null;
}

export function resolveTags(aiTags: string[], existingTags: string[]): string[] {
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

/** Parse JSON-LD address (string or object) into ScoutResult address. */
export function parseJsonLdAddress(v: unknown): ScoutResult['address'] | null {
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
