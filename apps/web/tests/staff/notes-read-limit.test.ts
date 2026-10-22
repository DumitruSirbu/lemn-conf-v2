// The figure the staff page caps its list of notes at (the domain's) and the figure the reader of the persistence package
// reads up to are two statements of one number; the page's cap is only right while they are equal.
import { NOTES_SHOWN_AT_MOST } from "@lemnaria/configurator-domain";
import { NOTES_READ_LIMIT } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

describe("the number of notes a kitchen's read carries", () => {
  it("is the same in the domain, which the page caps its list at, and in the reader", () => {
    expect(NOTES_SHOWN_AT_MOST).toBe(NOTES_READ_LIMIT);
  });
});
