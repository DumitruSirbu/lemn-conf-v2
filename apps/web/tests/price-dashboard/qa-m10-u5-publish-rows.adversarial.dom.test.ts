// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U5, the pending list (frames D7A, D7D, D7M): what is drawn for a draft, against an oracle the
// screen does not share, over drafts the existing file never mounts. `publish-screen.dom.test.ts` mounts the sample's one
// draft and a handful of hand-made ones; this file mounts every single unit and every pair of units of a draft (cabinet
// price, three kinds of bulk action, depth rule, material, hardware, accessory, provisional switch), takes every arrow in
// turn until the list is empty, and sweeps the bulk percentage through the whole range the plan names, in both languages.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  DIFF_SECTIONS,
  applyChanges,
  diffBooks,
  isSameAddress,
  readEditableFields,
  type AppliedAddress,
  type DraftBulk,
  type DraftChange,
  type PriceBook,
  type PriceGroupCode,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatLei } from "@/price-dashboard/format-lei";
import type { PublishClient } from "@/price-dashboard/publish-client";
import { makeSamplePublishClient } from "@/price-dashboard/publish-client";
import {
  readPendingDraft,
  type PublishPageInput,
} from "@/price-dashboard/publish-model";
import { PublishScreen } from "@/price-dashboard/publish-page";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const MINUS_SIGN = "−";
const ACTIVE: PriceBook = SAMPLE_PUBLISH_PAGE.state.active.book;
const MENU: Parameters<typeof contextOf>[1] = [
  "kitchens",
  "audit",
  "cabinets",
  "publish",
];
const TRANSLATOR = {
  ro: createTranslator({ locale: "ro", messages: roMessages }),
  ru: createTranslator({ locale: "ru", messages: ruMessages }),
} as const;
const CURRENCY_WORD = roMessages.priceDashboard.units.currency;
const PENDING_CHIP = '[data-testid="staff-pending-prices"]';
const ALL_PUBLISHED = '[data-testid="staff-all-published"]';
const AMOUNT_FIELDS = [
  "anchorMinor",
  "perStepWiderMinor",
  "perStepNarrowerMinor",
] as const;

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  leaveTheStaffServer();
});

// ---- the draft's building blocks --------------------------------------------------------------------------------------

function readingAt(book: PriceBook, address: AppliedAddress) {
  const reading = readEditableFields(book).find((row) =>
    isSameAddress(row.address, address),
  );
  if (reading === undefined)
    throw new Error("the sample book has no such field");
  return reading;
}

function numberAt(book: PriceBook, address: AppliedAddress): number {
  const { value } = readingAt(book, address);
  if (typeof value !== "number") throw new Error("not a number");
  return value;
}

const ROUNDING_UNIT = 1_000;

function scaled(minor: number, percent: number): number {
  return (
    Math.round((minor * (100 + percent)) / 100 / ROUNDING_UNIT) * ROUNDING_UNIT
  );
}

function suppliedRulesWith(prefix: string): string[] {
  return ACTIVE.cabinetRules
    .filter(
      (rule) =>
        rule.buildId.startsWith(prefix) && rule.suppliedBy !== "customer",
    )
    .map((rule) => rule.ruleId);
}

interface BulkAsk {
  readonly prefix: string;
  readonly groupId: string;
  readonly bulk: DraftBulk;
  /** How many of the prefix's cabinets the action covers; all when left out. */
  readonly limit?: number;
  /** The first member keeps its value (a member the rounding left where it was). */
  readonly keepsFirstMember?: boolean;
}

function bulkChangesOf(ask: BulkAsk): DraftChange[] {
  const ruleIds = suppliedRulesWith(ask.prefix).slice(0, ask.limit);
  return ruleIds.flatMap((ruleId, ruleIndex) =>
    AMOUNT_FIELDS.map((field): DraftChange => {
      const address = { kind: "cabinet", ruleId, field } as const;
      const current = numberAt(ACTIVE, address);
      const keeps =
        ask.keepsFirstMember === true &&
        ruleIndex === 0 &&
        field === "anchorMinor";
      return {
        address,
        value: keeps ? current : scaled(current, ask.bulk.percent),
        groupId: ask.groupId,
        bulk: ask.bulk,
      };
    }),
  );
}

