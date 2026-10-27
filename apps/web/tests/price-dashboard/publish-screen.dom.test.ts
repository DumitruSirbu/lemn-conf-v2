// @vitest-environment happy-dom
//
// "Publicare prețuri" (frames D7A to D7G, D7M, D8A): the pending prices from every section with a bulk action as one row that
// opens to its members, the version's name, the provisional switch, the two confirmations, what a failed publish leaves, and
// the history as the second tab. The page writes through a client it is handed, so each test hands it one that records.
import { act, createElement } from "react";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DIFF_SECTIONS, type DraftChange } from "@lemnaria/configurator-domain";

import type { PublishClient } from "@/price-dashboard/publish-client";
import { makeSamplePublishClient } from "@/price-dashboard/publish-sample-client";
import type { PublishPageInput } from "@/price-dashboard/publish-model";
import {
  PublishScreen,
  PublishUnavailableScreen,
} from "@/price-dashboard/publish-page";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";
import type { PublishView } from "@/price-dashboard/use-publish-desk";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const ruCopy = createTranslator({ locale: "ru", messages: ruMessages });
const COPY = roMessages.priceDashboard;
const MENU: Parameters<typeof contextOf>[1] = [
  "kitchens",
  "audit",
  "cabinets",
  "publish",
];
/** The cabinets the sample's bulk row covers (one), each with the three amounts of an anchored price. */
const SAMPLE_BULK_CABINETS = 1;
const AMOUNTS_PER_CABINET = 2;
const ACTIVE_SEQUENCE = SAMPLE_PUBLISH_PAGE.state.active.sequenceNumber;
const PENDING_COUNT = SAMPLE_PUBLISH_PAGE.state.draft.changes.length;
const PENDING_CHIP = '[data-testid="staff-pending-prices"]';
const ALL_PUBLISHED = '[data-testid="staff-all-published"]';

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  leaveTheStaffServer();
});

function withDraft(changes: readonly DraftChange[]): PublishPageInput {
  return {
    ...SAMPLE_PUBLISH_PAGE,
    state: {
      ...SAMPLE_PUBLISH_PAGE.state,
      draft: { draftRevision: "1", changes },
    },
  };
}

const NOTHING_PENDING = withDraft([]);
/** The sample's draft without the switch that turns the provisional figures off: publishing it asks the plain question. */
const PLAIN_DRAFT = withDraft(
  SAMPLE_PUBLISH_PAGE.state.draft.changes.filter(
    (change) => change.address.kind !== "provisional",
  ),
);
const PLAIN_COUNT = PLAIN_DRAFT.state.draft.changes.length;
const RESTATED_ONLY = withDraft([
  {
    address: {
      kind: "cabinet",
      ruleId: "cabinet.base-cabinet",
      field: "anchorMinor",
    },
    value: anchorOfBaseCabinet(),
  },
]);
const PROVISIONAL_OFF = withDraft([
  { address: { kind: "provisional" }, value: false },
]);

function anchorOfBaseCabinet(): number {
  const rule = SAMPLE_PUBLISH_PAGE.state.active.book.cabinetRules.find(
    (candidate) => candidate.ruleId === "cabinet.base-cabinet",
  );
  const formula = rule?.formula;
  if (formula === undefined || !("anchorMinor" in formula)) {
    throw new Error("the sample's base cabinet has no anchor");
  }
  return formula.anchorMinor;
}

type Spied = {
  [Method in keyof PublishClient]: ReturnType<
    typeof vi.fn<PublishClient[Method]>
  >;
};

