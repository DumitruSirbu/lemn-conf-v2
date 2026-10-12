import type { DesignId } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { BreakdownRow } from "@/price/price-breakdown-model";
import { doneHref, editorHref, reviewHref } from "@/review/design-hrefs";
import { selectingTheFirstBody } from "@/review/review-groups";

const DESIGN_ID = "design-1" as DesignId;

describe("the design's hrefs", () => {
  it("names the review of the design, without a locale, which the navigation adds", () => {
    expect(reviewHref(DESIGN_ID)).toBe("/d/design-1/review");
  });

  it("names the confirmation of the design, without a locale and with no query, whatever the design's id", () => {
    expect(doneHref(DESIGN_ID)).toBe("/d/design-1/done");
    expect(doneHref(DESIGN_ID)).not.toMatch(/[?#]/);
  });

  it("names the editor with the arrival it is asked for", () => {
    expect(editorHref(DESIGN_ID)).toEqual({
      pathname: "/d/design-1",
      query: {},
    });
    expect(editorHref(DESIGN_ID, { select: "p1" }).query).toEqual({
      select: "p1",
    });
  });
});

describe("selectingTheFirstBody", () => {
  const rows: readonly BreakdownRow[] = [
    { key: "p1", label: "first", amountText: "1" },
    { key: "p2", label: "second", amountText: "2" },
  ];

  it("selects the first row's body", () => {
    expect(selectingTheFirstBody(rows)).toEqual({ select: "p1" });
  });

  it("names no body for no rows", () => {
    expect(selectingTheFirstBody([])).toEqual({});
  });
});
