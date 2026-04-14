/**
 * Unit tests for RoleChip label formatting.
 *
 * Rendering behavior (tooltip, compact variant) is exercised by the
 * component-level integration tests; this file covers the pure label
 * logic so CI's unit project keeps it green regardless of DOM env.
 */

import { describe, it, expect } from 'vitest';
import { formatRoleLabel } from '../RoleChip';

describe('formatRoleLabel', () => {
  it('title-cases single-word slugs', () => {
    expect(formatRoleLabel('owner')).toBe('Owner');
    expect(formatRoleLabel('admin')).toBe('Admin');
    expect(formatRoleLabel('member')).toBe('Member');
    expect(formatRoleLabel('viewer')).toBe('Viewer');
    expect(formatRoleLabel('observer')).toBe('Observer');
    expect(formatRoleLabel('employee')).toBe('Employee');
  });

  it('humanizes snake_case slugs', () => {
    expect(formatRoleLabel('finance_admin')).toBe('Finance admin');
    expect(formatRoleLabel('touring_coordinator')).toBe('Touring coordinator');
  });

  it('keeps PM uppercase as an acronym', () => {
    expect(formatRoleLabel('pm')).toBe('PM');
  });

  it('is case-insensitive on the input slug', () => {
    expect(formatRoleLabel('OWNER')).toBe('Owner');
    expect(formatRoleLabel('Finance_Admin')).toBe('Finance admin');
  });

  it('returns empty string for empty input', () => {
    expect(formatRoleLabel('')).toBe('');
  });
});
