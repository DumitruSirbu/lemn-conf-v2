// The accessory pages' addresses: the list's, the creation form's and one accessory's, in one segment whatever its id holds.
import { describe, expect, it } from "vitest";

import {
  accessoriesPathOf,
  accessoryNewPathOf,
  accessoryPathOf,
} from "@/price-dashboard/accessory-paths";

describe("the accessory addresses", () => {
  it("stand under the list's, in the locale's own staff area", () => {
    expect(accessoriesPathOf("ro")).toBe("/ro/staff/catalog/accessories");
    expect(accessoriesPathOf("ru")).toBe("/ru/staff/catalog/accessories");
    expect(accessoryNewPathOf("ro")).toBe("/ro/staff/catalog/accessories/new");
    expect(accessoryPathOf("ru", "organiser")).toBe(
      "/ru/staff/catalog/accessories/organiser",
    );
  });

  it("keep an id in one segment, whatever characters it holds", () => {
    expect(accessoryPathOf("ro", "a/b c")).toBe(
      "/ro/staff/catalog/accessories/a%2Fb%20c",
    );
  });

  it("never let an id climb out of the list: the dot segments are encoded twice", () => {
    expect(accessoryPathOf("ro", "..")).toBe(
      "/ro/staff/catalog/accessories/%252E%252E",
    );
    expect(accessoryPathOf("ro", ".")).toBe(
      "/ro/staff/catalog/accessories/%252E",
    );
  });
});