function checked(changes: readonly DraftChange[]): readonly DraftChange[] {
  if (!applyChanges(ACTIVE, changes).ok) {
    throw new Error(
      `the draft does not make a book: ${JSON.stringify(changes[0])}`,
    );
  }
  return changes;
}

const tierId = (
  tiers: readonly { tierId: string }[],
  index: number,
): string => {
  const tier = tiers[index];
  if (tier === undefined) throw new Error("no such tier");
  return tier.tierId;
};

const UNITS: Readonly<Record<string, readonly DraftChange[]>> = {
  price: [
    {
      address: {
        kind: "cabinet",
        ruleId: "cabinet.open-shelf",
        field: "anchorMinor",
      },
      value:
        numberAt(ACTIVE, {
          kind: "cabinet",
          ruleId: "cabinet.open-shelf",
          field: "anchorMinor",
        }) + 21_000,
    },
  ],
  tallBulk: bulkChangesOf({
    prefix: "tall-",
    groupId: "bulk-tall",
    bulk: { percent: 5, scope: "group", groupCode: "tall" },
  }),
  wallReduction: bulkChangesOf({
    prefix: "wall-",
    groupId: "bulk-wall",
    bulk: { percent: -10, scope: "group", groupCode: "wall" },
  }),
  baseSelection: bulkChangesOf({
    prefix: "base-",
    groupId: "bulk-base",
    bulk: { percent: 3, scope: "selection" },
    limit: 3,
    keepsFirstMember: true,
  }),
  depthRule: [{ address: { kind: "depth-rule" }, value: 18 }],
  material: [
    {
      address: {
        kind: "material",
        tierId: tierId(ACTIVE.material.tiers, 1),
        field: "percentOfCabinets",
      },
      value: 31,
    },
  ],
  hardware: [
    {
      address: {
        kind: "hardware",
        tierId: tierId(ACTIVE.hardware.tiers, 2),
        field: "perHingeMinor",
      },
      value: 4_500,
    },
  ],
  accessory: [
    {
      address: {
        kind: "accessory",
        accessoryId: "dishDryingRack",
        field: "perUnitMinor",
      },
      value: 65_000,
    },
  ],
  provisional: [{ address: { kind: "provisional" }, value: false }],
};
const UNIT_NAMES = Object.keys(UNITS);

function draftOf(names: readonly string[]): readonly DraftChange[] {
  return checked(names.flatMap((name) => UNITS[name] ?? []));
}

function inputWith(changes: readonly DraftChange[]): PublishPageInput {
  return {
    ...SAMPLE_PUBLISH_PAGE,
    state: {
      ...SAMPLE_PUBLISH_PAGE.state,
      draft: { draftRevision: "1", changes },
    },
  };
}

// ---- mounting ---------------------------------------------------------------------------------------------------------

type Spied = {
  [Method in keyof PublishClient]: ReturnType<
    typeof vi.fn<PublishClient[Method]>
  >;
};

function spiedClient(
  input: PublishPageInput,
  replace: Partial<PublishClient> = {},
): Spied {
  const base = makeSamplePublishClient({
    state: input.state,
    archived: new Map(),
  });
  return {
    readState: vi.fn<PublishClient["readState"]>(
      replace.readState ?? (() => base.readState()),
    ),
    publish: vi.fn<PublishClient["publish"]>(
      replace.publish ?? ((request) => base.publish(request)),
    ),
    change: vi.fn<PublishClient["change"]>(
      replace.change ?? ((request) => base.change(request)),
    ),
    revert: vi.fn<PublishClient["revert"]>(
      replace.revert ?? ((request) => base.revert(request)),
    ),
    restore: vi.fn<PublishClient["restore"]>(
      replace.restore ?? ((version, request) => base.restore(version, request)),
    ),
  };
}

async function mountPublish(options: {
  input: PublishPageInput;
  locale?: TestLocale;
  client?: PublishClient;
}): Promise<HTMLElement> {
  const { input, locale = "ro", client = spiedClient(input) } = options;
  screen = mountInCatalogue(
    createElement(PublishScreen, {
      locale,
      context: contextOf("administrator", MENU),
      input,
      initialView: "pending",
      client,
    }),
    locale,
  );
  await flushPromises(5);
  return screen.container;
}

