// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U3, Save on a cabinet's page. The developer's tests fail the first of one or two writes. A
// cabinet with five prices makes five writes, so the question is what a failure at each position leaves: the writes
// before it landed (the coordinator's ruling: a partial save is accepted), the failure is on the field it belongs to
// with `aria-invalid`, `role="alert"` and `aria-describedby` tied together, no "saved" notice shows, nothing after it is
// sent, and the next press sends only what is left. It adds: every failure kind at every position, a 401, typing and
// cancelling and leaving the page while writes are out, a held off-ten price, a revert beside a change, and a bulk
// action landing from another window while the page is open.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isSameAddress,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { deriveCabinetDetail } from "@/price-dashboard/cabinet-detail-model";
import type {
  DraftChangeOutcome,
  PriceDraftClient,
} from "@/price-dashboard/price-draft-client";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";

import { allIn, requireIn } from "../support/render-with-intl";
import {
  alertsIn,
  atIndex,
  buttonNamed,
  fieldNamed,
  mountDetail,
  press,
  saveWords,
  settle,
  typeInField,
  type MountedDetail,
} from "./cabinet-detail-harness";
import { pageOf, stateOf } from "./dashboard-state-fixture";
import {
  inMemoryPriceDraftClient,
  type InMemoryPriceDraftClient,
} from "./in-memory-price-draft-client";
import { bookWith, ruleIn } from "./qa-m10-u3-support";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const FIVE_FIELD_RULE = "cabinet.wall-cabinet";
const TEN_LEI_BANI = 1000;
const WRITE_COUNT = 5;

/** The next whole ten lei above an amount: the sample's height step is 35 lei, which is held and cannot be typed anew. */
function raised(minor: number): number {
  return (Math.floor(minor / TEN_LEI_BANI) + 1) * TEN_LEI_BANI;
}

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

type Failure = DraftChangeOutcome | "throws";

interface FailingClient extends PriceDraftClient {
  readonly sent: () => number;
  /** The address of the write that was turned away, once one has been. */
  readonly failedAddress: () => unknown;
}

/** A client over the in-memory server whose `position`-th write (a change or a revert) fails as `failure` says. */
function failingAt(
  server: InMemoryPriceDraftClient,
  position: number,
  failure: Failure,
): FailingClient {
  let sent = 0;
  let failedAddress: unknown;
  const around =
    <Request, Outcome>(write: (request: Request) => Promise<Outcome>) =>
    (request: Request): Promise<Outcome> => {
      sent += 1;
      if (sent !== position) return write(request);
      const named = request as {
        change?: { address: unknown };
        target?: { address: unknown };
      };
      failedAddress = (named.change ?? named.target)?.address;
      return failure === "throws"
        ? Promise.reject(new Error("the network is down"))
        : Promise.resolve(failure as Outcome);
    };
  return {
    readState: () => server.client.readState(),
    change: around((request) => server.client.change(request)),
    revert: around((request) => server.client.revert(request)),
    bulk: (request) => server.client.bulk(request),
    sent: () => sent,
    failedAddress: () => failedAddress,
  };
}

function fiveFieldDraftlessPage() {
  const page = pageOf();
  const detail = deriveCabinetDetail(page, FIVE_FIELD_RULE);
  if (detail.kind !== "ready") throw new Error("the rule is not ready");
  return { page, fields: detail.fields };
}

/** Every field of the cabinet raised by ten lei: five changes that keep every width above zero, in any order. */
function typeFiveChanges(
  container: HTMLElement,
  fields: ReturnType<typeof fiveFieldDraftlessPage>["fields"],
): void {
  for (const field of fields) {
    typeInField(
      container,
      labelOf(container, field.key),
      String(raised(field.activeMinor) / 100),
    );
  }
}

/** The label of the field with this key: fields are drawn in the order the page derives them. */
function labelOf(container: HTMLElement, key: string): string {
  const { fields } = fiveFieldDraftlessPage();
  const index = fields.findIndex((field) => field.key === key);
  const label = allIn<HTMLLabelElement>(container, "label").filter(
    (candidate) => candidate.htmlFor !== "",
  )[index];
  if (label === undefined) throw new Error(`no label for ${key}`);
  return label.textContent.trim();
}

