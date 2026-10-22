import { describe, expect, it } from "vitest";

import {
  CONFIGURATOR_DOMAIN_PACKAGE,
  KITCHEN_L_DESIGN,
  MalformedPriceCoefficientError,
  findOverflowingPlacementIds,
  judgeNoteText,
  readStaffAuditEntry,
  readStaffKitchenQuery,
  shownRequestStatus,
  type PriceCoefficientField,
} from "@lemnaria/configurator-domain";

describe("configurator-domain package", () => {
  it("exposes its built public package entry point", () => {
    expect(CONFIGURATOR_DOMAIN_PACKAGE).toBe("@lemnaria/configurator-domain");
  });

  it("publishes the domain-owned placement-overflow fact", () => {
    expect(findOverflowingPlacementIds(KITCHEN_L_DESIGN)).toEqual([]);
  });

  /** A domain error a caller outside the package cannot catch **by name** is only half-published,
   *  and the field type is what a caller reads off it to say which coefficient was malformed. */
  it("publishes the malformed-coefficient error and the field it names", () => {
    const field: PriceCoefficientField = "baseMinor";
    const error = new MalformedPriceCoefficientError({
      field,
      declared: undefined,
    });

    expect(error).toBeInstanceOf(MalformedPriceCoefficientError);
    expect(error).toBeInstanceOf(Error);
  });

  it("publishes the four staff-area readers", () => {
    expect(judgeNoteText("a\nb")).toEqual({ ok: true, text: "a\nb" });
    expect(readStaffKitchenQuery({ page: "2" })).toMatchObject({ ok: true });
    expect(readStaffAuditEntry("kitchen-opened", null)).toMatchObject({
      ok: true,
    });
    expect(shownRequestStatus({ isSent: true, recorded: null })).toBe("new");
  });
});
