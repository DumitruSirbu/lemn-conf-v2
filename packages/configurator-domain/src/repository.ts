import type { Design } from "./design.js";
import { boundedFailureReason } from "./failure-text.js";

/** Opaque identifier for a stored `Design` row. Unguessable generation is an adapter concern. */
export type DesignId = string;

/** What `nanoid()` makes at its default, which `packages/persistence`'s `generateDesignId` returns:
 *  21 characters of `A-Za-z0-9_-`. That package's tests hold the generator to `isDesignId`. */
const DESIGN_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;

/** Whether a string has the shape `generateDesignId` makes. Not every id already stored is known to have
 *  it, so do not refuse a stored design's link on this alone until the live ids have been counted. */
export function isDesignId(value: string): boolean {
  return DESIGN_ID_SHAPE.test(value);
}

/** A digit run with no leading zero, at most nineteen digits (a `bigint` column's width). A second
 *  statement of `packages/persistence`'s `isDesignRevision`, tied to it by a property there. */
const DESIGN_REVISION_SHAPE = /^[1-9][0-9]{0,18}$/;

export function isDesignRevisionShape(value: string): boolean {
  return DESIGN_REVISION_SHAPE.test(value);
}

/**
 * **The one message this application constructs that reaches a response body.**
 * `apps/web/src/lib/server/design-errors.ts` writes it verbatim into the 404, and the id in it is a
 * URL segment the caller wrote — so an absurd request produced a 2 025-character body carrying a NUL
 * and an ANSI escape. Nothing is disclosed *to* the caller by that; what is wrong is the shape, on
 * the one route family whose whole rule is that a response says nothing it was not asked for
 * (ADR 0014 finding S2).
 *
 * Bounded here rather than at the response, for the reason `boundedFailureReason` is applied by the
 * describers rather than by their call sites: it is *"the last line of defence before a string
 * becomes an exception message or a log line"* (`failure-text.ts`), and a constructor is where a
 * message becomes one. `InvalidDesignError` below has always done it; this class was the omission.
 */
export class DesignNotFoundError extends Error {
  constructor(id: DesignId) {
    super(`No design found for id "${boundedFailureReason(id)}"`);
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
