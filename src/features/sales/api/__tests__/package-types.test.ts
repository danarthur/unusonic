import { describe, it, expect } from 'vitest';
import {
  estimatedRoleCost,
  roleCostBreakdown,
  resolveRequiredRoles,
  computeBundleTargetCost,
  type RequiredRole,
  type PackageDefinition,
} from '../package-types';

// ---------------------------------------------------------------------------
// estimatedRoleCost
// ---------------------------------------------------------------------------
describe('estimatedRoleCost', () => {
  it('talent: rate x quantity (hours ignored)', () => {
    const r: RequiredRole = { role: 'DJ', booking_type: 'talent', quantity: 2, default_rate: 500 };
    expect(estimatedRoleCost(r)).toBe(1000);
  });

  it('labor: rate x billable hours x quantity', () => {
    const r: RequiredRole = { role: 'Tech', booking_type: 'labor', quantity: 1, default_rate: 50, default_hours: 8 };
    expect(estimatedRoleCost(r)).toBe(400);
  });

  it('labor: uses minimum_hours when greater than default_hours', () => {
    const r: RequiredRole = { role: 'Tech', booking_type: 'labor', quantity: 1, default_rate: 50, default_hours: 2, minimum_hours: 4 };
    expect(estimatedRoleCost(r)).toBe(200); // 50 * 4
  });

  it('labor: overtime rate kicks in after threshold', () => {
    const r: RequiredRole = {
      role: 'A1',
      booking_type: 'labor',
      quantity: 1,
      default_rate: 50,
      default_hours: 10,
      overtime_rate: 75,
      overtime_threshold: 8,
    };
    // 8h * $50 + 2h * $75 = 400 + 150 = 550
    expect(estimatedRoleCost(r)).toBe(550);
  });

  it('labor: overtime uses default threshold of 8 when not specified', () => {
    const r: RequiredRole = {
      role: 'A1',
      booking_type: 'labor',
      quantity: 1,
      default_rate: 50,
      default_hours: 10,
      overtime_rate: 75,
    };
    // 8h * $50 + 2h * $75 = 550
    expect(estimatedRoleCost(r)).toBe(550);
  });

  it('labor: no overtime when hours <= threshold', () => {
    const r: RequiredRole = {
      role: 'Tech',
      booking_type: 'labor',
      quantity: 1,
      default_rate: 50,
      default_hours: 6,
      overtime_rate: 75,
      overtime_threshold: 8,
    };
    expect(estimatedRoleCost(r)).toBe(300); // 50 * 6, no OT
  });

  it('defaults rate to 0 when null', () => {
    const r: RequiredRole = { role: 'Tech', booking_type: 'labor', quantity: 1, default_rate: null };
    expect(estimatedRoleCost(r)).toBe(0);
  });

  it('quantity defaults to 1 when 0 or null', () => {
    const r: RequiredRole = { role: 'DJ', booking_type: 'talent', quantity: 0, default_rate: 500 };
    expect(estimatedRoleCost(r)).toBe(500); // max(1, 0) = 1
  });

  it('multiplies by quantity for labor with OT', () => {
    const r: RequiredRole = {
      role: 'A1',
      booking_type: 'labor',
      quantity: 3,
      default_rate: 50,
      default_hours: 10,
      overtime_rate: 75,
      overtime_threshold: 8,
    };
    // (8*50 + 2*75) * 3 = 550 * 3 = 1650
    expect(estimatedRoleCost(r)).toBe(1650);
  });
});

// ---------------------------------------------------------------------------
// roleCostBreakdown
// ---------------------------------------------------------------------------
describe('roleCostBreakdown', () => {
  it('returns regular hours only when no overtime', () => {
    const r: RequiredRole = { role: 'Tech', booking_type: 'labor', quantity: 1, default_rate: 50 };
    const result = roleCostBreakdown(r, 6, 2);
    expect(result).toEqual({
      regularHours: 6,
      overtimeHours: 0,
      regularRate: 50,
      overtimeRate: null,
      total: 600, // 50 * 6 * 2
    });
  });

  it('splits regular and overtime hours', () => {
    const r: RequiredRole = {
      role: 'A1',
      booking_type: 'labor',
      quantity: 1,
      default_rate: 50,
      overtime_rate: 75,
      overtime_threshold: 8,
    };
    const result = roleCostBreakdown(r, 10, 1);
    expect(result).toEqual({
      regularHours: 8,
      overtimeHours: 2,
      regularRate: 50,
      overtimeRate: 75,
      total: 550, // (8*50 + 2*75) * 1
    });
  });
});

// ---------------------------------------------------------------------------
// resolveRequiredRoles
// ---------------------------------------------------------------------------
describe('resolveRequiredRoles', () => {
  it('returns empty array for null/undefined', () => {
    expect(resolveRequiredRoles(null)).toEqual([]);
    expect(resolveRequiredRoles(undefined)).toEqual([]);
  });

  it('uses definition.required_roles when present and non-empty', () => {
    const roles: RequiredRole[] = [{ role: 'DJ', booking_type: 'talent', quantity: 1 }];
    const def: PackageDefinition = { blocks: [], required_roles: roles };
    expect(resolveRequiredRoles(def)).toBe(roles);
  });

  it('falls through empty required_roles to ingredient_meta', () => {
    const ingredientRoles: RequiredRole[] = [{ role: 'Tech', booking_type: 'labor', quantity: 1 }];
    const def: PackageDefinition = {
      blocks: [],
      required_roles: [],
      ingredient_meta: { required_roles: ingredientRoles },
    };
    expect(resolveRequiredRoles(def)).toBe(ingredientRoles);
  });

  it('falls through to legacy staff_role from ingredient_meta', () => {
    const def: PackageDefinition = {
      blocks: [],
      ingredient_meta: { staff_role: 'Photographer', duration_hours: 4 },
    };
    const result = resolveRequiredRoles(def);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('Photographer');
    expect(result[0].booking_type).toBe('labor');
    expect(result[0].default_hours).toBe(4);
  });

  it('falls through to legacy staffing.role', () => {
    const def: PackageDefinition = {
      blocks: [],
      staffing: { required: true, role: 'Security' },
    };
    const result = resolveRequiredRoles(def);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('Security');
  });

  it('returns empty when no roles found in any path', () => {
    const def: PackageDefinition = { blocks: [] };
    expect(resolveRequiredRoles(def)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeBundleTargetCost
// ---------------------------------------------------------------------------
describe('computeBundleTargetCost', () => {
  it('sums ingredient costs times block quantities plus role costs', () => {
    const ingredients = [
      { target_cost: 100, blockQuantity: 2 }, // 200
      { target_cost: 50, blockQuantity: 1 },  // 50
    ];
    const roles: RequiredRole[] = [
      { role: 'DJ', booking_type: 'talent', quantity: 1, default_rate: 500 }, // 500
    ];
    expect(computeBundleTargetCost(ingredients, roles)).toBe(750);
  });

  it('treats null target_cost as 0', () => {
    const ingredients = [
      { target_cost: null, blockQuantity: 3 },
      { target_cost: 100, blockQuantity: 1 },
    ];
    expect(computeBundleTargetCost(ingredients, [])).toBe(100);
  });

  it('returns 0 when no ingredients and no roles', () => {
    expect(computeBundleTargetCost([], [])).toBe(0);
  });
});
