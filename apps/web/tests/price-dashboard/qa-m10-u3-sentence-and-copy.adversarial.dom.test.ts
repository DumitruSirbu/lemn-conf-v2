// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U3, the live sentence and the words of the page (U3 row; ADR 0177 A-3). The developer pins the
// sentence of the base cabinet and the pantry's door clause once. This takes every rule and every typed amount: each
// amount typed must appear in the sentence, the door clause must say the leaves the catalogue steps by (counted here from
// the independent preview, not from the page's own facts) times the typed door price, and a field that does not read
// must leave the sentence at the amount the draft holds. It also draws every rule in both languages and looks for the
// marks a missing or mistyped argument leaves in a message, and for catalogue leaves the page was meant to read and does
// not.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { deriveCabinetDetail } from "@/price-dashboard/cabinet-detail-model";
import { formatLei } from "@/price-dashboard/format-lei";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { filesUnder } from "../support/files-under";
import { requireIn } from "../support/render-with-intl";
import {
  atIndex,
  mountDetail,
  typeInField,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { pageOf } from "./dashboard-state-fixture";
import { ALL_RULE_IDS, independentPreview, ruleIn } from "./qa-m10-u3-support";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";
import roMessages from "../../src/messages/ro.json";

const lei = (minor: number) => formatLei(minor, "lei");
const MANUFACTURER_RULE_IDS = ALL_RULE_IDS.filter(
  (ruleId) => ruleIn(SAMPLE_PRICE_BOOK, ruleId).suppliedBy !== "customer",
);
const SENTENCE = '[data-testid="cabinet-price-sentence"]';
const BANI_PER_LEU = 100;
/** The minus sign (U+2212) that only the door clause writes before its amount. */
const DOOR_CLAUSE_SIGN = "\u2212";
const TYPED_LEI = ["130", "10", "1000", "4310"] as const;

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

function readyDetail(ruleId: string) {
  const detail = deriveCabinetDetail(pageOf(), ruleId);
  if (detail.kind !== "ready") throw new Error(`${ruleId} is not ready`);
  return detail;
}

function labelsOf(ruleId: string, container: HTMLElement): string[] {
  const count = readyDetail(ruleId).fields.length;
  return Array.from(container.querySelectorAll("label"))
    .filter((label) => label.htmlFor !== "")
    .slice(0, count)
    .map((label) => label.textContent.trim());
}

describe("the sentence says every amount typed, for every rule", () => {
  it.each(MANUFACTURER_RULE_IDS)(
    "%s: each field's typed amount is in the sentence when the field is one the sentence speaks of",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);
      const { container } = mounted;
      const detail = readyDetail(ruleId);
      const labels = labelsOf(ruleId, container);
      expect(labels).toHaveLength(detail.fields.length);

      for (const typedLei of TYPED_LEI) {
        for (const [index, field] of detail.fields.entries()) {
          typeInField(container, atIndex(labels, index), typedLei);
          const sentence = requireIn(container, SENTENCE).textContent;
          const amount = lei(Number(typedLei) * BANI_PER_LEU);
          if (field.role === "door") continue;
          expect(
            sentence,
            `${field.key} typed ${typedLei} is missing from "${sentence}"`,
          ).toContain(amount);
        }
        expect(requireIn(container, SENTENCE).textContent).not.toMatch(
          /(^|[^\d])0[ \u00a0]mm/,
        );
      }
    },
  );

  it.each(MANUFACTURER_RULE_IDS)(
    "%s: a field that does not read leaves the sentence at the amount the draft holds, and the typed words never reach it",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);
      const { container } = mounted;
      const detail = readyDetail(ruleId);
      const before = requireIn(container, SENTENCE).textContent;

      for (const [index, field] of detail.fields.entries()) {
        typeInField(
          container,
          atIndex(labelsOf(ruleId, container), index),
          "abc",
        );
        expect(requireIn(container, SENTENCE).textContent, field.key).toBe(
          before,
        );
        typeInField(
          container,
          atIndex(labelsOf(ruleId, container), index),
          String(field.pendingMinor / BANI_PER_LEU),
        );
      }
      expect(requireIn(container, SENTENCE).textContent).not.toContain("abc");
    },
  );
});

