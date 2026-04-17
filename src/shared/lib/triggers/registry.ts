import type { TriggerPrimitive, TriggerTier } from './types';

const primitives = new Map<string, TriggerPrimitive<unknown>>();

export function registerPrimitive<C>(primitive: TriggerPrimitive<C>): void {
  if (primitives.has(primitive.type)) {
    throw new Error(
      `Trigger primitive "${primitive.type}" is already registered. Duplicate registration likely indicates a stray side-effect import.`,
    );
  }
  primitives.set(primitive.type, primitive as TriggerPrimitive<unknown>);
}

export function getPrimitive(type: string): TriggerPrimitive<unknown> | undefined {
  return primitives.get(type);
}

export function listAllPrimitives(): TriggerPrimitive<unknown>[] {
  return Array.from(primitives.values());
}

export function listByTier(tier: TriggerTier): TriggerPrimitive<unknown>[] {
  return listAllPrimitives().filter((p) => p.tier === tier);
}

/**
 * Test-only escape hatch. Registration is module-scoped, so unit tests that
 * want to assert duplicate-registration behavior or exercise an empty registry
 * need a way to reset state without reaching across the module boundary.
 */
export function __resetRegistryForTests(): void {
  primitives.clear();
}

import { triggerHandoffPrimitive } from './primitives/trigger-handoff';
import { sendDepositInvoicePrimitive } from './primitives/send-deposit-invoice';
import { notifyRolePrimitive } from './primitives/notify-role';
import { createTaskPrimitive } from './primitives/create-task';
import { updateDealFieldPrimitive } from './primitives/update-deal-field';

registerPrimitive(triggerHandoffPrimitive);
registerPrimitive(sendDepositInvoicePrimitive);
registerPrimitive(notifyRolePrimitive);
registerPrimitive(createTaskPrimitive);
registerPrimitive(updateDealFieldPrimitive);
