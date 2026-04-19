/**
 * Tests for the coarse User-Agent classifier.
 *
 * Verifies all six buckets and the iPadOS edge case where iPadOS
 * reports as "Macintosh" but carries a touch/mobile marker.
 */

import { describe, it, expect } from 'vitest';

import { classifyUserAgent } from '../classify-user-agent';

describe('classifyUserAgent', () => {
  describe('ios', () => {
    it('classifies iPhone Safari', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
      expect(classifyUserAgent(ua)).toBe('ios');
    });

    it('classifies iPad', () => {
      const ua =
        'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
      expect(classifyUserAgent(ua)).toBe('ios');
    });

    it('classifies iPod', () => {
      const ua = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)';
      expect(classifyUserAgent(ua)).toBe('ios');
    });

    it('classifies iPadOS masquerading as Macintosh with a Mobile marker', () => {
      // Modern iPadOS desktop-mode UA, shipping the mobile build marker.
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
      expect(classifyUserAgent(ua)).toBe('ios');
    });
  });

  describe('android', () => {
    it('classifies Chrome on Android phone', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.78 Mobile Safari/537.36';
      expect(classifyUserAgent(ua)).toBe('android');
    });

    it('classifies Firefox on Android tablet', () => {
      const ua = 'Mozilla/5.0 (Android 13; Tablet; rv:121.0) Gecko/121.0 Firefox/121.0';
      expect(classifyUserAgent(ua)).toBe('android');
    });
  });

  describe('mac', () => {
    it('classifies Safari on macOS', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
      expect(classifyUserAgent(ua)).toBe('mac');
    });

    it('classifies Chrome on macOS', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      expect(classifyUserAgent(ua)).toBe('mac');
    });
  });

  describe('windows', () => {
    it('classifies Chrome on Windows 11', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      expect(classifyUserAgent(ua)).toBe('windows');
    });

    it('classifies Edge on Windows', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
      expect(classifyUserAgent(ua)).toBe('windows');
    });
  });

  describe('linux', () => {
    it('classifies Firefox on Ubuntu', () => {
      const ua = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0';
      expect(classifyUserAgent(ua)).toBe('linux');
    });

    it('classifies Chrome on Chrome OS', () => {
      const ua =
        'Mozilla/5.0 (X11; CrOS x86_64 15329.58.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      expect(classifyUserAgent(ua)).toBe('linux');
    });
  });

  describe('other', () => {
    it('classifies empty string as other', () => {
      expect(classifyUserAgent('')).toBe('other');
    });

    it('classifies undefined as other', () => {
      expect(classifyUserAgent(undefined)).toBe('other');
    });

    it('classifies null as other', () => {
      expect(classifyUserAgent(null)).toBe('other');
    });

    it('classifies a non-browser UA as other', () => {
      expect(classifyUserAgent('curl/8.4.0')).toBe('other');
    });

    it('classifies unrecognized UA string as other', () => {
      expect(classifyUserAgent('CompletelyMadeUpAgent/1.0')).toBe('other');
    });
  });

  describe('ordering / precedence', () => {
    it('puts Android ahead of Linux even though Android UAs contain "Linux"', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8)';
      expect(classifyUserAgent(ua)).toBe('android');
    });

    it('puts iPad ahead of Mac for iPad UA fragments', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)';
      expect(classifyUserAgent(ua)).toBe('ios');
    });
  });
});
