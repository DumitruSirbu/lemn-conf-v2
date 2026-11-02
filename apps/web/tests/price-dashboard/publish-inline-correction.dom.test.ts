// @vitest-environment happy-dom
//
// Frame D7A: the "Nou" of a pending price is corrected in the table. The field is the cabinet list's own (`PriceEditor`),
// so the ten-lei rule, a held price's exemption and the late answer are the list's; what this page adds is the write
// it goes through (a value equal to the active one takes the change out), the refusals told in the field, and the rows
// that get no field at all.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  AppliedAddress,
  DraftChange,
} from "@lemnaria/configurator-domain";

import type { DraftWriteOutcome } from "@/price-dashboard/publish-client";
import { formatLei } from "@/price-dashboard/format-lei";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";

import { allIn, click, requireIn, typeInto } from "../support/render-with-intl";
import {
  deferred,
  inputWithDraft,
  mountDesk,
  pressKey,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const BOOK = SAMPLE_PUBLISH_PAGE.state.active.book;
const LEI = 100;
const BASE_ANCHOR: AppliedAddress = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
};
const WALL_ANCHOR: AppliedAddress = {
  kind: "cabinet",
  ruleId: "cabinet.wall-cabinet",
  field: "anchorMinor",
};
const TWO_AMOUNT_ROWS = [
  changeTo(BASE_ANCHOR, 60 * LEI),
  changeTo(WALL_ANCHOR, 30 * LEI),
];

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

function anchorOf(ruleId: string): number {
  const formula = BOOK.cabinetRules.find(
    (rule) => rule.ruleId === ruleId,
  )?.formula;
  if (formula === undefined || !("anchorMinor" in formula)) {
    throw new Error(`${ruleId} has no anchor`);
  }
  return formula.anchorMinor;
}

/** The active anchor of `address`'s rule, raised by `riseMinor`. */
function changeTo(address: AppliedAddress, riseMinor: number): DraftChange {
  if (address.kind !== "cabinet") throw new Error("a cabinet address only");
  return {
    address,
    value: anchorOf(address.ruleId) + riseMinor,
  } as DraftChange;
}

function nameOfRule(ruleId: string): string {
  const buildId = BOOK.cabinetRules.find(
    (rule) => rule.ruleId === ruleId,
  )?.buildId;
  const name =
    buildId === undefined
      ? undefined
      : SAMPLE_PUBLISH_PAGE.cabinetNames[buildId];
  if (name === undefined) throw new Error(`${ruleId} has no name`);
  return name;
}

