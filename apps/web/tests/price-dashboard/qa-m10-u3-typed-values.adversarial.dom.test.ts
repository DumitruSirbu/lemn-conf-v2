// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U3, what is typed into a cabinet's fields (U3 row: "Save off when judged invalid", A-5,
// ADR 0001's 2026-10-28 amendment). The developer's tests type a handful of values into the base cabinet; here every
// manufacturer rule of the shipped book takes every field a value from a range that runs from nothing through zero,
// negatives, non-multiples of ten lei and the greatest a field reads, to far past it. The properties are stated against
// `judgePricesOfRule` asked directly, not against the page's own `judgement`: a Save that is on must send prices a
// publish would take, a Save that is off with something changed must be explained to the person, and no value may crash
// the hook that every field is typed through.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyChanges,
  judgePricesOfRule,
  MAX_PRICE_COEFFICIENT_MINOR,
  SAMPLE_PRICE_BOOK,
  TEN_LEI_MINOR,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { deriveCabinetDetail } from "@/price-dashboard/cabinet-detail-model";
import type { CabinetDetailDerivation } from "@/price-dashboard/cabinet-detail-model";
import {
  useCabinetPriceEditing,
  type CabinetPriceEditing,
} from "@/price-dashboard/use-cabinet-price-editing";
import type { PriceDraft } from "@/price-dashboard/use-price-draft";

import { renderHook, type RenderedHook } from "../support/render-hook";
import { pageOf } from "./dashboard-state-fixture";
import {
  ALL_RULE_IDS,
  INDEPENDENT_CATALOGUE,
  ruleIn,
} from "./qa-m10-u3-support";

const MANUFACTURER_RULE_IDS = ALL_RULE_IDS.filter(
  (ruleId) => ruleIn(SAMPLE_PRICE_BOOK, ruleId).suppliedBy !== "customer",
);
const BANI_PER_LEU = 100;
const MAX_LEI_TEXT = String(
  Math.floor(MAX_PRICE_COEFFICIENT_MINOR / BANI_PER_LEU),
);
/** The greatest whole ten lei a field reads: past a cabinet's own greatest price, so the rule must refuse what the field accepts. */
const MAX_READABLE_LEI_TEXT = String(
  Math.floor(MAX_PRICE_COEFFICIENT_MINOR / TEN_LEI_MINOR) * 10,
);
const MAX_TENS_OF_LEI = Math.floor(MAX_PRICE_COEFFICIENT_MINOR / TEN_LEI_MINOR);

const EDGE_TEXTS = [
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
  MAX_LEI_TEXT,
  String(Number(MAX_LEI_TEXT) - 10),
  String(Number(MAX_LEI_TEXT) + 10),
  "9".repeat(40),
  "0".repeat(400),
  "1".repeat(400),
] as const;

const typedText = fc.oneof(
  fc.constantFrom(...EDGE_TEXTS),
  fc
    .integer({ min: 0, max: MAX_TENS_OF_LEI + 3 })
    .map((tens) => String(tens * 10)),
  fc.integer({ min: 0, max: 6000 }).map((tens) => String(tens * 10)),
  fc.string({ maxLength: 12 }),
);

let mountedHook: RenderedHook<CabinetPriceEditing> | undefined;

afterEach(() => {
  mountedHook?.unmount();
  mountedHook = undefined;
});

interface Sent {
  readonly changes: DraftChange[];
  readonly reverts: unknown[];
}

function mountEditing(ruleId: string): {
  readonly detail: Extract<CabinetDetailDerivation, { kind: "ready" }>;
  readonly editing: () => CabinetPriceEditing;
  readonly sent: Sent;
} {
  const detail = deriveCabinetDetail(pageOf(), ruleId);
  if (detail.kind !== "ready") throw new Error(`${ruleId} is not ready`);
  const sent: Sent = { changes: [], reverts: [] };
  const draft: Pick<PriceDraft, "changeOrRevert" | "isBusy"> = {
    isBusy: false,
    changeOrRevert: (wanted, activeValue) => {
      if (wanted.value === activeValue) {
        sent.reverts.push({ kind: "change", address: wanted.address });
      } else {
        sent.changes.push(wanted as DraftChange);
      }
      return Promise.resolve({ kind: "saved" });
    },
  };
  mountedHook = renderHook(() =>
    useCabinetPriceEditing({
      fields: detail.fields,
      candidate: detail.candidate,
      ruleId,
      draft,
    }),
  );
  const current = mountedHook;
  return { detail, editing: () => current.result.current, sent };
}

function typeAll(
  editing: () => CabinetPriceEditing,
  texts: Readonly<Record<string, string>>,
): void {
  for (const [key, text] of Object.entries(texts)) {
    act(() => {
      editing().type(key, text);
    });
  }
}

/** The rule as the book would hold it once Save had landed every amount typed, or `undefined` if no book is made. */
function ruleAfterSave(
  detail: Extract<CabinetDetailDerivation, { kind: "ready" }>,
  editing: CabinetPriceEditing,
  ruleId: string,
) {
  const changes = editing.states.flatMap(({ field, reading }) =>
    reading.kind === "amount" && reading.minor !== field.pendingMinor
      ? [{ address: field.address, value: reading.minor } as DraftChange]
      : [],
  );
  const applied = applyChanges(detail.candidate, changes);
  return applied.ok ? ruleIn(applied.book, ruleId) : undefined;
}