function textInputs(container: HTMLElement): HTMLInputElement[] {
  return allIn<HTMLInputElement>(container, 'input[type="text"]');
}

function invalidInputs(container: HTMLElement): HTMLInputElement[] {
  return textInputs(container).filter(
    (input) => input.getAttribute("aria-invalid") === "true",
  );
}

const FAILURES: readonly [string, Failure, string][] = [
  [
    "a refusal of the server",
    { kind: "refused", code: "TOO_LARGE" },
    roCopy("priceDashboard.errors.tooBig"),
  ],
  [
    "a conflict",
    { kind: "conflict" },
    roCopy("priceDashboard.errors.changedMeanwhile"),
  ],
  [
    "a draft that no longer makes a book",
    { kind: "candidate-refused" },
    roCopy("priceDashboard.errors.saveFailed"),
  ],
  ["a failure", { kind: "failed" }, roCopy("priceDashboard.errors.saveFailed")],
  [
    "an ended session",
    { kind: "session-ended" },
    roCopy("priceDashboard.errors.saveFailed"),
  ],
  [
    "a connection that throws",
    "throws",
    roCopy("priceDashboard.errors.saveFailed"),
  ],
];

/** Where the draft already holds a write of the same Save, "nothing changed" would be untrue, so that sentence is another. */
function wordsAtPosition(words: string, position: number): string {
  const isFirst = position === 1;
  return words === roCopy("priceDashboard.errors.saveFailed") && !isFirst
    ? roCopy("priceDashboard.errors.savePartlyFailed")
    : words;
}

describe("a save of five prices that fails at each position, in each way", () => {
  it("has five fields, all of which can change by ten lei, so the sweep is five writes deep", () => {
    const { fields } = fiveFieldDraftlessPage();

    expect(fields).toHaveLength(WRITE_COUNT);
  });

  describe.each(FAILURES)("%s", (_name, failure, words) => {
    it.each([1, 2, 3, 4, 5])(
      "at write %i: those before it landed, the failure is on its own field and nowhere else, nothing after it is sent, no notice shows, and the next press sends only what is left",
      async (position) => {
        const { page, fields } = fiveFieldDraftlessPage();
        const server = inMemoryPriceDraftClient(page.state);
        const client = failingAt(server, position, failure);
        mounted = await mountDetail(FIVE_FIELD_RULE, { page, client });
        const { container } = mounted;
        typeFiveChanges(container, fields);

        await press(buttonNamed(container, saveWords()));

        const writtenBefore = server.state().draft.changes;
        const failedAddress = client.failedAddress();
        expect(
          writtenBefore,
          "the writes before the failed one landed",
        ).toHaveLength(position - 1);
        expect(client.sent(), "nothing after the failed write was sent").toBe(
          position,
        );
        expect(container.querySelector('[role="status"]')).toBeNull();
        expect(alertsIn(container)).toEqual([wordsAtPosition(words, position)]);
        const [invalid, ...others] = invalidInputs(container);
        expect(others).toEqual([]);
        expect(invalid).toBeDefined();
        const alert = requireIn(container, '[role="alert"]');
        expect(invalid?.getAttribute("aria-describedby")?.split(" ")).toContain(
          alert.id,
        );
        const failedField = fields.find((field) =>
          isSameAddress(field.address, failedAddress as never),
        );
        expect(
          failedField,
          "the failed write names a field of the page",
        ).toBeDefined();
        expect(invalid?.value).toBe(
          String(raised(failedField?.activeMinor ?? 0) / 100),
        );
        expect(
          textInputs(container).findIndex((input) => input === invalid),
        ).toBe(fields.findIndex((field) => field === failedField));
        expect(buttonNamed(container, saveWords()).disabled).toBe(false);
        expect(consoleErrors).not.toHaveBeenCalled();

        await press(buttonNamed(container, saveWords()));

        expect(server.state().draft.changes).toHaveLength(WRITE_COUNT);
        expect(alertsIn(container)).toEqual([]);
        expect(requireIn(container, '[role="status"]').textContent).toContain(
          roCopy("priceDashboard.common.priceSavedNotice"),
        );
      },
    );
  });

  it("an ended session raises the sheet that promises the typed text stays, and the text stays", async () => {
    const { page, fields } = fiveFieldDraftlessPage();
    const server = inMemoryPriceDraftClient(page.state);
    mounted = await mountDetail(FIVE_FIELD_RULE, {
      page,
      client: failingAt(server, 2, { kind: "session-ended" }),
    });
    typeFiveChanges(mounted.container, fields);

    await press(buttonNamed(mounted.container, saveWords()));

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
    for (const [index, field] of fields.entries()) {
      expect(atIndex(textInputs(mounted.container), index).value).toBe(
        String(raised(field.activeMinor) / 100),
      );
    }
  });
});

