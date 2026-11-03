// The materials pages' addresses: a material's stands under the list's, in one segment whatever its id holds.
import { describe, expect, it } from "vitest";

import {
  materialPathOf,
  materialsPathOf,
} from "@/price-dashboard/material-paths";

describe("the list's address", () => {
  it("is the materials page under the catalog family, in the locale asked", () => {
    expect(materialsPathOf("ro")).toBe("/ro/staff/catalog/materials");
    expect(materialsPathOf("ru")).toBe("/ru/staff/catalog/materials");
  });
});

describe("a material's address", () => {
  it("stands under the list's in one segment", () => {
    expect(materialPathOf("ro", "material.painted-mdf")).toBe(
      "/ro/staff/catalog/materials/material.painted-mdf",
    );
  });

  it("encodes a character that would open another segment", () => {
    expect(materialPathOf("ro", "a/b c")).toBe(
      "/ro/staff/catalog/materials/a%2Fb%20c",
    );
  });

  it.each([".", ".."])(
    "doubly encodes the dot of the id %s, which a URL parser reads as a dot segment",
    (id) => {
      expect(materialPathOf("ro", id)).toBe(
        `/ro/staff/catalog/materials/${id.replaceAll(".", "%252E")}`,
      );
    },
  );
});