/** An in-memory client whose every call is recorded, with any method replaced by what a test needs it to answer. */
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
  input?: PublishPageInput;
  locale?: TestLocale;
  view?: PublishView;
  client?: PublishClient;
}): Promise<HTMLElement> {
  const {
    input = SAMPLE_PUBLISH_PAGE,
    locale = "ro",
    view = "pending",
    client = spiedClient(input),
  } = options;
  screen = mountInCatalogue(
    createElement(PublishScreen, {
      locale,
      context: contextOf("administrator", MENU),
      input,
      initialView: view,
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

function pressEscape(): void {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="alertdialog"]');

const requireDialog = (): HTMLElement => {
  const found = dialog();
  if (found === null) throw new Error("no dialog is open");
  return found;
};

const publishButton = (container: HTMLElement): HTMLButtonElement =>
  requireIn<HTMLButtonElement>(container, '[class*="primary"]');

const nameField = (container: HTMLElement): HTMLInputElement =>
  requireIn<HTMLInputElement>(container, 'input[type="text"]');

const groupRow = (container: HTMLElement): HTMLElement =>
  requireIn(container, '[data-testid="diff-group"]');

const rowsIn = (scope: ParentNode): HTMLElement[] =>
  allIn(scope, '[data-testid="diff-row"]');

describe("the pending prices (D7A)", () => {
  it("draws every section the draft touches, in the dashboard's order, under the page's one h1 inside the frame", async () => {
    const container = await mountPublish({});

    expect(allIn(container, "h1").map((h1) => h1.textContent)).toEqual([
      COPY.publish.title,
    ]);
    const shown = allIn(container, '[data-testid^="diff-section-"]').map(
      (section) => section.dataset.testid?.replace("diff-section-", ""),
    );
    expect(shown.length).toBeGreaterThanOrEqual(4);
    expect(shown).toEqual(
      DIFF_SECTIONS.filter((section) => shown.includes(section)),
    );
  });

  it("writes a bulk action as one row, '+5 % la 1 dulap', with its count of cabinets and prices", async () => {
    const container = await mountPublish({});

    const row = groupRow(container);
    expect(requireIn(row, '[data-testid="diff-group-name"]').textContent).toBe(
      roCopy("priceDashboard.publish.bulkRowName", {
        signedPercent: "+5",
        group: roCopy("priceDashboard.cabinets.groupCount", {
          count: SAMPLE_BULK_CABINETS,
        }),
      }),
    );
    expect(row.textContent).toContain(
      roCopy("priceDashboard.publish.bulkRowSummary", {
        cabinetCount: SAMPLE_BULK_CABINETS,
        priceCount: SAMPLE_BULK_CABINETS * AMOUNTS_PER_CABINET,
      }),
    );
  });

  it("opens a bulk row to its items and closes it again, naming the row in the toggle", async () => {
    const container = await mountPublish({});
    const row = groupRow(container);
    const toggle = requireIn<HTMLButtonElement>(row, "button[aria-expanded]");
    const members = requireIn(row, "ul");

    expect([toggle.getAttribute("aria-expanded"), members.hidden]).toEqual([
      "true",
      false,
    ]);
    expect(rowsIn(members).length).toBeGreaterThan(0);

    click(toggle);

    expect([toggle.getAttribute("aria-expanded"), members.hidden]).toEqual([
      "false",
      true,
    ]);
    expect(toggle.textContent).toBe(COPY.publish.bulkRowShow);
    const name = requireIn(row, '[data-testid="diff-group-name"]').textContent;
    expect(
      toggle
        .getAttribute("aria-labelledby")
        ?.split(" ")
        .map((id) => document.getElementById(id)?.textContent)
        .join(" "),
    ).toBe(`${COPY.publish.bulkRowShow} ${name}`);
  });

  it("tells the Russian page in Russian, group and all", async () => {
    const container = await mountPublish({ locale: "ru" });

    expect(requireIn(container, "h1").textContent).toBe(
      ruCopy("priceDashboard.publish.title"),
    );
    expect(
      requireIn(groupRow(container), '[data-testid="diff-group-name"]')
        .textContent,
    ).toBe(
      ruCopy("priceDashboard.publish.bulkRowName", {
        signedPercent: "+5",
        group: ruCopy("priceDashboard.cabinets.groupCount", {
          count: SAMPLE_BULK_CABINETS,
        }),
      }),
    );
  });

  it("names the depth rule by the kitchen depth it is for and by what it applies to, with its old and new values", async () => {
    const container = await mountPublish({});

    const depth = rowsIn(container).find((row) =>
      row.textContent.includes(
        roCopy("priceDashboard.rule.deepKitchenLabel", { depthMm: 700 }),
      ),
    );
    expect(depth).toBeDefined();
    expect(depth?.textContent).toContain(COPY.rule.scope);
    const [before, after] = allIn(depth ?? container, '[class*="cellValue"]');
    expect([before?.textContent, after?.textContent]).toEqual([
      roCopy("priceDashboard.common.percentPlus", { percent: "15" }),
      roCopy("priceDashboard.common.percentPlus", { percent: "18" }),
    ]);
  });

  it("restates a value without a difference and with no pretence of a change", async () => {
    const container = await mountPublish({ input: RESTATED_ONLY });

    const [row] = rowsIn(container);
    expect(row?.dataset.unchanged).toBe("true");
    expect(rowsIn(container)).toHaveLength(1);
  });

  it("puts the count of waiting prices in the tab, the bar and the button, from the draft it holds", async () => {
    const container = await mountPublish({});

    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: PENDING_COUNT }),
    );
    expect(publishButton(container).textContent).toBe(
      roCopy("priceDashboard.publish.publishAction", { count: PENDING_COUNT }),
    );
  });
});

describe("turning a pending price back (the arrow)", () => {
  it("asks the client to remove one change by its address and draws the draft it answers", async () => {
    const client = spiedClient(SAMPLE_PUBLISH_PAGE);
    const container = await mountPublish({ client });
    const first = rowsIn(container).find(
      (row) => row.closest('[data-testid="diff-group"]') === null,
    );
    if (first === undefined) throw new Error("the sample has no single row");
    const revert = requireIn<HTMLButtonElement>(
      first,
      '[data-testid="diff-revert"]',
    );

    click(revert);
    await settle();

    expect(client.revert).toHaveBeenCalledTimes(1);
    const request = client.revert.mock.calls[0]?.[0];
    expect(request?.expectedDraftRevision).toBe("1");
    expect(request?.target.kind).toBe("change");
    expect(rowsIn(container)).not.toContain(first);
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: PENDING_COUNT - 1 }),
    );
  });

  it("asks for a whole bulk action by its group id, and takes it out of the list", async () => {
    const client = spiedClient(SAMPLE_PUBLISH_PAGE);
    const container = await mountPublish({ client });
    const row = groupRow(container);
    const groupId = row.dataset.groupId;
    const revert = requireIn<HTMLButtonElement>(
      row,
      '[data-testid="diff-revert"]',
    );

    click(revert);
    await settle();

    expect(client.revert.mock.calls[0]?.[0].target).toEqual({
      kind: "group",
      groupId,
    });
    expect(container.querySelector('[data-testid="diff-group"]')).toBeNull();
  });

  it("says nothing was saved when the client fails, and keeps the row", async () => {
    const client = spiedClient(SAMPLE_PUBLISH_PAGE, {
      revert: () => Promise.resolve({ kind: "failed" }),
    });
    const container = await mountPublish({ client });
    const before = rowsIn(container).length;

    click(
      requireIn<HTMLButtonElement>(container, '[data-testid="diff-revert"]'),
    );
    await settle();

    expect(rowsIn(container)).toHaveLength(before);
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.errors.saveFailed);
  });
});