describe("while writes are out", () => {
  it("typing into another field after the first of three writes stops the rest, keeps what is typed, and the next press sends exactly what still differs", async () => {
    const { page, fields } = fiveFieldDraftlessPage();
    const server = inMemoryPriceDraftClient(page.state);
    mounted = await mountDetail(FIVE_FIELD_RULE, {
      page,
      client: server.client,
    });
    const { container } = mounted;
    for (const field of fields.slice(0, 3)) {
      typeInField(
        container,
        labelOf(container, field.key),
        String(raised(field.activeMinor) / 100),
      );
    }
    const release = server.holdNextWrite();
    await press(buttonNamed(container, saveWords()));
    const fourth = atIndex(fields, 3);
    typeInField(
      container,
      labelOf(container, fourth.key),
      String(raised(fourth.activeMinor) / 100),
    );

    release();
    await settle();

    const sentAfterTyping = server.calls.filter(
      (call) => call.kind === "change",
    );
    expect(sentAfterTyping).toHaveLength(1);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(alertsIn(container)).toEqual([]);
    await press(buttonNamed(container, saveWords()));
    expect(server.state().draft.changes).toHaveLength(4);
    expect(
      server.calls.filter((call) => call.kind === "change"),
      "the first field is not sent twice",
    ).toHaveLength(4);
  });

  it("cancelling while writes are out stops the rest and clears the typing, and the writes already landed stay in the draft", async () => {
    const { page, fields } = fiveFieldDraftlessPage();
    const server = inMemoryPriceDraftClient(page.state);
    mounted = await mountDetail(FIVE_FIELD_RULE, {
      page,
      client: server.client,
    });
    const { container } = mounted;
    typeFiveChanges(container, fields);
    const release = server.holdNextWrite();
    await press(buttonNamed(container, saveWords()));
    await press(buttonNamed(container, roCopy("priceDashboard.common.cancel")));

    release();
    await settle();

    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      1,
    );
    expect(server.state().draft.changes).toHaveLength(1);
    expect(container.querySelector('[role="status"]')).toBeNull();
    for (const [index, field] of fields.entries()) {
      const text = atIndex(textInputs(container), index).value;
      const wasWritten = server
        .state()
        .draft.changes.some((change) =>
          isSameAddress(change.address, field.address),
        );
      expect(text).toBe(
        String(
          (wasWritten ? raised(field.activeMinor) : field.activeMinor) / 100,
        ),
      );
    }
  });

  it("two presses in the same moment send five writes, not ten and not one", async () => {
    const { page, fields } = fiveFieldDraftlessPage();
    const server = inMemoryPriceDraftClient(page.state);
    mounted = await mountDetail(FIVE_FIELD_RULE, {
      page,
      client: server.client,
    });
    typeFiveChanges(mounted.container, fields);
    const save = buttonNamed(mounted.container, saveWords());

    act(() => {
      save.click();
      save.click();
    });
    await settle();

    expect(server.calls.filter((call) => call.kind === "change")).toHaveLength(
      WRITE_COUNT,
    );
    expect(server.state().draft.changes).toHaveLength(WRITE_COUNT);
    expect(alertsIn(mounted.container)).toEqual([]);
  });

  it("leaving the page after the first write does not break the rest: they still go out, and nothing is logged as an error", async () => {
    const { page, fields } = fiveFieldDraftlessPage();
    const server = inMemoryPriceDraftClient(page.state);
    mounted = await mountDetail(FIVE_FIELD_RULE, {
      page,
      client: server.client,
    });
    typeFiveChanges(mounted.container, fields);
    const release = server.holdNextWrite();
    await press(buttonNamed(mounted.container, saveWords()));

    mounted.unmount();
    mounted = undefined;
    release();
    await settle();

    expect(server.state().draft.changes).toHaveLength(WRITE_COUNT);
    expect(consoleErrors).not.toHaveBeenCalled();
  });
});

