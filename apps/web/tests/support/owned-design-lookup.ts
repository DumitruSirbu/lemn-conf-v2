import { DesignNotFoundError } from "@lemnaria/configurator-domain";

/**
 * M7 wave 7E3b (D4, ADR 0114 decision 5): `GET /api/designs/{id}` and `/[locale]/d/{id}` now read
 * through `loadOwned`, never the open `load`. Most repository doubles across this directory model
 * write authorisation and document validity, never per-row visitor ownership, so their `loadOwned`
 * is this one adapter around the `load` they already have — the id decides `found` vs `none`, and
 * the visitor hash a caller presents is accepted for anyone. A double that *is* about ownership
 * (`visitor-identity.test.ts`, `qa-7e3a-visitor.adversarial.test.ts`) implements `loadOwned` itself
 * instead of using this.
 */
export async function loadOwnedByIdAlone<
  Loaded extends { readonly design: unknown; readonly revision: unknown },
>(
  load: (id: string) => Promise<Loaded>,
  id: string,
): Promise<({ readonly kind: "found" } & Loaded) | { readonly kind: "none" }> {
  try {
    const loaded = await load(id);
    return { kind: "found", ...loaded };
  } catch (error) {
    if (error instanceof DesignNotFoundError) return { kind: "none" };
    throw error;
  }
}

/** The visitor cookie name and one well-formed value, for a fixture that only needs *a* cookie the
 *  gate accepts — not a specific one an ownership double checks against. */
export const OWNER_VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
export const OWNER_VISITOR_VALUE = "a".repeat(43);

/** The `Cookie` header value naming the fixture's own owner value — appended to a request's other
 *  cookies with `; `, the same join every route already reads. */
export function ownerVisitorCookiePair(): string {
  return `${OWNER_VISITOR_COOKIE_NAME}=${OWNER_VISITOR_VALUE}`;
}