function rowOfRule(container: HTMLElement, ruleId: string): HTMLElement {
  const name = nameOfRule(ruleId);
  const found = allIn(container, '[data-testid="diff-row"]').find(
    (row) => row.querySelector('[class*="name"]')?.textContent === name,
  );
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

function priceButtonOf(
  container: HTMLElement,
  ruleId: string,
): HTMLButtonElement {
  return requireIn<HTMLButtonElement>(
    rowOfRule(container, ruleId),
    'button[class*="priceButton"]',
  );
}

function openFieldOf(container: HTMLElement, ruleId: string): HTMLInputElement {
  click(priceButtonOf(container, ruleId));
  return requireIn<HTMLInputElement>(rowOfRule(container, ruleId), "input");
}

function alertOf(container: HTMLElement, ruleId: string): string | undefined {
  return (
    rowOfRule(container, ruleId).querySelector('[role="alert"]')?.textContent ??
    undefined
  );
}

function figureOf(container: HTMLElement, ruleId: string): string | undefined {
  const cells = allIn(rowOfRule(container, ruleId), '[class*="cellValue"]');
  return cells[1]?.querySelector('[class*="priceText"]')?.textContent;
}

async function mount(
  changes: readonly DraftChange[],
  replace: Parameters<typeof spiedPublishClient>[1] = {},
): Promise<MountedDesk> {
  const input = inputWithDraft(changes);
  mounted = await mountDesk({
    input,
    client: spiedPublishClient(input, replace),
  });
  return mounted;
}

describe("correcting a pending price in the table", () => {
  it("names the field for a reader by the row's own cabinet and price", async () => {
    const { container } = await mount(TWO_AMOUNT_ROWS);
    const row = rowOfRule(container, BASE_ANCHOR.ruleId);

    const button = priceButtonOf(container, BASE_ANCHOR.ruleId);

    expect(button.getAttribute("aria-label")).toBe(
      roCopy("priceDashboard.publish.newValueAria", {
        name: nameOfRule(BASE_ANCHOR.ruleId),
        field: requireIn(row, '[class*="field"]').textContent,
      }),
    );
  });

  it("sends the typed amount, as a change at the row's own address, and draws what the server stored", async () => {
    const { container, client } = await mount(TWO_AMOUNT_ROWS);
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);

    typeInto(input, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));
    await pressKey(input, "Enter");

    expect(client.change).toHaveBeenCalledTimes(1);
    expect(client.change.mock.calls[0]?.[0]).toEqual({
      expectedDraftRevision: "1",
      change: {
        address: BASE_ANCHOR,
        value: anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI,
      },
    });
    expect(client.revert).not.toHaveBeenCalled();
    expect(figureOf(container, BASE_ANCHOR.ruleId)).toBe(
      formatLei(
        anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI,
        roCopy("priceDashboard.units.currency"),
      ),
    );
    expect(
      rowOfRule(container, BASE_ANCHOR.ruleId).querySelector("input"),
      "the field closes once the draft holds the value",
    ).toBeNull();
  });

  it("takes the change out of the draft when the active amount is typed back, and the row goes", async () => {
    const { container, client } = await mount(TWO_AMOUNT_ROWS);
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);

    typeInto(input, String(anchorOf(BASE_ANCHOR.ruleId) / LEI));
    await pressKey(input, "Enter");

    expect(client.change).not.toHaveBeenCalled();
    expect(client.revert.mock.calls[0]?.[0]).toEqual({
      expectedDraftRevision: "1",
      target: { kind: "change", address: BASE_ANCHOR },
    });
    expect(() => rowOfRule(container, BASE_ANCHOR.ruleId)).toThrow();
    expect(rowOfRule(container, WALL_ANCHOR.ruleId).isConnected).toBe(true);
  });

  it("names the draft's revision of the last write, so the next one is not refused as stale", async () => {
    const { container, client } = await mount(TWO_AMOUNT_ROWS);
    const first = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(first, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));
    await pressKey(first, "Enter");

    const second = openFieldOf(container, WALL_ANCHOR.ruleId);
    typeInto(second, String((anchorOf(WALL_ANCHOR.ruleId) + 70 * LEI) / LEI));
    await pressKey(second, "Enter");

    expect(client.change).toHaveBeenCalledTimes(2);
    expect(client.change.mock.calls[1]?.[0].expectedDraftRevision).toBe(
      "sample-1",
    );
    expect(allIn(container, '[role="alert"]')).toEqual([]);
  });

  it("then takes a row back with its arrow at the revision the correction left", async () => {
    const { container, client } = await mount(TWO_AMOUNT_ROWS);
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(input, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));
    await pressKey(input, "Enter");

    click(
      requireIn(
        rowOfRule(container, WALL_ANCHOR.ruleId),
        '[data-testid="diff-revert"]',
      ),
    );
    await settle();

    expect(client.revert.mock.calls[0]?.[0].expectedDraftRevision).toBe(
      "sample-1",
    );
  });
});