describe("the door clause names the leaves the catalogue steps by (A-3)", () => {
  const DOOR_RULE_IDS = MANUFACTURER_RULE_IDS.filter((ruleId) =>
    readyDetail(ruleId).fields.some(({ role }) => role === "door"),
  );

  it("is swept over every rule that has a door price, of more than one leaf count", () => {
    const steps = DOOR_RULE_IDS.map(
      (ruleId) => readyDetail(ruleId).facts.doorStep?.leaves,
    );

    expect(DOOR_RULE_IDS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(steps).size).toBeGreaterThanOrEqual(2);
  });

  it.each(DOOR_RULE_IDS)(
    "%s: the amount is the typed door price times the leaves added where the preview steps, for each price typed",
    async (ruleId) => {
      mounted = await mountDetail(ruleId);
      const { container } = mounted;
      const rows = independentPreview(SAMPLE_PRICE_BOOK, ruleId, {
        material: SAMPLE_PRICE_BOOK.material.defaultTierId,
        isDeep: false,
      });
      const stepIndex = rows.findIndex(({ isDoorStep }) => isDoorStep);
      const step = atIndex(rows, stepIndex);
      const leavesAdded =
        step.doorLeaves - atIndex(rows, stepIndex - 1).doorLeaves;
      const detail = readyDetail(ruleId);
      const doorIndex = detail.fields.findIndex(({ role }) => role === "door");
      const label = atIndex(labelsOf(ruleId, container), doorIndex);

      for (const typedLei of TYPED_LEI) {
        typeInField(container, label, typedLei);

        expect(requireIn(container, SENTENCE).textContent).toContain(
          roCopy("priceDashboard.cabinet.summaryDoor", {
            atMm: step.widthMm,
            doorCount: leavesAdded,
            amount: lei(Number(typedLei) * BANI_PER_LEU * leavesAdded),
          }),
        );
      }
    },
  );

  it("is absent where no leaf is added, and where the step falls above the anchor", async () => {
    for (const ruleId of MANUFACTURER_RULE_IDS) {
      if (DOOR_RULE_IDS.includes(ruleId)) continue;
      mounted = await mountDetail(ruleId);

      expect(
        requireIn(mounted.container, SENTENCE).textContent,
        ruleId,
      ).not.toContain(DOOR_CLAUSE_SIGN);
      mounted.unmount();
      mounted = undefined;
    }
  });
});

describe("the words of the page, drawn for every rule in both languages", () => {
  const MARKS_OF_A_BROKEN_MESSAGE =
    /[{}]|undefined|NaN|Infinity|\[object|priceDashboard\./;

  it.each(
    ALL_RULE_IDS.flatMap(
      (ruleId) =>
        [
          [ruleId, "ro"],
          [ruleId, "ru"],
        ] as const,
    ),
  )(
    "%s in %s: shows no brace, no `undefined`, no `NaN` and no key",
    async (ruleId, locale) => {
      mounted = await mountDetail(ruleId, { locale });

      expect(mounted.container.textContent).not.toMatch(
        MARKS_OF_A_BROKEN_MESSAGE,
      );
      expect(mounted.container.textContent.trim().length).toBeGreaterThan(200);
    },
  );
});

describe("the page's own leaves", () => {
  const PAGE_NAMESPACE = "priceDashboard.cabinet";
  /**
   * Leaves wave T1 wrote that no module reads, each with what the frames draw where it would be read. A leaf a frame
   * draws and the page does not is a departure from the frame; none of these is recorded as one in the plan or an ADR.
   */
  const UNREAD_WITH_THE_FRAME_THAT_DRAWS_IT: Readonly<Record<string, string>> =
    {
      "priceDashboard.cabinet.followsBase":
        "D3D draws the wall cabinet's default width as this; the catalogue has no such source (generator, only-width, proposed), so the page shows the width",
      "priceDashboard.cabinet.wallRows":
        "D3D draws the body height as 700 / 350 with this hint; the page draws the nominal height alone",
      "priceDashboard.cabinet.noMaxHeight":
        "D3D draws the greatest height as a dash with this hint; the page draws the catalogue's greatest buildable height",
      "priceDashboard.cabinet.hardwareLink":
        "D3A draws a link to the hardware page in the readout; that page is wave U4a's, and the menu links to built pages only",
      "priceDashboard.cabinet.liftCount":
        "D3 draws a lift mechanism in the readout; the book has no lift rate before A-20",
      "priceDashboard.cabinet.activeCell": "no D3 frame draws it",
      "priceDashboard.cabinet.pendingNotice": "no D3 frame draws it",
    };
  function leavesUnder(
    tree: Record<string, unknown>,
    prefix: string,
  ): string[] {
    return Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "object" && value !== null
        ? leavesUnder(value as Record<string, unknown>, `${prefix}.${key}`)
        : [`${prefix}.${key}`],
    );
  }

  const sources = filesUnder(join(import.meta.dirname, "../../src"))
    .filter((path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".d.json.ts"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  it("is read by the code, leaf by leaf, except the seven named with the frame that would draw them", () => {
    const unread = leavesUnder(
      roMessages.priceDashboard.cabinet as unknown as Record<string, unknown>,
      PAGE_NAMESPACE,
    ).filter((key) => !sources.includes(key));

    expect(
      unread.filter((key) => !(key in UNREAD_WITH_THE_FRAME_THAT_DRAWS_IT)),
    ).toEqual([]);
  });
});
