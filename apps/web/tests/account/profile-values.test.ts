// What the profile form holds and what a save sends (Lot 2 criterion 12: an absent member leaves its column unchanged;
// an emptied one is sent as an empty text, which clears it). The server trims, so a difference of edge spaces is no change.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  changesBetween,
  PROFILE_FIELDS,
  trimmedValuesOf,
  type ProfileValues,
} from "@/account/profile/profile-values";

const STORED: ProfileValues = {
  name: "Ana Popescu",
  address: "Orhei",
  phone: "069 123 456",
};

describe("trimmedValuesOf", () => {
  it("trims each of the three fields and only the edges", () => {
    expect(
      trimmedValuesOf({
        name: "  Ana  Popescu \n",
        address: "\tOrhei",
        phone: " 069 123 456  ",
      }),
    ).toEqual({
      name: "Ana  Popescu",
      address: "Orhei",
      phone: "069 123 456",
    });
  });

  it("turns a field of spaces into an emptied one", () => {
    expect(
      trimmedValuesOf({ name: "   ", address: "\u00a0 ", phone: "" }),
    ).toEqual({
      name: "",
      address: "",
      phone: "",
    });
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        (name, address, phone) => {
          const once = trimmedValuesOf({ name, address, phone });
          expect(trimmedValuesOf(once)).toEqual(once);
        },
      ),
    );
  });

  it("names exactly the three fields, in the order the form draws them", () => {
    expect([...PROFILE_FIELDS]).toEqual(["name", "address", "phone"]);
    expect(Object.keys(trimmedValuesOf(STORED))).toEqual([...PROFILE_FIELDS]);
  });
});

describe("changesBetween: only what differs is sent", () => {
  it("sends nothing when nothing differs", () => {
    expect(changesBetween(STORED, { ...STORED })).toEqual({});
  });

  it.each(PROFILE_FIELDS)("sends %s alone when it alone differs", (field) => {
    expect(changesBetween(STORED, { ...STORED, [field]: "changed" })).toEqual({
      [field]: "changed",
    });
  });

  it("sends an emptied field as an empty text, which clears it", () => {
    const changes = changesBetween(STORED, { ...STORED, phone: "" });
    expect(changes).toEqual({ phone: "" });
    expect(Object.hasOwn(changes, "phone")).toBe(true);
  });

  it("sends a first value for a field that was never given", () => {
    expect(
      changesBetween(
        { name: "", address: "", phone: "" },
        { name: "Ana", address: "", phone: "" },
      ),
    ).toEqual({ name: "Ana" });
  });

  it("leaves out the members that did not change, so a stored value the validators would now refuse never blocks another field", () => {
    const changes = changesBetween(
      { ...STORED, phone: "not a phone any more" },
      { ...STORED, phone: "not a phone any more", name: "Ana M." },
    );
    expect(Object.keys(changes)).toEqual(["name"]);
  });

  it("compares trimmed values against trimmed: edge spaces alone are no change", () => {
    const edited = trimmedValuesOf({
      name: " Ana Popescu ",
      address: "Orhei  ",
      phone: "  069 123 456",
    });
    expect(changesBetween(trimmedValuesOf(STORED), edited)).toEqual({});
  });

  it("is case-sensitive and whitespace-inside sensitive: those are changes", () => {
    expect(changesBetween(STORED, { ...STORED, address: "orhei" })).toEqual({
      address: "orhei",
    });
    expect(changesBetween(STORED, { ...STORED, name: "Ana  Popescu" })).toEqual(
      {
        name: "Ana  Popescu",
      },
    );
  });

  it("is empty exactly when the two are equal, for any pair of values", () => {
    const value = fc.record({
      name: fc.string(),
      address: fc.string(),
      phone: fc.string(),
    });
    fc.assert(
      fc.property(value, value, (stored, edited) => {
        const changes = changesBetween(stored, edited);
        const isSame = PROFILE_FIELDS.every(
          (field) => stored[field] === edited[field],
        );
        expect(Object.keys(changes).length === 0).toBe(isSame);
        for (const [field, sent] of Object.entries(changes)) {
          expect(sent).toBe(edited[field as keyof ProfileValues]);
          expect(sent).not.toBe(stored[field as keyof ProfileValues]);
        }
      }),
    );
  });
});
