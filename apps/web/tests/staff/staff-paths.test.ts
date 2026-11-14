// The addresses of the staff area, from the one leaf module the staff frame and the account control both write them with: a
// page, and, on the kitchens page, one kitchen. The id is part of an address only if it is shaped like a design id, whatever
// the caller was handed.
import { describe, expect, it } from "vitest";

import {
  CATALOG_PAGES,
  isCatalogPage,
  staffKitchen3dPathOf,
  staffPathOf,
} from "@/staff/staff-paths";

const ID = "k".repeat(21);

describe("staffPathOf for the price dashboard's pages", () => {
  it.each(CATALOG_PAGES)(
    "writes %s under the catalog family, in either language",
    (page) => {
      expect(staffPathOf("ro", page)).toBe(`/ro/staff/catalog/${page}`);
      expect(staffPathOf("ru", page)).toBe(`/ru/staff/catalog/${page}`);
    },
  );

  it("writes no kitchen under a catalog page, whatever id it is handed", () => {
    expect(staffPathOf("ro", "cabinets", ID)).toBe(
      "/ro/staff/catalog/cabinets",
    );
  });

  it("tells a catalog page from a staff page", () => {
    expect(CATALOG_PAGES.every(isCatalogPage)).toBe(true);
    expect(isCatalogPage("kitchens")).toBe(false);
    expect(isCatalogPage("audit")).toBe(false);
  });
});

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

describe("staffKitchen3dPathOf", () => {
  it("writes the kitchen's 3D view in either language, with no query when no copy is named", () => {
    expect(staffKitchen3dPathOf({ locale: "ro", kitchenId: ID })).toBe(
      `/ro/staff/kitchens/${ID}/3d`,
    );
    expect(staffKitchen3dPathOf({ locale: "ru", kitchenId: ID })).toBe(
      `/ru/staff/kitchens/${ID}/3d`,
    );
  });

  it.each(["sent", "current"] as const)(
    "carries the copy %s the person chose, as the one query member",
    (version) => {
      expect(
        staffKitchen3dPathOf({ locale: "ro", kitchenId: ID, version }),
      ).toBe(`/ro/staff/kitchens/${ID}/3d?version=${version}`);
    },
  );

  it.each([
    ["too short", "abc"],
    ["a climb", "../../../account/profile"],
    ["a query", `${"k".repeat(19)}?x`],
    ["nothing", ""],
  ])(
    "writes nothing of an id that is %s, and leads to the list",
    (_, hostile) => {
      expect(
        staffKitchen3dPathOf({
          locale: "ru",
          kitchenId: hostile,
          version: "current",
        }),
      ).toBe("/ru/staff/kitchens");
    },
  );
});