async function settle(): Promise<void> {
  await act(async () => {
    await flushPromises(5);
  });
}

const publishButton = (container: HTMLElement): HTMLButtonElement =>
  requireIn<HTMLButtonElement>(container, '[class*="primary"]');

/** Every row in document order, a group's header excluded and its members included. */
const fieldRowsIn = (container: ParentNode): HTMLElement[] =>
  allIn(container, '[data-testid="diff-row"]');

const groupsIn = (container: ParentNode): HTMLElement[] =>
  allIn(container, '[data-testid="diff-group"]');

const revertsIn = (container: ParentNode): HTMLElement[] =>
  allIn(container, '[data-testid="diff-revert"]');

// ---- the oracle -------------------------------------------------------------------------------------------------------

interface ExpectedRow {
  readonly address: AppliedAddress;
  readonly unit: "amount" | "percent" | "flag";
  readonly before: number | boolean | undefined;
  readonly after: number | boolean;
}

/** What the draft asks for, read from the changes alone: the last change per address, in the order first asked. */
function askedRows(changes: readonly DraftChange[]): ExpectedRow[] {
  const byAddress = new Map<string, DraftChange>();
  for (const change of changes) {
    byAddress.set(JSON.stringify(change.address), change);
  }
  return [...byAddress.values()].map((change) => {
    const reading = readingAt(ACTIVE, change.address as AppliedAddress);
    return {
      address: change.address as AppliedAddress,
      unit: reading.unit,
      before: reading.value as number | boolean,
      after: change.value as number | boolean,
    };
  });
}

function expectedTotals(changes: readonly DraftChange[]) {
  const groupIds = new Set(
    changes.flatMap((change) =>
      change.groupId === undefined ? [] : [change.groupId],
    ),
  );
  const loose = changes.filter((change) => change.groupId === undefined);
  return {
    topLevel: loose.length + groupIds.size,
    groupCount: groupIds.size,
    members: changes.length - loose.length,
  };
}

function candidateOf(changes: readonly DraftChange[]): PriceBook {
  const applied = applyChanges(ACTIVE, changes);
  if (!applied.ok) throw new Error("not a book");
  return applied.book;
}

function expectDrawn(
  container: HTMLElement,
  changes: readonly DraftChange[],
  label: string,
): void {
  const rows = diffBooks(ACTIVE, candidateOf(changes), { changes });
  const totals = expectedTotals(changes);
  const sectionsShown = allIn(container, '[data-testid^="diff-section-"]');
  const expectedSections = DIFF_SECTIONS.filter((section) =>
    rows.some((row) => row.section === section),
  );

  expect(
    sectionsShown.map((s) => s.dataset.testid?.replace("diff-section-", "")),
    label,
  ).toEqual(expectedSections);
  for (const section of sectionsShown) {
    const name = section.dataset.testid?.replace("diff-section-", "");
    const expectedTop = rows.filter((row) => row.section === name).length;
    expect(
      allIn(section, ":scope > ul > li"),
      `${label}: ${name ?? ""}`,
    ).toHaveLength(expectedTop);
  }
  expect(groupsIn(container), label).toHaveLength(totals.groupCount);
  expect(fieldRowsIn(container), label).toHaveLength(
    changes.length - totals.groupCount * 0 - 0,
  );
  expect(revertsIn(container), label).toHaveLength(totals.topLevel);
  expect(requireIn(container, PENDING_CHIP).textContent, label).toContain(
    String(changes.length),
  );
}