describe("focus after a correction that takes a row out", () => {
  const revertOf = (container: HTMLElement, ruleId: string): HTMLElement =>
    requireIn(rowOfRule(container, ruleId), '[data-testid="diff-revert"]');

  it("goes to the arrow of the row now standing where the corrected one stood", async () => {
    const { container } = await mount(TWO_AMOUNT_ROWS);
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(input, String(anchorOf(BASE_ANCHOR.ruleId) / LEI));

    await pressKey(input, "Enter");

    expect(document.activeElement).toBe(
      revertOf(container, WALL_ANCHOR.ruleId),
    );
  });

  it("goes to the row before it when the corrected row was the last", async () => {
    const { container } = await mount(TWO_AMOUNT_ROWS);
    const input = openFieldOf(container, WALL_ANCHOR.ruleId);
    typeInto(input, String(anchorOf(WALL_ANCHOR.ruleId) / LEI));

    await pressKey(input, "Enter");

    expect(document.activeElement).toBe(
      revertOf(container, BASE_ANCHOR.ruleId),
    );
  });

  it("is left alone when the row stays: the price the field came from takes the focus back", async () => {
    const { container } = await mount(TWO_AMOUNT_ROWS);
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(input, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));

    await pressKey(input, "Enter");

    expect(document.activeElement).toBe(
      priceButtonOf(container, BASE_ANCHOR.ruleId),
    );
  });

  it("is left alone when the write is refused: the field keeps it", async () => {
    const { container } = await mount(TWO_AMOUNT_ROWS, {
      revert: () => Promise.resolve({ kind: "failed" }),
    });
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(input, String(anchorOf(BASE_ANCHOR.ruleId) / LEI));

    await pressKey(input, "Enter");

    expect(document.activeElement).toBe(input);
  });
});

describe("a value that is not a price", () => {
  it("is refused in the field before anything is sent, and the field stays open", async () => {
    const { container, client } = await mount(TWO_AMOUNT_ROWS);
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);

    typeInto(input, "4005");
    await pressKey(input, "Enter");

    expect(alertOf(container, BASE_ANCHOR.ruleId)).toBe(
      roCopy("priceDashboard.errors.notMultipleOfTen", {
        step: "10",
        example: "450",
      }),
    );
    expect(client.change).not.toHaveBeenCalled();
    expect(client.revert).not.toHaveBeenCalled();
  });

  it("lets a pending price that is not a whole ten of lei be typed back without a refusal", async () => {
    const legacy = changeTo(BASE_ANCHOR, 5 * LEI + 50);
    const { container, client } = await mount([legacy]);
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);

    await pressKey(input, "Enter");

    expect(alertOf(container, BASE_ANCHOR.ruleId)).toBeUndefined();
    expect(client.change).not.toHaveBeenCalled();
    expect(
      rowOfRule(container, BASE_ANCHOR.ruleId).querySelector("input"),
    ).toBe(null);
  });
});

describe("a write the server does not take", () => {
  const ANSWERS: readonly (readonly [string, DraftWriteOutcome, string])[] = [
    [
      "refused as negative",
      { kind: "refused", code: "NEGATIVE" },
      roCopy("priceDashboard.errors.negative"),
    ],
    [
      "refused as too large",
      { kind: "refused", code: "TOO_LARGE" },
      roCopy("priceDashboard.errors.tooBig"),
    ],
    ["failed", { kind: "failed" }, roCopy("priceDashboard.errors.saveFailed")],
    [
      "refused for a book that no longer makes a book",
      { kind: "candidate-refused" },
      roCopy("priceDashboard.errors.saveFailed"),
    ],
  ];

  it.each(ANSWERS)(
    "tells it %s under the field, keeps the field open with the text, and leaves the row as it was",
    async (_name, answer, words) => {
      const { container } = await mount(TWO_AMOUNT_ROWS, {
        change: () => Promise.resolve(answer),
      });
      const input = openFieldOf(container, BASE_ANCHOR.ruleId);
      typeInto(input, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));

      await pressKey(input, "Enter");

      expect(alertOf(container, BASE_ANCHOR.ruleId)).toBe(words);
      expect(input.isConnected).toBe(true);
      expect(input.value).toBe(
        String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI),
      );
    },
  );

  it("a write that throws is a failed one, told as the list tells it", async () => {
    const { container } = await mount(TWO_AMOUNT_ROWS, {
      change: () => Promise.reject(new Error("network")),
    });
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(input, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));

    await pressKey(input, "Enter");

    expect(alertOf(container, BASE_ANCHOR.ruleId)).toBe(
      roCopy("priceDashboard.errors.saveFailed"),
    );
  });

  it("reads the state again when the draft moved, and says so in the field", async () => {
    const { container, client } = await mount(TWO_AMOUNT_ROWS, {
      change: () => Promise.resolve({ kind: "conflict" }),
    });
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(input, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));

    await pressKey(input, "Enter");

    expect(client.readState).toHaveBeenCalledTimes(1);
    expect(alertOf(container, BASE_ANCHOR.ruleId)).toBe(
      roCopy("priceDashboard.errors.changedMeanwhile"),
    );
  });
});

