// Barrel module kept for backwards compatibility.
//
// Historically, many modules imported `ModelStore`, `createModelStore`, and `modelStore`
// from `./modelStore`. Step 4 decomposes the implementation into:
// - `modelStoreWiring.ts` (construction / dependency injection)
// - `modelCommands.ts` (command surface)
//
// This file keeps the public export surface stable.

export type { ModelStoreState } from './modelStoreTypes';
export { ModelStore } from './modelCommands';
import { ModelStore } from './modelCommands';

/** Factory used by tests and to create isolated store instances. */
export function createModelStore(): ModelStore {
  return new ModelStore();
}

/** App singleton store instance. */
export const modelStore = createModelStore();