function expectCellsOf(
  container: HTMLElement,
  changes: readonly DraftChange[],
): void {
  const rows = diffBooks(ACTIVE, candidateOf(changes), { changes });
  const flat = rows.flatMap((row) =>
    row.kind === "group" ? row.items : [row],
  );
  const asked = new Map(
    askedRows(changes).map((row) => [JSON.stringify(row.address), row]),
  );
  const drawn = fieldRowsIn(container);

  expect(drawn).toHaveLength(flat.length);
  flat.forEach((row, index) => {
    const expected = asked.get(JSON.stringify(row.address));
    const [before, after, difference] = allIn(
      drawn[index] ?? container,
      '[class*="cellValue"]',
    ).map((cell) => cell.textContent);
    if (expected === undefined) throw new Error("a row nobody asked for");
    if (expected.unit === "amount") {
      expect(before).toBe(formatLei(expected.before as number, CURRENCY_WORD));
      expect(after).toBe(formatLei(expected.after as number, CURRENCY_WORD));
      const delta = (expected.after as number) - (expected.before as number);
      expect(
        difference?.startsWith(delta > 0 ? "+" : delta < 0 ? MINUS_SIGN : ""),
      ).toBe(true);
      expect(difference === "").toBe(delta === 0);
    }
    if (expected.unit === "percent") {
      expect(before).toBe(`+${String(expected.before)} %`);
      expect(after).toBe(`+${String(expected.after)} %`);
    }
    expect(drawn[index]?.dataset.unchanged).toBe(
      String(expected.before === expected.after),
    );
  });
}

// ---- what is drawn ----------------------------------------------------------------------------------------------------

describe("the rows drawn for a draft, against the draft's own changes", () => {
  it.each(UNIT_NAMES)(
    "draws %s alone as the rows its changes ask for, with each arrow on a top-level row only",
    async (name) => {
      const changes = draftOf([name]);
      const container = await mountPublish({ input: inputWith(changes) });

      expectDrawn(container, changes, name);
      expectCellsOf(container, changes);
    },
  );

  const PAIRS = UNIT_NAMES.flatMap((first, index) =>
    UNIT_NAMES.slice(index + 1).map((second) => [first, second] as const),
  );

  it.each(PAIRS)("draws %s together with %s", async (first, second) => {
    const changes = draftOf([first, second]);
    const container = await mountPublish({ input: inputWith(changes) });

    expectDrawn(container, changes, `${first}+${second}`);
    expectCellsOf(container, changes);
  });

  it("draws all the units at once, and keeps a bulk action's members together under its one row", async () => {
    const changes = draftOf(UNIT_NAMES);
    const container = await mountPublish({ input: inputWith(changes) });

    expectDrawn(container, changes, "all");
    expectCellsOf(container, changes);
    for (const group of groupsIn(container)) {
      const members = allIn(group, "ul > li");
      const ofThisGroup = changes.filter(
        (change) => change.groupId === group.dataset.groupId,
      );
      expect(members, group.dataset.groupId).toHaveLength(ofThisGroup.length);
    }
  });

  propertyTest.prop([fc.subarray(UNIT_NAMES, { minLength: 1 })], {
    numRuns: 300,
  })(
    "reads the same sections and the same row counts from the model for any mix of units",
    (names) => {
      const changes = draftOf(names);

      const reading = readPendingDraft({
        active: ACTIVE,
        changes,
        cabinetNames: SAMPLE_PUBLISH_PAGE.cabinetNames,
      });

      if (reading.kind !== "ready")
        throw new Error(`the draft reads ${reading.kind}`);
      const rows = diffBooks(ACTIVE, candidateOf(changes), { changes });
      expect(reading.view.sections.map((s) => s.section)).toEqual(
        DIFF_SECTIONS.filter((section) =>
          rows.some((row) => row.section === section),
        ),
      );
      expect(reading.view.sections.flatMap((s) => s.rows)).toHaveLength(
        expectedTotals(changes).topLevel,
      );
      expect(reading.view.changeCount).toBe(changes.length);
      expect(reading.view.canPublish).toBe(
        diffBooks(ACTIVE, candidateOf(changes)).length > 0,
      );
    },
  );
});

// ---- the bulk row -----------------------------------------------------------------------------------------------------

const SIGNED = (percent: number): string =>
  `${percent < 0 ? MINUS_SIGN : "+"}${String(Math.abs(percent))}`;
const GROUP_KEY = {
  base: "priceDashboard.cabinets.groupBase",
  wall: "priceDashboard.cabinets.groupWall",
  tall: "priceDashboard.cabinets.groupTall",
  corner: "priceDashboard.cabinets.groupCorner",
} as const;
const GROUP_PREFIX: Record<Exclude<PriceGroupCode, "corner">, string> = {
  base: "base-",
  wall: "wall-",
  tall: "tall-",
};

