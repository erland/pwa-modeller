import { registerImporter } from './registry';

// Built-in importers.
// Keep these imports pointed at concrete modules (avoid importing ../framework/index to prevent cycles).
import { meffImporter } from '../meff';

let registered = false;

/**
 * Register built-in importers once.
 * This is called by importModel(…) so callers do not need to remember to register.
 */
export function registerBuiltInImporters(): void {
  if (registered) return;
  registered = true;

  registerImporter(meffImporter);
}
