/**
 * Unit coverage for `device-copy` — the user-facing copy resolver.
 *
 * Locks two invariants:
 *   1. Every `DeviceCapability` resolves to a full `DeviceCopy` block
 *      (no missing fields, no `undefined` leaking to the UI).
 *   2. The user-facing copy never contains the word "passkey" — we
 *      surface biometric brand names only (Face ID / Touch ID / Windows
 *      Hello / "your device").
 *   3. `deviceCapabilityFromUserAgentClass` maps every UA bucket to an
 *      actual capability (no fall-through to `undefined`).
 */

import { describe, it, expect } from 'vitest';
import {
  getDeviceCopy,
  deviceCapabilityFromUserAgentClass,
} from '../device-copy';
import type { DeviceCapability } from '@/entities/auth/model/types';
import type { UserAgentClass } from '../classify-user-agent';

const CAPABILITIES: DeviceCapability[] = ['faceid', 'touchid', 'windowshello', 'device'];

describe('getDeviceCopy', () => {
  it.each(CAPABILITIES)(
    'returns a complete copy block for %s',
    (capability) => {
      const copy = getDeviceCopy(capability);
      expect(copy.brand).toBeTruthy();
      expect(copy.claimPrimaryCta).toBeTruthy();
      expect(copy.signInPrimaryCta).toBeTruthy();
      expect(copy.sessionResumeTitle).toBeTruthy();
      expect(copy.pendingStatus).toBeTruthy();
    },
  );

  it.each(CAPABILITIES)(
    'never surfaces the word "passkey" in %s copy',
    (capability) => {
      const copy = getDeviceCopy(capability);
      const all = `${copy.brand}|${copy.claimPrimaryCta}|${copy.signInPrimaryCta}|${copy.sessionResumeTitle}|${copy.pendingStatus}`;
      expect(all.toLowerCase()).not.toContain('passkey');
    },
  );

  it('resolves "faceid" to Face ID brand', () => {
    expect(getDeviceCopy('faceid').brand).toBe('Face ID');
  });

  it('resolves "touchid" to Touch ID brand', () => {
    expect(getDeviceCopy('touchid').brand).toBe('Touch ID');
  });

  it('resolves "windowshello" to Windows Hello brand', () => {
    expect(getDeviceCopy('windowshello').brand).toBe('Windows Hello');
  });

  it('resolves "device" to the generic fallback', () => {
    expect(getDeviceCopy('device').brand).toBe('your device');
    // The generic claim CTA intentionally avoids the brand to stay readable:
    // "Accept and set up your device" reads poorly, so we use
    // "Accept and set up secure sign-in" instead.
    expect(getDeviceCopy('device').claimPrimaryCta).toMatch(/Accept and set up/);
  });

  it('returns the generic fallback when called with a malformed capability', () => {
    // This exercise proves defensive coercion — the type system prevents
    // this in-TS but a prop passed across an API boundary can land wrong.
    const copy = getDeviceCopy('not-a-real-capability' as unknown as DeviceCapability);
    expect(copy.brand).toBe('your device');
  });
});

describe('deviceCapabilityFromUserAgentClass', () => {
  const mapping: Array<[UserAgentClass, DeviceCapability]> = [
    ['ios', 'faceid'],
    ['mac', 'touchid'],
    ['windows', 'windowshello'],
    ['android', 'device'],
    ['linux', 'device'],
    ['other', 'device'],
  ];

  it.each(mapping)('maps %s UA class to %s', (uaClass, expected) => {
    expect(deviceCapabilityFromUserAgentClass(uaClass)).toBe(expected);
  });
});