describe("a revert beside a change", () => {
  it("takes the drafted amount out for the field typed back to the active one, writes the other, and shows the notice for the write that put an amount in", async () => {
    const anchor = {
      kind: "cabinet",
      ruleId: "cabinet.base-cabinet",
      field: "anchorMinor",
    } as const;
    const { fields } = (() => {
      const detail = deriveCabinetDetail(pageOf(), "cabinet.base-cabinet");
      if (detail.kind !== "ready") throw new Error("not ready");
      return detail;
    })();
    const anchorField = fields.find((field) => field.key === "anchorMinor");
    const plusField = fields.find((field) => field.key === "perStepWiderMinor");
    const page = pageOf([{ address: anchor, value: 410_000 }]);
    mounted = await mountDetail("cabinet.base-cabinet", { page });
    const { container, server } = mounted;
    typeInField(
      container,
      roCopy("priceDashboard.cabinet.fieldAnchor", { widthMm: 600 }),
      String((anchorField?.activeMinor ?? 0) / 100),
    );
    typeInField(
      container,
      roCopy("priceDashboard.cabinet.fieldPlus", { stepMm: 50 }),
      String(((plusField?.activeMinor ?? 0) + TEN_LEI_BANI) / 100),
    );

    await press(buttonNamed(container, saveWords()));

    expect(server.calls.map((call) => call.kind).sort()).toEqual([
      "change",
      "revert",
    ]);
    expect(server.state().draft.changes).toEqual([
      {
        address: {
          kind: "cabinet",
          ruleId: "cabinet.base-cabinet",
          field: "perStepWiderMinor",
        },
        value: (plusField?.activeMinor ?? 0) + TEN_LEI_BANI,
      },
    ]);
    expect(requireIn(container, '[role="status"]').textContent).toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
  });
});

describe("a price the book already holds off the ten-lei step (a stored amount may be any; a new one may not)", () => {
  const OFF_TEN_ANCHOR_BANI = 395_500;

  function pageHoldingAnOffTenAnchor() {
    const base = stateOf();
    const book = withAnchor(SAMPLE_PRICE_BOOK, OFF_TEN_ANCHOR_BANI);
    return {
      state: { ...base, active: { ...base.active, book } },
      cabinetNames: pageOf().cabinetNames,
    };
  }

  function withAnchor(book: PriceBook, anchorMinor: number): PriceBook {
    return {
      ...book,
      cabinetRules: book.cabinetRules.map((rule) =>
        rule.ruleId === "cabinet.base-cabinet"
          ? ({
              ...rule,
              formula: { ...rule.formula, anchorMinor },
            } as typeof rule)
          : rule,
      ),
    };
  }

  it("draws without a crash, starts the field at the held amount with Save off, and refuses a new off-ten amount until the held one is typed back", async () => {
    mounted = await mountDetail("cabinet.base-cabinet", {
      page: pageHoldingAnOffTenAnchor(),
    });
    const { container } = mounted;
    const label = roCopy("priceDashboard.cabinet.fieldAnchor", {
      widthMm: 600,
    });

    expect(fieldNamed(container, label).value).toBe("3955");
    expect(buttonNamed(container, saveWords()).disabled).toBe(true);
    expect(alertsIn(container)).toEqual([]);

    typeInField(container, label, "3957");
    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.notMultipleOfTen", {
        step: "10",
        example: "450",
      }),
    ]);
    expect(buttonNamed(container, saveWords()).disabled).toBe(true);

    typeInField(container, label, "3955");
    expect(alertsIn(container)).toEqual([]);
    expect(buttonNamed(container, saveWords()).disabled).toBe(true);
    expect(consoleErrors).not.toHaveBeenCalled();
  });

  it("saves another price of the cabinet without writing the held one", async () => {
    mounted = await mountDetail("cabinet.base-cabinet", {
      page: pageHoldingAnOffTenAnchor(),
    });
    const { container, server } = mounted;
    typeInField(
      container,
      roCopy("priceDashboard.cabinet.fieldPlus", { stepMm: 50 }),
      "300",
    );

    await press(buttonNamed(container, saveWords()));

    expect(
      server.calls.map((call) =>
        call.kind === "change" ? call.request.change.address : call.kind,
      ),
    ).toEqual([
      {
        kind: "cabinet",
        ruleId: "cabinet.base-cabinet",
        field: "perStepWiderMinor",
      },
    ]);
  });

  it("holds the table to multiples of ten lei in every cell, active and new", async () => {
    mounted = await mountDetail("cabinet.base-cabinet", {
      page: pageHoldingAnOffTenAnchor(),
    });
    const cells = allIn(mounted.container, "tbody td[data-role]").map((cell) =>
      cell.textContent.trim(),
    );

    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell, "a table cell is a whole number of lei ending in 0").toMatch(
        /0[\s\u00a0]lei$/,
      );
    }
  });
});