describe.each(["ro", "ru"] as const)("a bulk action's row in %s", (locale) => {
  const say = TRANSLATOR[locale];

  describe.each([-50, -10, -1, 1, 5, 100])("with %i %%", (percent) => {
    it.each(Object.keys(GROUP_PREFIX) as (keyof typeof GROUP_PREFIX)[])(
      "over the group %s is '{signed} % la {group}' with the true minus, and counts every member",
      async (code) => {
        const changes = checked(
          bulkChangesOf({
            prefix: GROUP_PREFIX[code],
            groupId: "bulk-x",
            bulk: { percent, scope: "group", groupCode: code },
          }),
        );
        const container = await mountPublish({
          input: inputWith(changes),
          locale,
        });

        const [group] = groupsIn(container);
        const name = requireIn(
          group ?? container,
          '[data-testid="diff-group-name"]',
        ).textContent;
        expect(name).toBe(
          say("priceDashboard.publish.bulkRowName", {
            signedPercent: SIGNED(percent),
            group: say(GROUP_KEY[code]),
          }),
        );
        expect(name).not.toMatch(/-\d/);
        expect(name.includes(MINUS_SIGN)).toBe(percent < 0);
        const rules = new Set(
          changes.map(
            (change) => (change.address as { ruleId: string }).ruleId,
          ),
        );
        expect(group?.textContent).toContain(
          say("priceDashboard.publish.bulkRowSummary", {
            cabinetCount: rules.size,
            priceCount: changes.length,
          }),
        );
      },
    );

    it("over a selection or the whole catalogue names the cabinets it touched, and counts the member that kept its value", async () => {
      const changes = checked(
        bulkChangesOf({
          prefix: "base-",
          groupId: "bulk-sel",
          bulk: { percent, scope: "selection" },
          limit: 4,
          keepsFirstMember: true,
        }),
      );
      const container = await mountPublish({
        input: inputWith(changes),
        locale,
      });

      const [group] = groupsIn(container);
      expect(
        requireIn(group ?? container, '[data-testid="diff-group-name"]')
          .textContent,
      ).toBe(
        say("priceDashboard.publish.bulkRowName", {
          signedPercent: SIGNED(percent),
          group: say("priceDashboard.cabinets.groupCount", { count: 4 }),
        }),
      );
      const members = fieldRowsIn(group ?? container);
      expect(members).toHaveLength(12);
      const unchanged = members.filter(
        (member) => member.dataset.unchanged === "true",
      );
      const expectedUnchanged = changes.filter(
        (change) =>
          change.value === numberAt(ACTIVE, change.address as AppliedAddress),
      );
      expect(unchanged).toHaveLength(expectedUnchanged.length);
      expect(expectedUnchanged.length).toBeGreaterThanOrEqual(1);
      for (const member of unchanged) {
        expect(
          member.querySelectorAll('[class*="cellValue"]')[2]?.textContent,
        ).toBe("");
      }
    });
  });

  it("writes the signed percentage in the row's own new-value cell and difference cell too", async () => {
    const changes = checked(
      bulkChangesOf({
        prefix: "wall-",
        groupId: "bulk-w",
        bulk: { percent: -10, scope: "group", groupCode: "wall" },
      }),
    );
    const container = await mountPublish({ input: inputWith(changes), locale });

    const [group] = groupsIn(container);
    const header = requireIn(group ?? container, ":scope > div");
    const cells = allIn(header, '[class*="cellValue"]').map(
      (cell) => cell.textContent,
    );
    expect(cells.slice(1)).toEqual([`${MINUS_SIGN}10 %`, `${MINUS_SIGN}10 %`]);
  });
});

// ---- the arrows -------------------------------------------------------------------------------------------------------

