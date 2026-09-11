// §11 row 24's gate, asked about the keys nobody put in the set.
//
// `isKnownKind` is on the panel's path: `describePanel` renders no replace section for a kind the
// catalogue does not name. The *word* an unknown kind is shown as is no longer decided here — the
// domain publishes `kindLabel(kind)` for any kind and `resolveBodyLabel` renders
// `catalog.unknownKind` for one with no leaf (`apps/web/tests/i18n/body-label.test.ts`).
import { describe, expect, it } from "vitest";

import { isKnownKind, kindLabel, knownBodyKinds } from "../src/catalog.js";

/** Members every object literal inherits from `Object.prototype`. None of them is a body kind. */
const INHERITED_KEYS = [
  "toString",
  "constructor",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "__proto__",
];

describe("isKnownKind", () => {
  it("knows the kinds the catalogue names", () => {
    for (const kind of ["base_cabinet", "wall_cabinet", "extractor_hood"])
      expect([kind, isKnownKind(kind)]).toEqual([kind, true]);
  });

  it("does not know an empty string, a void, or an invented kind", () => {
    for (const kind of ["", " ", "void", "mystery_unit", "BASE_CABINET"])
      expect([kind, isKnownKind(kind)]).toEqual([kind, false]);
  });

  // §11 row 24: "any unknown kind renders no replace section". A membership test that walks the
  // prototype chain answers "known" for every name JavaScript objects inherit, so these keys are the
  // shape of unknown kind that makes row 24 fail open.
  it("does not know an inherited Object.prototype member", () => {
    for (const kind of INHERITED_KEYS)
      expect([kind, isKnownKind(kind)]).toEqual([kind, false]);
  });
});

describe("knownBodyKinds", () => {
  // The list and the predicate are two readings of one set, and a list written out by hand beside it
  // would drift silently — the sweep in `apps/web/tests/i18n/body-label.test.ts` trusts this list to
  // be the whole set.
  it("lists exactly the kinds the predicate knows", () => {
    const kinds = knownBodyKinds();

    expect(kinds).toHaveLength(13);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const kind of kinds)
      expect([kind, isKnownKind(kind)]).toEqual([kind, true]);
  });

  // `ReadonlySet` and `readonly string[]` are compile-time promises, and this list leaves the
  // package. A caller that reaches through the type must not be able to teach the domain a kind.
  it("hands out a copy, so a caller cannot add a fourteenth kind through it", () => {
    (knownBodyKinds() as string[]).push("qa_smuggled_kind");

    expect(knownBodyKinds()).not.toContain("qa_smuggled_kind");
    expect(isKnownKind("qa_smuggled_kind")).toBe(false);
  });
});

describe("kindLabel", () => {
  // The domain's half of the same hazard: it publishes the kind it was handed and never looks a word
  // up, so an inherited `Object.prototype` member cannot come back as a stringified function. The
  // resolver's half — that such a kind renders `catalog.unknownKind` — is a web test.
  it("publishes the kind it was given, including an inherited member", () => {
    for (const kind of [...INHERITED_KEYS, "mystery_unit", ""])
      expect([kind, kindLabel(kind)]).toEqual([
        kind,
        { kind: "bodyKind", bodyKind: kind },
      ]);
  });
});