describe("an answer that arrives after the person has moved on", () => {
  it("does not stand under a field closed and opened again meanwhile", async () => {
    const answer = deferred<DraftWriteOutcome>();
    const { container } = await mount(TWO_AMOUNT_ROWS, {
      change: () => answer.promise,
    });
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(input, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));
    await pressKey(input, "Enter");
    await pressKey(input, "Escape");
    openFieldOf(container, BASE_ANCHOR.ruleId);

    answer.resolve({ kind: "refused", code: "NEGATIVE" });
    await settle();

    expect(alertOf(container, BASE_ANCHOR.ruleId)).toBeUndefined();
  });

  it("does not stand under text the person has since typed over it", async () => {
    const answer = deferred<DraftWriteOutcome>();
    const { container } = await mount(TWO_AMOUNT_ROWS, {
      change: () => answer.promise,
    });
    const input = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(input, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));
    await pressKey(input, "Enter");
    typeInto(input, String((anchorOf(BASE_ANCHOR.ruleId) + 80 * LEI) / LEI));

    answer.resolve({ kind: "failed" });
    await settle();

    expect(alertOf(container, BASE_ANCHOR.ruleId)).toBeUndefined();
  });

  it("sends no second write while the first is out, from this field or another", async () => {
    const answer = deferred<DraftWriteOutcome>();
    const { container, client } = await mount(TWO_AMOUNT_ROWS, {
      change: () => answer.promise,
    });
    const first = openFieldOf(container, BASE_ANCHOR.ruleId);
    typeInto(first, String((anchorOf(BASE_ANCHOR.ruleId) + 90 * LEI) / LEI));
    await pressKey(first, "Enter");
    const second = openFieldOf(container, WALL_ANCHOR.ruleId);
    typeInto(second, String((anchorOf(WALL_ANCHOR.ruleId) + 70 * LEI) / LEI));

    await pressKey(second, "Enter");
    await pressKey(first, "Enter");

    expect(client.change).toHaveBeenCalledTimes(1);
    answer.resolve({ kind: "failed" });
    await settle();
  });
});

describe("the rows that get no field", () => {
  it("draws a field for a price of the draft and for nothing else: not a percentage, not the switch, not a bulk member", async () => {
    const { container } = await mountSampleDesk();

    const rows = allIn(container, '[data-testid="diff-row"]');
    const withField = rows.filter(
      (row) => row.querySelector('button[class*="priceButton"]') !== null,
    );
    const members = allIn(
      container,
      '[data-testid="diff-group"] [data-testid="diff-row"]',
    );

    const percentRows = rows.filter((row) =>
      allIn(row, '[class*="cellValue"]')[0]?.textContent.includes(" %"),
    );
    expect(withField.length).toBeGreaterThan(0);
    expect(withField.length).toBeLessThan(rows.length);
    expect(
      percentRows.length,
      "the sample's draft holds percentage rows, or this test says nothing about them",
    ).toBeGreaterThan(0);
    for (const row of percentRows) {
      expect(row.querySelector('button[class*="priceButton"]')).toBeNull();
    }
    for (const member of members) {
      expect(member.querySelector('button[class*="priceButton"]')).toBeNull();
    }
    for (const row of withField) {
      expect(row.querySelector('[data-testid="diff-revert"]')).not.toBeNull();
    }
  });
});

async function mountSampleDesk(): Promise<MountedDesk> {
  mounted = await mountDesk({ input: SAMPLE_PUBLISH_PAGE });
  return mounted;
}