describe("publishing (D7B, D7E, D7F)", () => {
  async function askToPublish(client: Spied): Promise<HTMLElement> {
    const container = await mountPublish({ input: PLAIN_DRAFT, client });
    typeInto(nameField(container), "Ajustari noiembrie");
    click(publishButton(container));
    return container;
  }

  it("asks first, in a dialog that opens on its cancel button, holds the Tab key and gives way to Escape without sending anything", async () => {
    const client = spiedClient(PLAIN_DRAFT);
    await askToPublish(client);

    const open = requireDialog();
    expect(document.activeElement).toBe(
      byWords(open, "button", COPY.common.cancel),
    );
    act(() => {
      open.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(
      byWords(open, "button", COPY.publish.confirmAction),
    );
    expect(open.closest("main")).not.toBeNull();

    pressEscape();

    expect(dialog()).toBeNull();
    expect(client.publish).not.toHaveBeenCalled();
  });

  it("names the version in the question and says what publishing does to saved kitchens", async () => {
    await askToPublish(spiedClient(PLAIN_DRAFT));

    const text = requireDialog().textContent;
    expect(text).toContain("Ajustari noiembrie");
    expect(text).toContain(
      roCopy("priceDashboard.publish.confirmBody", { count: PLAIN_COUNT }),
    );
  });

  it("sends the revisions it displayed and the version's name, and lands in the history on the new active version", async () => {
    const client = spiedClient(PLAIN_DRAFT);
    const container = await askToPublish(client);

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(client.publish).toHaveBeenCalledTimes(1);
    expect(client.publish.mock.calls[0]?.[0]).toEqual({
      expectedDraftRevision: "1",
      expectedActiveSequence: ACTIVE_SEQUENCE,
      expectedAvailabilityRevision: "0",
      label: "Ajustari noiembrie",
      note: "",
    });
    expect(dialog()).toBeNull();
    const history = requireIn(container, '[data-testid="version-history"]');
    const [newest] = allIn(history, '[data-testid="version-row"]');
    expect(newest?.dataset.state).toBe("active");
    expect(newest?.textContent).toContain("Ajustari noiembrie");
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.publish.publishedBody);
    expect(container.querySelector(PENDING_CHIP)).toBeNull();
    expect(requireIn(container, ALL_PUBLISHED).textContent).toBe(
      COPY.nav.allPublished,
    );
  });

  it("asks for a name before it asks anything else, and sends nothing without one", async () => {
    const client = spiedClient(PLAIN_DRAFT);
    const container = await mountPublish({ client });

    click(publishButton(container));

    expect(dialog()).toBeNull();
    const field = nameField(container);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(requireIn(container, '[role="alert"]').textContent).toBe(
      COPY.publish.versionNameEmpty,
    );
    expect(client.publish).not.toHaveBeenCalled();
  });

  it("refuses a name the server refuses, in the field and without a notice", async () => {
    const client = spiedClient(PLAIN_DRAFT, {
      publish: () =>
        Promise.resolve({ kind: "invalid", code: "TEXT_TOO_LONG" }),
    });
    const container = await askToPublish(client);

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(requireIn(container, '[role="alert"]').textContent).toBe(
      COPY.publish.versionNameTooLong,
    );
    expect(nameField(container).getAttribute("aria-invalid")).toBe("true");
    expect(
      container.querySelector('[data-testid="publish-notice"]'),
    ).toBeNull();
  });

  it("is off while the draft only restates the book, and opens no dialog when pressed", async () => {
    const container = await mountPublish({ input: RESTATED_ONLY });
    typeInto(nameField(container), "Ajustari");

    const button = publishButton(container);
    click(button);

    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(dialog()).toBeNull();
  });

  it("is on for a draft that holds a real change", async () => {
    const container = await mountPublish({});

    expect(publishButton(container).getAttribute("aria-disabled")).toBeNull();
  });
});

describe("a publish that does not happen (D7G)", () => {
  it("leaves the draft, the rows and the active version as they were, and says the server did not answer", async () => {
    const client = spiedClient(PLAIN_DRAFT, {
      publish: () => Promise.resolve({ kind: "failed" }),
    });
    const container = await mountPublish({ input: PLAIN_DRAFT, client });
    const rowsBefore = rowsIn(container).length;
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    const notice = requireIn(container, '[data-testid="publish-notice"]');
    expect(notice.textContent).toContain(COPY.publish.failedTitle);
    expect(notice.textContent).toContain(COPY.publish.failedBody);
    expect(rowsIn(container)).toHaveLength(rowsBefore);
    expect(
      container.querySelector('[data-testid="version-history"]'),
    ).toBeNull();
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: PLAIN_COUNT }),
    );
    expect(nameField(container).value).toBe("Ajustari");
  });

  it("asks again from the notice's own button", async () => {
    const client = spiedClient(PLAIN_DRAFT, {
      publish: () => Promise.resolve({ kind: "failed" }),
    });
    const container = await mountPublish({ input: PLAIN_DRAFT, client });
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));
    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    click(byWords(container, "button", COPY.publish.retry));

    expect(dialog()).not.toBeNull();
  });

  it("reads the state again and says it changed when another person published first", async () => {
    const client = spiedClient(PLAIN_DRAFT, {
      publish: () => Promise.resolve({ kind: "conflict" }),
    });
    const container = await mountPublish({ input: PLAIN_DRAFT, client });
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(client.readState).toHaveBeenCalled();
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.errors.changedMeanwhile);
  });

  it("names the item a publish was refused for when it began to be used", async () => {
    const material = PLAIN_DRAFT.state.active.book.material.tiers[1];
    if (material === undefined) throw new Error("no second material");
    const client = spiedClient(PLAIN_DRAFT, {
      publish: () =>
        Promise.resolve({
          kind: "blocked",
          block: {
            kind: "in-use",
            items: [{ kind: "material", tierId: material.tierId }],
          },
        }),
    });
    const container = await mountPublish({ input: PLAIN_DRAFT, client });
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(
      roCopy("priceDashboard.publish.blockedInUse", { name: material.name }),
    );
  });
});