describe("taking every pending row back, one arrow at a time", () => {
  it("leaves the list as the remaining changes make it after each arrow, and ends on the empty page", async () => {
    const start = draftOf(UNIT_NAMES);
    const input = inputWith(start);
    const client = spiedClient(input);
    const container = await mountPublish({ input, client });

    let remaining = start;
    for (
      let arrows = 1;
      arrows <= start.length && revertsIn(container).length > 0;
      arrows += 1
    ) {
      const [first] = revertsIn(container);
      const owner = first?.closest('[data-testid="diff-group"]') ?? undefined;
      const groupId = owner?.getAttribute("data-group-id") ?? undefined;
      click(first ?? container);
      await settle();

      const target = client.revert.mock.calls.at(-1)?.[0].target;
      if (target === undefined) throw new Error("the arrow asked for nothing");
      expect(target.kind, "the arrow's target").toBe(
        groupId === undefined ? "change" : "group",
      );
      remaining =
        target.kind === "group"
          ? remaining.filter((change) => change.groupId !== target.groupId)
          : remaining.filter(
              (change) =>
                !isSameAddress(
                  change.address as AppliedAddress,
                  target.address as AppliedAddress,
                ),
            );
      const stored = (await client.readState())?.draft.changes ?? [];
      expect(stored, `after ${String(arrows)} arrows`).toEqual(remaining);
      if (stored.length > 0) {
        expectDrawn(container, stored, `after ${String(arrows)} arrows`);
      }
    }

    expect(revertsIn(container)).toHaveLength(0);
    expect(
      container.querySelector('[data-testid="publish-empty"]'),
    ).not.toBeNull();
    expect(requireIn(container, ALL_PUBLISHED).textContent).toBe(
      roMessages.priceDashboard.nav.allPublished,
    );
    expect(container.querySelector(PENDING_CHIP)).toBeNull();
    expect((await client.readState())?.active).toEqual(input.state.active);
  });

  it("takes a whole bulk action back by its group id and leaves its neighbours' members where they were", async () => {
    const changes = draftOf(["tallBulk", "wallReduction", "price"]);
    const input = inputWith(changes);
    const client = spiedClient(input);
    const container = await mountPublish({ input, client });

    const wall = groupsIn(container).find(
      (group) => group.dataset.groupId === "bulk-wall",
    );
    click(requireIn(wall ?? container, '[data-testid="diff-revert"]'));
    await settle();

    expect(client.revert.mock.calls[0]?.[0].target).toEqual({
      kind: "group",
      groupId: "bulk-wall",
    });
    expect(groupsIn(container).map((group) => group.dataset.groupId)).toEqual([
      "bulk-tall",
    ]);
    const left = (await client.readState())?.draft.changes ?? [];
    expect(left).toEqual(
      changes.filter((change) => change.groupId !== "bulk-wall"),
    );
  });
});

// ---- publish is off while nothing would change ------------------------------------------------------------------------

describe("the publish button", () => {
  it("is off for a bulk action whose every member kept its value, though the group is drawn", async () => {
    const restated = checked(
      bulkChangesOf({
        prefix: "tall-",
        groupId: "bulk-same",
        bulk: { percent: 5, scope: "group", groupCode: "tall" },
      }).map(
        (change): DraftChange =>
          ({
            ...change,
            value: numberAt(ACTIVE, change.address as AppliedAddress),
          }) as DraftChange,
      ),
    );
    const container = await mountPublish({ input: inputWith(restated) });

    expect(groupsIn(container)).toHaveLength(1);
    expect(
      fieldRowsIn(container).every((row) => row.dataset.unchanged === "true"),
    ).toBe(true);
    expect(publishButton(container).getAttribute("aria-disabled")).toBe("true");
  });

  it("turns on when a changed price joins the restated ones and off again when the arrow takes it back", async () => {
    const restated: DraftChange = {
      address: { kind: "depth-rule" },
      value: numberAt(ACTIVE, { kind: "depth-rule" }),
    };
    const moved = UNITS.price?.[0];
    if (moved === undefined) throw new Error("no price unit");
    const input = inputWith(checked([restated, moved]));
    const container = await mountPublish({ input });
    expect(publishButton(container).getAttribute("aria-disabled")).toBeNull();

    const movedRow = fieldRowsIn(container).find(
      (row) => row.dataset.unchanged === "false",
    );
    click(requireIn(movedRow ?? container, '[data-testid="diff-revert"]'));
    await settle();

    expect(fieldRowsIn(container)).toHaveLength(1);
    expect(publishButton(container).getAttribute("aria-disabled")).toBe("true");
  });
});