describe("a bulk action landing from another window while the page is open", () => {
  it("is read again on the next Save, which says so on the field and keeps what is typed; the press after it writes against the new draft", async () => {
    const page = pageOf();
    mounted = await mountDetail("cabinet.base-cabinet", { page });
    const { container, server } = mounted;
    typeInField(
      container,
      roCopy("priceDashboard.cabinet.fieldAnchor", { widthMm: 600 }),
      "4100",
    );
    const behind = await server.client.bulk({
      expectedDraftRevision: server.state().draft.draftRevision,
      target: { scope: "all" },
      percent: 5,
    });
    expect(behind.kind).toBe("changed");

    await press(buttonNamed(container, saveWords()));

    expect(alertsIn(container)).toEqual([
      roCopy("priceDashboard.errors.changedMeanwhile"),
    ]);
    expect(
      fieldNamed(
        container,
        roCopy("priceDashboard.cabinet.fieldAnchor", { widthMm: 600 }),
      ).value,
    ).toBe("4100");
    const plusAfterBulk = fieldNamed(
      container,
      roCopy("priceDashboard.cabinet.fieldPlus", { stepMm: 50 }),
    ).value;
    const bulkedPlus = server
      .state()
      .draft.changes.find(
        (change) =>
          "field" in change.address &&
          change.address.field === "perStepWiderMinor" &&
          change.address.ruleId === "cabinet.base-cabinet",
      );
    expect(String(Number(bulkedPlus?.value ?? 0) / 100)).toBe(plusAfterBulk);

    await press(buttonNamed(container, saveWords()));

    const final = server.state().draft.changes;
    const anchorChange = final.find(
      (change) =>
        "field" in change.address &&
        change.address.field === "anchorMinor" &&
        change.address.ruleId === "cabinet.base-cabinet",
    );
    expect(anchorChange?.value).toBe(410_000);
    expect(
      "bulk" in (anchorChange ?? {}),
      "the typed amount replaced the bulk's at that address",
    ).toBe(false);
    expect(alertsIn(container)).toEqual([]);
    const afterBook = bookWith(final as DraftChange[]);
    expect(ruleIn(afterBook, "cabinet.base-cabinet")).toBeDefined();
  });
});

describe("where focus is after a save (the project's precedent: `use-focus-after-revert.ts`, a removed button must not leave focus on the body)", () => {
  it("is still inside the page when Save, which had it, is replaced by the saved notice", async () => {
    mounted = await mountDetail("cabinet.base-cabinet");
    const { container } = mounted;
    typeInField(
      container,
      roCopy("priceDashboard.cabinet.fieldAnchor", { widthMm: 600 }),
      "4100",
    );
    const save = buttonNamed(container, saveWords());
    act(() => {
      save.focus();
    });
    expect(document.activeElement).toBe(save);

    await press(save);

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(
      document.activeElement === document.body,
      "focus fell to the body when the Save button left the page",
    ).toBe(false);
    expect(container.contains(document.activeElement)).toBe(true);
  });
});
