import { nanoid } from "nanoid";

/** Mints an opaque, cryptographically-random design identifier — unguessable and non-sequential,
 *  per the persistence decision's identifier requirement. Never derive one from a counter, a
 *  timestamp, or the database's own sequence. */
export function generateDesignId(): string {
  return nanoid();
}
