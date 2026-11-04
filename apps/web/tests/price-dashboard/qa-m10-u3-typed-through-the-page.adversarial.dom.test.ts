// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U3, typed values drawn by the page itself. `qa-m10-u3-typed-values` holds the editing hook to a
// range of values without drawing anything; the table and `formatLei` are drawn here. Every manufacturer rule is mounted
// once and every field takes, one after the other, every text of a range from nothing through negatives, non-multiples of
// ten lei, full-width digits and the greatest amount to hundreds of digits. After each keystroke: nothing throws, nothing is
// logged as an error, no price cell is anything but empty or a whole number of lei with its currency, and a field marked
// invalid is tied to exactly one alert.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_PRICE_COEFFICIENT_MINOR,
  SAMPLE_PRICE_BOOK,
  TEN_LEI_MINOR,
} from "@lemnaria/configurator-domain";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn } from "../support/render-with-intl";
import {
  buttonNamed,
  fieldNamed,
  mountDetail,
  saveWords,
  typeInField,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { ALL_RULE_IDS, ruleIn } from "./qa-m10-u3-support";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const MANUFACTURER_RULE_IDS = ALL_RULE_IDS.filter(
  (ruleId) => ruleIn(SAMPLE_PRICE_BOOK, ruleId).suppliedBy !== "customer",
);
const BANI_PER_LEU = 100;
const GREATEST_WHOLE_TEN_LEI = String(
  Math.floor(MAX_PRICE_COEFFICIENT_MINOR / TEN_LEI_MINOR) * 10,
);
const TEXTS = [
  "",
  " ",
  "0",
  "0,00",
  "00",
  "10",
  "-0",
  "-10",
  "−10",
  "5",
  "455",
  "450,5",
  "450,123",
  "1e5",
  "0x10",
  "NaN",
  "Infinity",
  "１０",
  "１２３４",
  "1 500",
  "1\u00a0500",
  String(Math.floor(MAX_PRICE_COEFFICIENT_MINOR / BANI_PER_LEU)),
  GREATEST_WHOLE_TEN_LEI,
  String(Number(GREATEST_WHOLE_TEN_LEI) + 10),
  "9".repeat(40),
  "1".repeat(400),
  "0".repeat(400),
  "30000000",
  "4310",
] as const;
/** A price drawn: whole lei, grouped by non-breaking spaces, then the currency's word. */
const DRAWN_PRICE = /^\d[\d\u00a0]*\u00a0lei$/;

let mounted: MountedDetail | undefined;
let consoleErrors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stubTheStaffServer();
  consoleErrors = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

describe("every field of every manufacturer rule, typed with each text of the range, drawn by the page", () => {
  it.each(MANUFACTURER_RULE_IDS)(
    "%s: no throw, no logged error, only drawable prices in the table, and an invalid field tied to one alert",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);
      const { container } = mounted;
      const labels = allIn<HTMLLabelElement>(container, "label")
        .filter((label) => label.htmlFor !== "")
        .map((label) => label.textContent.trim());
      expect(labels.length).toBeGreaterThan(0);

      for (const [index, label] of labels.entries()) {
        const startedAs = fieldNamed(container, label).value;
        for (const text of TEXTS) {
          typeInField(container, label, text);

          const where = `${ruleId} field ${String(index)} typed ${JSON.stringify(text.slice(0, 12))}`;
          for (const cell of allIn(container, "tbody td[data-role]")) {
            const drawn = cell.textContent.trim();
            expect(drawn === "" || DRAWN_PRICE.test(drawn), where).toBe(true);
          }
          const invalid = allIn(container, '[aria-invalid="true"]');
          const alerts = allIn(container, '[role="alert"]');
          expect(invalid.length, where).toBe(alerts.length);
          for (const input of invalid) {
            const owned = alerts.filter((alert) =>
              input
                .getAttribute("aria-describedby")
                ?.split(" ")
                .includes(alert.id),
            );
            expect(owned, where).toHaveLength(1);
          }
          if (invalid.length > 0) {
            expect(buttonNamed(container, saveWords()).disabled, where).toBe(
              true,
            );
          }
        }
        typeInField(container, label, startedAs);
      }
      expect(consoleErrors).not.toHaveBeenCalled();
    },
  );
});
