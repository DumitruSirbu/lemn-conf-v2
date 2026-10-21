// The addresses of the staff area, from the one leaf module the staff frame and the account control both write them with: a
// page, and, on the kitchens page, one kitchen. The id is part of an address only if it is shaped like a design id, whatever
// the caller was handed.
import { describe, expect, it } from "vitest";

import { staffPathOf } from "@/staff/staff-paths";

const ID = "k".repeat(21);

describe("staffPathOf", () => {
  it("writes the first page of the area as the frame's navigation and the account control's entry do", () => {
    expect(staffPathOf("ro", "kitchens")).toBe("/ro/staff/kitchens");
    expect(staffPathOf("ru", "audit")).toBe("/ru/staff/audit");
  });

  it("leads to the list in the other language when the page shows no kitchen", () => {
    expect(staffPathOf("ru", "kitchens", undefined)).toBe("/ru/staff/kitchens");
  });

  it("leads to the same kitchen in the other language when the page shows one", () => {
    expect(staffPathOf("ru", "kitchens", ID)).toBe(`/ru/staff/kitchens/${ID}`);
    expect(staffPathOf("ro", "kitchens", ID)).toBe(`/ro/staff/kitchens/${ID}`);
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
    expect(staffPathOf("ru", "kitchens", hostile)).toBe("/ru/staff/kitchens");
  });

  it("writes no kitchen under a page that has none", () => {
    expect(staffPathOf("ru", "audit", ID)).toBe("/ru/staff/audit");
  });
});
