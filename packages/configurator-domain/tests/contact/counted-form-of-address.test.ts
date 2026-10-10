import { describe, expect, it } from "vitest";

import {
  countedFormOfAddress,
  isCountedFormOfAddress,
} from "../../src/contact/index.js";

describe("countedFormOfAddress: an address as a limit counts it", () => {
  it.each([
    ["Ana@Example.COM", "ana@example.com"],
    ["ana@example.com", "ana@example.com"],
    ["ANA@EXAMPLE.COM", "ana@example.com"],
  ])("lowers %s to %s", (typed, counted) => {
    expect(countedFormOfAddress(typed)).toBe(counted);
  });

  it.each([
    ["a plus-tag", "ana+shop@example.com"],
    ["a dot in the name", "a.na@example.com"],
    ["a subdomain", "ana@mail.example.com"],
    ["digits and hyphens", "ana-1@ex-ample.com"],
  ])("strips nothing: %s stays whole", (_label, address) => {
    expect(countedFormOfAddress(address)).toBe(address);
  });

  it("keeps two addresses that differ only by a plus-tag or a dot apart", () => {
    const plain = countedFormOfAddress("ana@example.com");

    expect(countedFormOfAddress("ana+x@example.com")).not.toBe(plain);
    expect(countedFormOfAddress("a.na@example.com")).not.toBe(plain);
  });

  it("is idempotent, and does not depend on the process's own locale", () => {
    const once = countedFormOfAddress("Ana.TITLE@Example.com");

    expect(countedFormOfAddress(once)).toBe(once);
    expect(countedFormOfAddress("I@EXAMPLE.COM")).toBe("i@example.com");
  });
});

describe("isCountedFormOfAddress: the one text a subject may be made of", () => {
  it.each(["ana@example.com", "ana+shop@example.com", "a.na@mail.example.com"])(
    "accepts %s, an address in its counted form",
    (text) => {
      expect(isCountedFormOfAddress(text)).toBe(true);
    },
  );

  it.each([
    ["an address with a capital", "Ana@example.com"],
    ["nothing", ""],
    ["text that is no address", "not an address"],
    ["two at-signs", "a@b@example.com"],
    ["a line break inside", "ana@example.com\nbcc@example.com"],
    ["a space around", " ana@example.com"],
    ["a control character", "ana@exam\u0000ple.com"],
    ["a name before the address", "Ana <ana@example.com>"],
    ["an address past the longest", `${"a".repeat(250)}@example.com`],
  ])("refuses %s", (_label, text) => {
    expect(isCountedFormOfAddress(text)).toBe(false);
  });

  it("accepts every address the form accepts, once counted", () => {
    for (const typed of ["Ana@Example.COM", "ANA+X@EXAMPLE.COM", "a.B@c.de"]) {
      expect(isCountedFormOfAddress(countedFormOfAddress(typed))).toBe(true);
    }
  });
});
