import type { Design } from "./design.js";
import { boundedFailureReason } from "./failure-text.js";

/** Opaque identifier for a stored `Design` row. Unguessable generation is an adapter concern. */
export type DesignId = string;

export class DesignNotFoundError extends Error {
  constructor(id: DesignId) {
    super(`No design found for id "${id}"`);
    this.name = "DesignNotFoundError";
  }
}

export class InvalidDesignError extends Error {
  constructor(reason: string) {
    super(`Design payload failed validation: ${boundedFailureReason(reason)}`);
    this.name = "InvalidDesignError";
  }
}

/** Persists and retrieves designs by opaque id. `save` with `id: null` mints a new row; `save`
 *  with an existing id updates it. `load` never resolves with null — it rejects with
 *  `DesignNotFoundError` or `InvalidDesignError` instead. */
export interface ConfigurationRepository {
  save(id: DesignId | null, design: Design): Promise<DesignId>;
  load(id: DesignId): Promise<Design>;
}
