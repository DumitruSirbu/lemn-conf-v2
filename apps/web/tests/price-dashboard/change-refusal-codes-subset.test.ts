// M10 wave M1 (adversarial QA): `applyChanges` refuses with the domain's `CHANGE_REFUSAL_CODES`, and the wire answers a
// draft change with `DRAFT_CHANGE_REFUSAL_CODES`. The domain cannot import the web's list, so only a web test can hold
// the first inside the second: a code the domain invents and the wire does not name would reach a client unmapped.
import {
  CHANGE_REFUSAL_CODES,
  type ChangeRefusalCode,
} from "@lemnaria/configurator-domain";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DRAFT_CHANGE_REFUSAL_CODES,
  NUMBER_REFUSAL_CODES,
  TEXT_REFUSAL_CODES,
  type DraftChangeRefusalCode,
} from "@/price-dashboard/price-dashboard-wire-contract";

describe("the codes the domain refuses a change with are codes the wire names", () => {
  it("lists eighteen domain codes, so an added one is looked at here", () => {
    expect([...CHANGE_REFUSAL_CODES].sort()).toEqual(
      [
        "CREATED_TIER_RATES_MISSING",
        "FIELD_NOT_ON_RULE",
        "ITEM_IS_DEFAULT",
        "LINK_TARGET_CUSTOMER_SUPPLIED",
        "LINK_TARGET_UNKNOWN",
        "TEXT_EMPTY",
        "TEXT_FORBIDDEN_CHARACTER",
        "TEXT_STATES_AN_AMOUNT",
        "TEXT_TOO_LONG",
        "MISSING_VALUE",
        "NEGATIVE",
        "NOT_A_WHOLE_NUMBER",
        "NOT_EDITABLE",
        "TOO_LARGE",
        "ZERO",
        "UNKNOWN_ADDRESS",
        "UNKNOWN_ITEM",
        "UNKNOWN_RULE",
      ].sort(),
    );
  });

  it.each([...CHANGE_REFUSAL_CODES])("the wire names %s", (code) => {
    expect(DRAFT_CHANGE_REFUSAL_CODES as readonly string[]).toContain(code);
  });

  it("holds at the type level: every domain code is a wire code", () => {
    expectTypeOf<ChangeRefusalCode>().toExtend<DraftChangeRefusalCode>();
  });

  it("names no code twice, as the domain's words and the wire's own are separate lists", () => {
    expect(new Set(DRAFT_CHANGE_REFUSAL_CODES).size).toBe(
      DRAFT_CHANGE_REFUSAL_CODES.length,
    );
  });

  it("holds every text refusal the wire names inside the domain's codes: the judgement of a created row's words", () => {
    for (const code of TEXT_REFUSAL_CODES) {
      expect(CHANGE_REFUSAL_CODES as readonly string[]).toContain(code);
    }
  });

  it("the four value codes of the domain are the wire's number refusals, no more and no fewer", () => {
    const valueCodes = CHANGE_REFUSAL_CODES.filter((code) =>
      (NUMBER_REFUSAL_CODES as readonly string[]).includes(code),
    );

    expect([...valueCodes].sort()).toEqual([...NUMBER_REFUSAL_CODES].sort());
  });
});
