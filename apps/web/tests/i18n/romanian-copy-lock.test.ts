import { describe, expect, it } from "vitest";

import ro from "@/messages/ro.json";

import {
  APPROVED_ROMANIAN_MESSAGES,
  isRomanianCopyApproved,
} from "../support/approved-romanian-messages";
import { withoutDraftCopy } from "../support/draft-romanian-copy";

describe("Romanian catalogue copy lock", () => {
  // **The lock is held to the catalogue's approved part, and only that.** The account screens' wording is owner-unapproved
  // draft copy (open questions O13 and O27): it is not pasted into the lock, which would record an approval nobody gave,
  // and it is not left to turn this test red for ever, which hides every real change. It is named, unit by unit, in
  // `draft-romanian-copy.ts` and pinned by digest in `romanian-draft-copy.test.ts`. A namespace that is in neither place
  // fails there, so this carve-out cannot swallow copy that nobody classified.
  //
  // Not *"every approved leaf"*: the assertion is a deep equality in both directions, and the corpus
  // carries a few marked-drafted leaves alongside the approved ones so that it can be one (see
  // `approved-romanian-messages.ts`'s header). What goes red here is a catalogue leaf that changed,
  // appeared or disappeared — approved or drafted alike — which is more than approval and is the
  // point.
  it("holds the approved part of ro.json to the locked corpus leaf for leaf, without snapshot update semantics", () => {
    expect(withoutDraftCopy(ro)).toEqual(APPROVED_ROMANIAN_MESSAGES);
  });

  it("does not take the whole catalogue for approved: its draft units are outside the lock", () => {
    expect(isRomanianCopyApproved(ro)).toBe(false);
    expect(isRomanianCopyApproved(withoutDraftCopy(ro))).toBe(true);
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
