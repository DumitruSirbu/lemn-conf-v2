import type { MintVisitor } from "@lemnaria/persistence";

/**
 * M7 wave 7E3b S5a (ADR 0114 Amendment H4): `MintVisitor`'s `"rotate"` case now carries two
 * candidate hashes — `detVisitorHash` and `randVisitorHash` — because only the database, deciding
 * atomically inside `mintStatements`, knows which one a given call actually lands under. Every
 * fake repository in this directory that is not itself testing that convergence decision (S5b's
 * job) models `"rotate"` as always converging on the deterministic candidate, matching what every
 * one of these doubles asserted before H4 existed: a rotate mint's row is readable under the value
 * derived from the cookie the request carried in.
 */
export function storedVisitorHashFor(visitor: MintVisitor): string {
  return visitor.kind === "fresh"
    ? visitor.visitorHash
    : visitor.detVisitorHash;
}
