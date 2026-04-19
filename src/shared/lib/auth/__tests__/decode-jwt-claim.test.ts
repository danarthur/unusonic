/**
 * Phase 4 — JWT claim decoder (no signature validation).
 *
 * The login page relies on this module to pre-fill the email field on
 * `/login?reason=session_expired`. Must never throw on malformed input.
 */

import { describe, it, expect } from 'vitest';
import {
  decodeJwtClaim,
  readEmailFromJwt,
} from '../decode-jwt-claim';

/**
 * Base64url-encode a JSON payload and wrap it as the middle segment of
 * a dummy three-part JWT. We do NOT sign anything — signature is not
 * validated by the decoder.
 */
function makeJwt(payload: unknown): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64url}.signature`;
}

describe('decodeJwtClaim', () => {
  it('returns the parsed payload for a well-formed token', () => {
    const token = makeJwt({ sub: 'u1', email: 'alice@example.com', exp: 1 });
    const claim = decodeJwtClaim(token);
    expect(claim).toEqual({ sub: 'u1', email: 'alice@example.com', exp: 1 });
  });

  it('returns null for a non-string input', () => {
    expect(decodeJwtClaim(undefined)).toBeNull();
    expect(decodeJwtClaim(null)).toBeNull();
    expect(decodeJwtClaim(42)).toBeNull();
    expect(decodeJwtClaim({})).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeJwtClaim('')).toBeNull();
  });

  it('returns null for a two-part (non-JWT) string', () => {
    expect(decodeJwtClaim('onlytwo.parts')).toBeNull();
  });

  it('returns null when the payload segment is not valid base64', () => {
    expect(decodeJwtClaim('header.!!!bad!!!.sig')).toBeNull();
  });

  it('returns null when the payload is not JSON', () => {
    const b64 = Buffer.from('not-json', 'utf8').toString('base64');
    const b64url = b64.replace(/=+$/, '');
    expect(decodeJwtClaim(`header.${b64url}.sig`)).toBeNull();
  });

  it('returns null when the payload JSON is an array or scalar', () => {
    const arr = Buffer.from('[1,2,3]', 'utf8').toString('base64').replace(/=+$/, '');
    expect(decodeJwtClaim(`header.${arr}.sig`)).toBeNull();

    const scalar = Buffer.from('42', 'utf8').toString('base64').replace(/=+$/, '');
    expect(decodeJwtClaim(`header.${scalar}.sig`)).toBeNull();
  });

  it('tolerates base64url with stripped padding', () => {
    // payload of length 10 → b64 length 16, no padding needed. Make a
    // payload where base64 padding would be required.
    const longPayload = { email: 'abc@example.com', extra: 'x' };
    const token = makeJwt(longPayload);
    const claim = decodeJwtClaim(token);
    expect(claim?.email).toBe('abc@example.com');
  });
});

describe('readEmailFromJwt', () => {
  it('returns the lowercased email claim', () => {
    const token = makeJwt({ email: 'Alice@Example.COM' });
    expect(readEmailFromJwt(token)).toBe('alice@example.com');
  });

  it('returns null when claim lacks an email', () => {
    const token = makeJwt({ sub: 'u1' });
    expect(readEmailFromJwt(token)).toBeNull();
  });

  it('returns null on malformed input', () => {
    expect(readEmailFromJwt('nope')).toBeNull();
    expect(readEmailFromJwt(undefined)).toBeNull();
  });

  it('trims whitespace from the email claim', () => {
    const token = makeJwt({ email: '  bob@example.com  ' });
    expect(readEmailFromJwt(token)).toBe('bob@example.com');
  });
});
