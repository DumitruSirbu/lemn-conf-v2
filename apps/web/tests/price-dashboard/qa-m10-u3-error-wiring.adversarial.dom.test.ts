// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U3, where a price the rule cannot take is told (frame D3C: "the field is marked and Save is
// blocked"; the U acceptance: "every input has a visible label and unit, and its error is tied to it"). The developer
// pins the base cabinet's minus step and a wall cabinet's height step. This takes every manufacturer rule, every field of
// it, and two values that read as amounts but are not prices: nothing, and more than a cabinet may cost. The field to
// blame is asked of `judgePricesOfRule` directly, apart from the page's own `judgement`, and the page must put the one
// alert on that field, tie it with `aria-describedby`, mark that input and no other `aria-invalid`, block Save, and say
// why Save is blocked.
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyChanges,
  judgePricesOfRule,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { deriveCabinetDetail } from "@/price-dashboard/cabinet-detail-model";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn } from "../support/render-with-intl";
import {
  atIndex,
  buttonNamed,
  mountDetail,
  saveWords,
  typeInField,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { pageOf } from "./dashboard-state-fixture";
import {
  ALL_RULE_IDS,
  INDEPENDENT_CATALOGUE,
  ruleIn,
} from "./qa-m10-u3-support";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const MANUFACTURER_RULE_IDS = ALL_RULE_IDS.filter(
  (ruleId) => ruleIn(SAMPLE_PRICE_BOOK, ruleId).suppliedBy !== "customer",
);
const BANI_PER_LEU = 100;
/** More than a cabinet may cost (`MAX_CABINET_AMOUNT_MINOR` is about five million lei), and still an amount a field reads. */
const MORE_THAN_A_CABINET_LEI = "30000000";
const VALUES_THAT_ARE_NOT_PRICES = ["0", MORE_THAN_A_CABINET_LEI] as const;

let mounted: MountedDetail | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

function roundUpToGrid(widthMm: number): number {
  return Math.ceil(widthMm / 50) * 50;
}

/** The index, among the page's fields, of the one the rule's judgement blames for the typed book; `undefined` if none. */
function blamedFieldIndex(
  ruleId: string,
  book: PriceBook,
): number | "unplaced" | undefined {
  const refusal = judgePricesOfRule(
    ruleIn(book, ruleId),
    INDEPENDENT_CATALOGUE,
  );
  if (refusal === undefined) return undefined;
  if (
    refusal.code !== "PRICE_NOT_POSITIVE" &&
    refusal.code !== "PRICE_TOO_LARGE"
  ) {
    return "unplaced";
  }
  const { fields } = readyDetail(ruleId);
  const index = fields.findIndex(({ address }) =>
    refusal.field === "amountMinor"
      ? address.kind === "cabinet-size" &&
        address.widthMm === roundUpToGrid(refusal.widthMm)
      : address.kind === "cabinet" && address.field === refusal.field,
  );
  return index < 0 ? "unplaced" : index;
}

function readyDetail(ruleId: string) {
  const detail = deriveCabinetDetail(pageOf(), ruleId);
  if (detail.kind !== "ready") throw new Error(`${ruleId} is not ready`);
  return detail;
}

describe("the field a refused price is told on", () => {
  const cases = MANUFACTURER_RULE_IDS.flatMap((ruleId) =>
    readyDetail(ruleId).fields.flatMap((field, index) =>
      VALUES_THAT_ARE_NOT_PRICES.map(
        (typedLei) => [ruleId, index, field.key, typedLei] as const,
      ),
    ),
  );

  it("reaches every field of every manufacturer rule with each value", () => {
    expect(cases.length).toBeGreaterThan(60);
  });

  it.each(cases)(
    "%s, field %i (%s) typed %s: the alert is on the field the rule's judgement blames, tied to it, alone, with Save off and the reason given",
    async (ruleId, index, _key, typedLei) => {
      mounted = await mountDetail(ruleId);
      const { container } = mounted;
      const detail = readyDetail(ruleId);
      const typedField = atIndex(detail.fields, index);
      const changed = applyChanges(detail.candidate, [
        {
          address: typedField.address,
          value: Number(typedLei) * BANI_PER_LEU,
        } as DraftChange,
      ]);
      if (!changed.ok) throw new Error("the typed amount makes no book");
      const blamed = blamedFieldIndex(ruleId, changed.book);
      const labels = allIn<HTMLLabelElement>(container, "label")
        .filter((label) => label.htmlFor !== "")
        .map((label) => label.textContent.trim());

      typeInField(container, atIndex(labels, index), typedLei);

      const inputs = allIn<HTMLInputElement>(container, 'input[type="text"]');
      const invalid = inputs.filter(
        (input) => input.getAttribute("aria-invalid") === "true",
      );
      const alerts = allIn(container, '[role="alert"]');
      const save = buttonNamed(container, saveWords());
      if (blamed === undefined) {
        expect(invalid).toEqual([]);
        expect(alerts).toEqual([]);
        expect(save.disabled).toBe(false);
        return;
      }
      expect(blamed, "the judgement blames a field the page has").not.toBe(
        "unplaced",
      );
      expect(invalid).toHaveLength(1);
      expect(alerts).toHaveLength(1);
      expect(invalid[0]).toBe(atIndex(inputs, blamed as number));
      expect(
        invalid[0]?.getAttribute("aria-describedby")?.split(" "),
      ).toContain(atIndex(alerts, 0).id);
      expect(atIndex(alerts, 0).textContent.trim().length).toBeGreaterThan(0);
      expect(save.disabled).toBe(true);
      expect(container.textContent).toContain(
        roCopy("priceDashboard.errors.fixToSave"),
      );
    },
  );
});

describe("the same refusals in Russian (frame D3R)", () => {
  const ruCopy = createTranslator({
    locale: "ru",
    messages: ruMessages as typeof roMessages,
  });

  it.each([
    [
      "a minus step that takes a width to zero",
      "cabinet.base-cabinet",
      "minus",
      "18000",
      ruCopy("priceDashboard.errors.priceNotPositiveAtWidth", { widthMm: 200 }),
    ],
    [
      "words where an amount is owed",
      "cabinet.base-cabinet",
      "anchor",
      "abc",
      ruCopy("priceDashboard.errors.notNumber", { example: "450,00" }),
    ],
  ])(
    "%s: is told in Russian, on the field, with Save off",
    async (_name, ruleId, which, typed, words) => {
      mounted = await mountDetail(ruleId, { locale: "ru" });
      const { container } = mounted;
      const labels = allIn<HTMLLabelElement>(container, "label")
        .filter((label) => label.htmlFor !== "")
        .map((label) => label.textContent.trim());
      const label = atIndex(labels, which === "anchor" ? 0 : 2);

      typeInField(container, label, typed);

      expect(
        allIn(container, '[role="alert"]').map((alert) =>
          alert.textContent.trim(),
        ),
      ).toEqual([words]);
      expect(
        buttonNamed(container, ruCopy("priceDashboard.common.save")).disabled,
      ).toBe(true);
    },
  );
});