describe("every field of every manufacturer rule, typed over a range from nothing to far past the greatest", () => {
  it("reaches a rule of every shape, so the sweep is not one shape deep", () => {
    const shapes = new Set(
      MANUFACTURER_RULE_IDS.map(
        (ruleId) => ruleIn(SAMPLE_PRICE_BOOK, ruleId).formula.shape,
      ),
    );

    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });

  propertyTest.prop(
    [
      fc.constantFrom(...MANUFACTURER_RULE_IDS),
      fc.array(typedText, { minLength: 8, maxLength: 8 }),
    ],
    { numRuns: 400 },
  )(
    "a Save that is on sends prices the rule can be published with; a Save that is off with a change is explained; nothing crashes",
    (ruleId, texts) => {
      const { detail, editing } = mountEditing(ruleId);
      const keys = detail.fields.map(({ key }) => key);
      typeAll(
        editing,
        Object.fromEntries(keys.map((key, index) => [key, texts[index] ?? ""])),
      );
      const now = editing();
      const refusedReading = now.states.some(
        ({ reading }) => reading.kind === "refused",
      );

      if (now.canSave) {
        const rule = ruleAfterSave(detail, now, ruleId);
        expect(rule, "the typed amounts make a book").toBeDefined();
        if (rule === undefined) return;
        expect(judgePricesOfRule(rule, INDEPENDENT_CATALOGUE)).toBeUndefined();
        expect(refusedReading).toBe(false);
      }
      if (now.isChanged && !now.canSave) {
        expect(
          refusedReading || now.judgement !== undefined,
          `Save is off with a change and the page says nothing (typed ${JSON.stringify(texts)})`,
        ).toBe(true);
      }
      if (now.pricedBook !== undefined) {
        expect(
          judgePricesOfRule(
            ruleIn(now.pricedBook, ruleId),
            INDEPENDENT_CATALOGUE,
          ),
          "the table is drawn from a book whose prices are not prices",
        ).toBeUndefined();
      }
      if (now.judgement !== undefined && now.judgement.kind !== "unplaced") {
        expect(keys).toContain(now.judgement.fieldKey);
      }
    },
  );

  it.each(MANUFACTURER_RULE_IDS)(
    "%s: the greatest amount a field reads in every field at once is read as an amount, refused by the rule, and told on a field",
    (ruleId) => {
      const { detail, editing } = mountEditing(ruleId);
      typeAll(
        editing,
        Object.fromEntries(
          detail.fields.map(({ key }) => [key, MAX_READABLE_LEI_TEXT]),
        ),
      );
      const now = editing();
      const rule = ruleAfterSave(detail, now, ruleId);

      expect(
        now.states.every(({ reading }) => reading.kind === "amount"),
        "the greatest whole ten lei reads as an amount",
      ).toBe(true);
      expect(rule).toBeDefined();
      expect(
        now.canSave,
        "a cabinet past its greatest price is not saved",
      ).toBe(false);
      expect(now.judgement, "the refusal is told on a field").toBeDefined();
    },
  );

  it.each(MANUFACTURER_RULE_IDS)(
    "%s: zero in every field is refused somewhere the person can see it, and never offered for Save",
    (ruleId) => {
      const { detail, editing } = mountEditing(ruleId);
      typeAll(
        editing,
        Object.fromEntries(detail.fields.map(({ key }) => [key, "0"])),
      );
      const now = editing();

      expect(
        now.canSave,
        "a rule whose every price is zero must not be saved",
      ).toBe(false);
      expect(now.judgement).toBeDefined();
    },
  );
});

describe("the greatest amounts that pass the field's reading but fail the rule's", () => {
  it("refuses the greatest anchor with the greatest step on the cabinet that can carry both, with a message on a field", () => {
    const { detail, editing } = mountEditing("cabinet.tall-pantry");
    const anchorKey =
      detail.fields.find(({ role }) => role === "anchor")?.key ?? "";
    const plusKey =
      detail.fields.find(({ role }) => role === "plus")?.key ?? "";

    typeAll(editing, {
      [anchorKey]: MAX_READABLE_LEI_TEXT,
      [plusKey]: MAX_READABLE_LEI_TEXT,
    });
    const now = editing();

    expect(now.canSave).toBe(false);
    expect(
      now.judgement !== undefined && now.judgement.kind !== "unplaced"
        ? now.judgement.fieldKey
        : now.states.find(({ reading }) => reading.kind === "refused")?.field
            .key,
    ).toBeDefined();
  });
});

describe("a value equal to what the book already holds", () => {
  it.each(MANUFACTURER_RULE_IDS)(
    "%s: typing back every field's own draft amount changes nothing and leaves Save off with no Cancel needed",
    (ruleId) => {
      const { detail, editing } = mountEditing(ruleId);
      typeAll(
        editing,
        Object.fromEntries(
          detail.fields.map(({ key, pendingMinor }) => [
            key,
            String(pendingMinor / BANI_PER_LEU).replace(".", ","),
          ]),
        ),
      );

      expect(editing().isChanged).toBe(false);
      expect(editing().canSave).toBe(false);
    },
  );
});
