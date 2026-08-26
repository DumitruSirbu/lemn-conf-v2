// §11 row 24's gate, asked about the keys nobody put in the table.
//
// `isKnownKind` and `describeKindLabel` are both lookups on an object literal, and both are now on
// the panel's path: `describePanel` renders no replace section for an unknown kind, and the header
// falls back to `UNKNOWN_KIND_LABEL_RO` for a kind the catalogue does not name.
import { describe, expect, it } from "vitest";

import {
  describeKindLabel,
  isKnownKind,
  UNKNOWN_KIND_LABEL_RO,
} from "../src/catalog.js";

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

describe("describeKindLabel", () => {
  it("falls back to the unknown-kind label for a kind the table does not name", () => {
    expect(describeKindLabel("mystery_unit")).toBe(UNKNOWN_KIND_LABEL_RO);
  });

  // The same inherited names, one step further on: a plain table lookup returns the inherited
  // FUNCTION for them, and §9's header line would render a stringified function as the body's name.
  // The label must be a string — the unknown-kind fallback — for every kind, without exception.
  it("returns a string for every kind, including an inherited member", () => {
    for (const kind of INHERITED_KEYS) {
      const label: unknown = describeKindLabel(kind);
      expect([kind, typeof label]).toEqual([kind, "string"]);
      expect([kind, label]).toEqual([kind, UNKNOWN_KIND_LABEL_RO]);
    }
  });
});
