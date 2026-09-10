/**
 * What the AI brief is allowed to see.
 *
 * The generator used to hand the model every key on the row. On production data
 * that produced, about a real coordinator: "Brandi Jane is a ghost", with
 * "ghost" pinned as a durable fact. `is_ghost` means "has not claimed an
 * account" — a fact about our records, not about a person, and the model had no
 * way to know the difference.
 *
 * An allowlist rather than a denylist, because a denylist is a promise to
 * remember every internal field somebody adds later, and the failure mode is a
 * sentence about a customer that nobody wrote.
 */

import { describe, it, expect } from 'vitest';
import { briefSafeAttributes } from '../brief-attributes';

function keysOf(attrs: Record<string, unknown>): string[] {
  return briefSafeAttributes(attrs).map(([k]) => k);
}

describe('briefSafeAttributes', () => {
  it('keeps what a human typed about a human', () => {
    expect(keysOf({
      first_name: 'Sam',
      last_name: 'Ortiz',
      job_title: 'Lighting Director',
      market: 'Nashville, TN',
    })).toEqual(['first_name', 'last_name', 'job_title', 'market']);
  });

  it('never lets the ghost flag through', () => {
    // The exact regression: is_ghost reached the model and came back as a
    // sentence about a person.
    expect(keysOf({ first_name: 'Brandi', is_ghost: true })).toEqual(['first_name']);
  });

  it('withholds identity plumbing and ownership', () => {
    expect(keysOf({
      first_name: 'Sam',
      is_claimed: true,
      created_by_org_id: 'org-1',
      claimed_by_user_id: 'user-1',
      category: 'client',
    })).toEqual(['first_name']);
  });

  it('withholds what the cards already show', () => {
    // Email and phone are an inch away in the contact strip. Restating them in
    // prose is the other half of what made the brief worthless.
    expect(keysOf({ job_title: 'A1', email: 'a@b.com', phone: '555-0100' })).toEqual(['job_title']);
  });

  it('drops empty and false values rather than reporting absence', () => {
    // "cdl: false" is not a thing to recall, and an unset field says nothing.
    expect(keysOf({ first_name: 'Sam', market: '', union_status: null, cdl: false })).toEqual([
      'first_name',
    ]);
  });

  it('lets a venue keep the facts that decide whether a show can happen', () => {
    expect(keysOf({ capacity: 450, curfew: '11:00 PM', load_in_window: '2–4pm' })).toEqual([
      'capacity',
      'curfew',
      'load_in_window',
    ]);
  });

  it('survives a missing attributes bag', () => {
    expect(briefSafeAttributes(null)).toEqual([]);
    expect(briefSafeAttributes(undefined)).toEqual([]);
  });

  it('lets an unknown key through only if someone allowlists it', () => {
    // A field added next month is invisible to the brief until a human decides
    // it is safe. That is the point of the direction.
    expect(keysOf({ some_new_internal_flag: true })).toEqual([]);
  });
});