describe("turning the provisional figures off (D7C)", () => {
  async function askToPublishWithTheFiguresOff(client: Spied) {
    const container = await mountPublish({ input: PROVISIONAL_OFF, client });
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));
    return container;
  }

  it("asks the stronger question, opens on its checkbox, and keeps the act off until it is ticked", async () => {
    const client = spiedClient(PROVISIONAL_OFF);
    await askToPublishWithTheFiguresOff(client);

    const open = requireDialog();
    expect(open.textContent).toContain(COPY.publish.provisionalOffTitle);
    const check = requireIn<HTMLInputElement>(open, 'input[type="checkbox"]');
    expect(document.activeElement).toBe(check);
    const confirm = byWords(open, "button", COPY.publish.provisionalOffConfirm);
    expect(confirm.getAttribute("aria-disabled")).toBe("true");

    click(confirm);
    await settle();
    expect(client.publish).not.toHaveBeenCalled();

    click(check);
    expect(confirm.getAttribute("aria-disabled")).toBeNull();
    click(confirm);
    await settle();
    expect(client.publish).toHaveBeenCalledTimes(1);
  });

  it("is not asked when the draft leaves the figures on", async () => {
    const container = await mountPublish({ input: PLAIN_DRAFT });
    typeInto(nameField(container), "Ajustari");

    click(publishButton(container));

    expect(requireDialog().textContent).not.toContain(
      COPY.publish.provisionalOffTitle,
    );
  });

  it("is a draft change like any price: the switch sends it, and turning it back removes it", async () => {
    const client = spiedClient(NOTHING_PENDING);
    const container = await mountPublish({ input: NOTHING_PENDING, client });
    const toggle = requireIn<HTMLButtonElement>(container, '[role="switch"]');
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    click(toggle);
    await settle();

    expect(client.change.mock.calls[0]?.[0].change).toEqual({
      address: { kind: "provisional" },
      value: false,
    });
    const afterwards = requireIn<HTMLButtonElement>(
      container,
      '[role="switch"]',
    );
    expect(afterwards.getAttribute("aria-checked")).toBe("false");

    click(afterwards);
    await settle();

    expect(client.revert.mock.calls[0]?.[0].target).toEqual({
      kind: "change",
      address: { kind: "provisional" },
    });
  });
});

