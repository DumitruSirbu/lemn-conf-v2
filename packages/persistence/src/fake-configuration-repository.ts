import type {
  ConfigurationRepository,
  Design,
  DesignId,
} from "@lemnaria/configurator-domain";
import { DesignNotFoundError } from "@lemnaria/configurator-domain";

import { generateDesignId } from "./generate-design-id.js";

/** In-memory `ConfigurationRepository`, used by this package's own tests and by any test that
 *  needs a real repository contract without a live Neon connection. */
export class FakeConfigurationRepository implements ConfigurationRepository {
  private readonly designsById = new Map<DesignId, Design>();

  save(id: DesignId | null, design: Design): Promise<DesignId> {
    // Saving to an id that was never minted is an error, not a silent insert — it means a stale or
    // tampered identifier, and treating it as a create would resurrect a deleted design under an
    // id the caller does not own. Mirrors `NeonConfigurationRepository`.
    if (id !== null && !this.designsById.has(id)) {
      return Promise.reject(new DesignNotFoundError(id));
    }

    const resolvedId = id ?? generateDesignId();
    this.designsById.set(resolvedId, design);
    return Promise.resolve(resolvedId);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see save() above.
  async load(id: DesignId): Promise<Design> {
    const design = this.designsById.get(id);
    if (!design) throw new DesignNotFoundError(id);
    return design;
  }
}
