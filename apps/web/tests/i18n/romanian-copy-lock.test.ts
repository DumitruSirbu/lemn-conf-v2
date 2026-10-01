import { describe, expect, it } from "vitest";

import ro from "@/messages/ro.json";

import {
  APPROVED_ROMANIAN_MESSAGES,
  isRomanianCopyApproved,
} from "../support/approved-romanian-messages";

describe("Romanian catalogue copy lock", () => {
  // Not *"every approved leaf"*: the assertion is a deep equality in both directions, and the corpus
  // carries a few marked-drafted leaves alongside the approved ones so that it can be one (see
  // `approved-romanian-messages.ts`'s header). What goes red here is a catalogue leaf that changed,
  // appeared or disappeared — approved or drafted alike — which is more than approval and is the
  // point.
  it("holds ro.json to the locked corpus leaf for leaf, without snapshot update semantics", () => {
    expect(ro).toEqual(APPROVED_ROMANIAN_MESSAGES);
  });

  it("uses the copy lock's structural equality for catalogue-shaped data", () => {
    const equalCatalogue: unknown = JSON.parse(
      JSON.stringify(APPROVED_ROMANIAN_MESSAGES),
    );
    expect(equalCatalogue).toEqual(APPROVED_ROMANIAN_MESSAGES);
    expect(isRomanianCopyApproved(equalCatalogue)).toBe(true);

    const changedCatalogue = {
      ...APPROVED_ROMANIAN_MESSAGES,
      webglUnavailable: {
        ...APPROVED_ROMANIAN_MESSAGES.webglUnavailable,
        titleDesktop: `${APPROVED_ROMANIAN_MESSAGES.webglUnavailable.titleDesktop}!`,
      },
    };
    expect(changedCatalogue).not.toEqual(APPROVED_ROMANIAN_MESSAGES);
    expect(isRomanianCopyApproved(changedCatalogue)).toBe(false);
  });
});
