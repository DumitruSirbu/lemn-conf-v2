import type {
  ConfigurationRepository,
  Design,
  DesignId,
} from "@lemnaria/configurator-domain";
import { DesignNotFoundError } from "@lemnaria/configurator-domain";

import { generateDesignId } from "./generate-design-id.js";

/** The instants the client closed a design at, named as `FakeAccountKitchenStore`'s `hiddenAt` / `deletedAt` are, so a
 *  test can hand one store's `held(id)` marks to the other. Either one closes the design. */
export interface ClientMarks {
  readonly hiddenAt?: Date;
  readonly deletedAt?: Date;
}

/** In-memory `ConfigurationRepository`, used by this package's own tests and by any test that
 *  needs a real repository contract without a live Neon connection. */
export class FakeConfigurationRepository implements ConfigurationRepository {
  private readonly designsById = new Map<DesignId, Design>();
  private readonly clientMarksById = new Map<DesignId, ClientMarks>();

  /**
   * Test setup: records that the client hid or deleted the design (ADR 0172 D9, plan S4). From then on `save` and
   * `load` refuse it with the error an unknown id gets, as the Neon gate answers one `none` or one refusal for both.
   * Marks only a design this fake already holds, so a mark cannot make an unknown id look known.
   */
  markByClient(id: DesignId, marks: ClientMarks): void {
    if (!this.designsById.has(id)) throw new DesignNotFoundError(id);
    this.clientMarksById.set(id, marks);
  }

  save(id: DesignId | null, design: Design): Promise<DesignId> {
    // Saving to an id that was never minted is an error, not a silent insert — it means a stale or
    // tampered identifier, and treating it as a create would resurrect a deleted design under an
    // id the caller does not own. Mirrors `NeonConfigurationRepository`. A design the client hid or
    // deleted is the same error, so its refusal tells no one it exists.
    if (id !== null && !this.isOpenToClient(id)) {
      return Promise.reject(new DesignNotFoundError(id));
    }

    const resolvedId = id ?? generateDesignId();
    this.designsById.set(resolvedId, design);
    return Promise.resolve(resolvedId);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see save() above.
  async load(id: DesignId): Promise<Design> {
    const design = this.designsById.get(id);
    if (!design || !this.isOpenToClient(id)) throw new DesignNotFoundError(id);
    return design;
  }

  private isOpenToClient(id: DesignId): boolean {
    if (!this.designsById.has(id)) return false;
    const { hiddenAt, deletedAt } = this.clientMarksById.get(id) ?? {};
    return hiddenAt === undefined && deletedAt === undefined;
  }
}
