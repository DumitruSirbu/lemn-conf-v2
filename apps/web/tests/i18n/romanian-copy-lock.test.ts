import { describe, expect, it } from "vitest";

import ro from "@/messages/ro.json";

import {
  APPROVED_ROMANIAN_MESSAGES,
  isRomanianCopyApproved,
} from "../support/approved-romanian-messages";

describe("Romanian catalogue copy lock", () => {
  it("matches every approved leaf without snapshot update semantics", () => {
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
