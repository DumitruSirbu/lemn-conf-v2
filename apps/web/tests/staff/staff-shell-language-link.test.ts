// Where the staff frame's language links lead: the page being shown, and, on the kitchen page, that kitchen. The id is part
// of a link only if it is shaped like a design id, whatever the caller was handed.
import { describe, expect, it } from "vitest";

import { pathForLanguageLink } from "@/staff/staff-shell";

const ID = "k".repeat(21);

describe("pathForLanguageLink", () => {
  it("leads to the list in the other language when the page shows no kitchen", () => {
    expect(pathForLanguageLink("ru", "kitchens", undefined)).toBe(
      "/ru/staff/kitchens",
    );
  });

  it("leads to the same kitchen in the other language when the page shows one", () => {
    expect(pathForLanguageLink("ru", "kitchens", ID)).toBe(
      `/ru/staff/kitchens/${ID}`,
    );
    expect(pathForLanguageLink("ro", "kitchens", ID)).toBe(
      `/ro/staff/kitchens/${ID}`,
    );
  });

  it.each([
    ["too short", "abc"],
    ["too long", "k".repeat(22)],
    ["a slash", `${"k".repeat(10)}/${"k".repeat(10)}`],
    ["a climb", "../../../account/profile"],
    ["a query", `${"k".repeat(19)}?x`],
    ["a fragment", `${"k".repeat(19)}#x`],
    ["a scheme", "javascript:alert(1)//aaaa"],
    ["an escaped slash", `${"k".repeat(15)}%2F${"k".repeat(3)}`],
    ["nothing", ""],
  ])("writes nothing of an id that is %s into a link", (_, hostile) => {
    expect(pathForLanguageLink("ru", "kitchens", hostile)).toBe(
      "/ru/staff/kitchens",
    );
  });

  it("writes no kitchen under a page that has none", () => {
    expect(pathForLanguageLink("ru", "audit", ID)).toBe("/ru/staff/audit");
  });
});
