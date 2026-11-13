// One id as one path segment, for every list that puts an item under its address.
import { describe, expect, it } from "vitest";

import { segmentOf } from "@/price-dashboard/path-segment";

describe("an id as a path segment", () => {
  it("leaves an ordinary id as it is", () => {
    expect(segmentOf("hardware.soft-close")).toBe("hardware.soft-close");
  });

  it("encodes a character that would open another segment", () => {
    expect(segmentOf("a/b c")).toBe("a%2Fb%20c");
  });

  it.each([".", ".."])(
    "doubly encodes the dots of the id %s, which a URL parser reads as a dot segment",
    (id) => {
      expect(segmentOf(id)).toBe(id.replaceAll(".", "%252E"));
    },
  );

  it("keeps a dot inside a longer id single", () => {
    expect(segmentOf("..a")).toBe("..a");
  });
});