describe("nothing to publish (D7D)", () => {
  it("says so, offers the latest versions and no button to publish", async () => {
    const container = await mountPublish({ input: NOTHING_PENDING });

    const empty = requireIn(container, '[data-testid="publish-empty"]');
    expect(empty.textContent).toContain(COPY.publish.emptyTitle);
    expect(empty.textContent).toContain(
      roCopy("priceDashboard.publish.emptyBody", {
        versionId: String(ACTIVE_SEQUENCE),
      }),
    );
    expect(allIn(container, '[data-testid="version-row"]')).toHaveLength(3);
    expect(container.querySelector('[class*="primary"]')).toBeNull();
    expect(requireIn(container, ALL_PUBLISHED).textContent).toBe(
      COPY.nav.allPublished,
    );
  });
});

describe("the history (D8A)", () => {
  it("lists the versions newest first with the active one marked, and a row for what is still to publish", async () => {
    const container = await mountPublish({ view: "history" });

    const rows = allIn(container, '[data-testid="version-row"]');
    expect(rows.map((row) => row.dataset.state)).toEqual([
      "active",
      "archived",
      "archived",
      "archived",
    ]);
    expect(rows[0]?.textContent).toContain(String(ACTIVE_SEQUENCE));
    const pendingRow = requireIn(
      container,
      '[data-testid="version-row-pending"]',
    );
    expect(pendingRow.textContent).toContain(COPY.history.pendingRowName);
    expect(pendingRow.textContent).toContain(COPY.history.statePreparing);
    expect(pendingRow.getAttribute("href")).toBe("/ro/staff/catalog/publish");
  });

  it("opens each version on its own address", async () => {
    const container = await mountPublish({ view: "history" });

    const [first] = allIn<HTMLAnchorElement>(
      container,
      '[data-testid="version-row"]',
    );
    expect(first?.getAttribute("href")).toBe(
      `/ro/staff/catalog/publish/${SAMPLE_PUBLISH_PAGE.state.active.versionId}`,
    );
  });

  it("marks the tab it is on", async () => {
    const container = await mountPublish({ view: "history" });

    const current = requireIn(container, '[aria-current="page"][class*="tab"]');
    expect(current.textContent).toBe(COPY.publish.tabHistory);
  });
});

