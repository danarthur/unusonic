/**
 * Phase 2 magic-link sign-in email template — rendering contract.
 *
 * We don't snapshot the full HTML (that locks the CSS into every patch);
 * we instead assert the load-bearing pieces:
 *   - HTML renders without throwing.
 *   - Plain-text round-trip contains the magic link URL, the target email,
 *     the expiry window, and the sender attribution.
 *   - Subject/preview string the sender relies on appears in the HTML.
 *   - Device-aware copy changes with `requestedFromUserAgentClass` so the
 *     sender's UA-class wiring is covered.
 */

import { describe, it, expect } from 'vitest';
import { render, toPlainText } from '@react-email/render';
import { MagicLinkSignInEmail } from '../MagicLinkSignInEmail';

const MAGIC = 'https://unusonic.com/auth/verify?token=abc123';
const EMAIL = 'user@example.com';

describe('MagicLinkSignInEmail', () => {
  it('renders HTML without throwing and carries the preview string', async () => {
    const html = await render(
      MagicLinkSignInEmail({ magicLinkUrl: MAGIC, targetEmail: EMAIL }),
    );
    expect(html).toContain('Your sign-in link for Unusonic');
    expect(html).toContain(MAGIC);
  });

  it('plain-text output contains all load-bearing tokens', async () => {
    const html = await render(
      MagicLinkSignInEmail({ magicLinkUrl: MAGIC, targetEmail: EMAIL }),
    );
    const text = toPlainText(html);

    // URL, sender, target address, and expiry minutes all reach the plain path.
    expect(text).toContain(MAGIC);
    expect(text).toContain(EMAIL);
    expect(text).toMatch(/60 minutes/);
    expect(text).toContain('Unusonic');
  });

  it('honors a custom expiresMinutes override', async () => {
    const html = await render(
      MagicLinkSignInEmail({
        magicLinkUrl: MAGIC,
        targetEmail: EMAIL,
        expiresMinutes: 15,
      }),
    );
    // react-email interpolates numbers with a sibling HTML comment
    // (`...15<!-- --> minutes...`), so we assert on the plain-text
    // projection where that artifact is gone.
    const text = toPlainText(html);
    expect(text).toMatch(/15 minutes/);
    expect(text).not.toMatch(/60 minutes/);
  });

  it('falls back to 60 minutes when expiresMinutes is invalid', async () => {
    const html = await render(
      MagicLinkSignInEmail({
        magicLinkUrl: MAGIC,
        targetEmail: EMAIL,
        // Runtime guard check: NaN (no compile error — prop accepts
        // number — but the template normalizes it to the default).
        expiresMinutes: Number.NaN,
      }),
    );
    const text = toPlainText(html);
    expect(text).toMatch(/60 minutes/);
  });

  it('emits a different device line for each UA class bucket', async () => {
    const ios = await render(
      MagicLinkSignInEmail({
        magicLinkUrl: MAGIC,
        targetEmail: EMAIL,
        requestedFromUserAgentClass: 'ios',
      }),
    );
    const windows = await render(
      MagicLinkSignInEmail({
        magicLinkUrl: MAGIC,
        targetEmail: EMAIL,
        requestedFromUserAgentClass: 'windows',
      }),
    );
    const generic = await render(
      MagicLinkSignInEmail({
        magicLinkUrl: MAGIC,
        targetEmail: EMAIL,
      }),
    );

    expect(ios).toContain('iPhone');
    expect(windows).toContain('Windows PC');
    expect(generic).toContain('the same device');
    expect(ios).not.toContain('Windows PC');
    expect(windows).not.toContain('iPhone');
  });

  it('snapshots the default render for regression safety', async () => {
    const html = await render(
      MagicLinkSignInEmail({
        magicLinkUrl: MAGIC,
        targetEmail: EMAIL,
      }),
    );
    expect(html).toMatchSnapshot();
  });
});
