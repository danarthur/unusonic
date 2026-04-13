/**
 * Compile-time branded type utility.
 *
 * Adds a phantom `__brand` property that prevents cross-assignment
 * between structurally identical types. Zero runtime cost — the
 * property never exists at runtime and is erased after compilation.
 *
 * @example
 * type EntityId = Brand<string, 'EntityId'>
 * type WorkspaceId = Brand<string, 'WorkspaceId'>
 *
 * declare function getEntity(id: EntityId): void
 * const wsId = 'abc' as WorkspaceId
 * getEntity(wsId) // TS error — WorkspaceId not assignable to EntityId
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