describe("a build that cannot read the prices", () => {
  it("draws the notice inside the staff frame, not an empty page", async () => {
    screen = mountInCatalogue(
      createElement(PublishUnavailableScreen, {
        locale: "ro",
        context: contextOf("administrator", MENU),
      }),
      "ro",
    );
    await flushPromises(5);

    expect(screen.container.querySelector("main")).not.toBeNull();
    expect(
      screen.container.querySelector('[data-testid="publish-page"]'),
    ).toBeNull();
    expect(screen.container.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe("a client that rejects", () => {
  it("is told as a failed publish: the dialog closes, the notice shows and the draft stays", async () => {
    const client = spiedClient(PLAIN_DRAFT, {
      publish: () => Promise.reject(new Error("the network dropped")),
    });
    const container = await mountPublish({ input: PLAIN_DRAFT, client });
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(dialog()).toBeNull();
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.publish.failedTitle);
    expect(publishButton(container).getAttribute("aria-busy")).toBeNull();
    expect(rowsIn(container).length).toBeGreaterThan(0);
  });

  it("is told as a draft write that saved nothing, for a revert that throws", async () => {
    const client = spiedClient(PLAIN_DRAFT, {
      revert: () => {
        throw new Error("thrown, not rejected");
      },
    });
    const container = await mountPublish({ input: PLAIN_DRAFT, client });
    const before = rowsIn(container).length;

    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();

    expect(rowsIn(container)).toHaveLength(before);
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.errors.saveFailed);
  });

  it("does not leave a conflict waiting when the state cannot be read again", async () => {
    const client = spiedClient(PLAIN_DRAFT, {
      publish: () => Promise.resolve({ kind: "conflict" }),
      readState: () => Promise.reject(new Error("offline")),
    });
    const container = await mountPublish({ input: PLAIN_DRAFT, client });
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.errors.changedMeanwhile);
  });
});

describe("where focus goes when a dialog closes after a press that did not focus its button", () => {
  function blurWhatHasFocus(): void {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
  }

  it("returns to the publish button when the confirmation is dismissed", async () => {
    const container = await mountPublish({ input: PLAIN_DRAFT });
    typeInto(nameField(container), "Ajustari");
    blurWhatHasFocus();
    click(publishButton(container));

    pressEscape();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(publishButton(container));
  });

  it("returns to the publish button when the provisional question is dismissed", async () => {
    const container = await mountPublish({ input: PROVISIONAL_OFF });
    typeInto(nameField(container), "Ajustari");
    blurWhatHasFocus();
    click(publishButton(container));

    pressEscape();

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(publishButton(container));
  });
});

describe("a publish refused for the book the draft would make", () => {
  it("says what is wrong in its own words, with no retry that could never succeed, and leaves the draft", async () => {
    const client = spiedClient(PLAIN_DRAFT, {
      publish: () => Promise.resolve({ kind: "candidate-refused" }),
    });
    const container = await mountPublish({ input: PLAIN_DRAFT, client });
    const rowsBefore = rowsIn(container).length;
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    const notice = requireIn(container, '[data-testid="publish-notice"]');
    expect(notice.textContent).toContain(COPY.publish.candidateRefusedTitle);
    expect(notice.textContent).toContain(COPY.publish.candidateRefusedBody);
    expect(notice.textContent).not.toContain(COPY.publish.failedTitle);
    expect(notice.querySelector("button")).toBeNull();
    expect(rowsIn(container)).toHaveLength(rowsBefore);
  });

  it("is told in Russian too", async () => {
    const client = spiedClient(PLAIN_DRAFT, {
      publish: () => Promise.resolve({ kind: "candidate-refused" }),
    });
    const container = await mountPublish({
      input: PLAIN_DRAFT,
      client,
      locale: "ru",
    });
    typeInto(nameField(container), "Ajustari");
    click(publishButton(container));
    click(requireIn(requireDialog(), "button"));
    await settle();

    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(ruMessages.priceDashboard.publish.candidateRefusedTitle);
  });
});

describe("a name with a character the rule forbids", () => {
  it("is refused in the field by the in-memory client, as the real rule will", async () => {
    const container = await mountPublish({ input: PLAIN_DRAFT });
    typeInto(nameField(container), "Ajustari\u0007");
    click(publishButton(container));

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(requireIn(container, '[role="alert"]').textContent).toBe(
      COPY.publish.versionNameForbidden,
    );
  });
});

describe("the whole catalogue and a selection", () => {
  it("are told differently on a row: all the cabinets, or a count of them", async () => {
    const whole = withDraft(
      SAMPLE_PUBLISH_PAGE.state.draft.changes.map((change) =>
        change.bulk === undefined
          ? change
          : { ...change, bulk: { percent: 5, scope: "all" as const } },
      ),
    );

    const container = await mountPublish({ input: whole });

    expect(
      requireIn(groupRow(container), '[data-testid="diff-group-name"]')
        .textContent,
    ).toBe(
      roCopy("priceDashboard.publish.bulkRowName", {
        signedPercent: "+5",
        group: COPY.publish.bulkScopeAll,
      }),
    );
  });
});
