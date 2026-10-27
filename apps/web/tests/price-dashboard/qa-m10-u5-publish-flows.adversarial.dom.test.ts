// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U5, the acts: the two publish questions held to their keys and focus, a publish that is
// refused or answered late, the history, a version page that cannot be written on, a restore, and the count in the frame.
// `publish-screen.dom.test.ts` and `version-detail.dom.test.ts` walk each happy path once; this file adds what they leave
// out (named at each test): Shift+Tab, the inert page, focus coming back, a ticked box not surviving a cancel, a request in
// flight not being doubled or dismissed, a retry after a conflict carrying the fresh revision, restores from every
// archived version, and counts that are numbers but not counts of prices.
import {
  applyChanges,
  isSameAddress,
  readEditableFields,
  type AppliedAddress,
  type DraftChange,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishClient } from "@/price-dashboard/publish-client";
import {
  makeSamplePublishClient,
  sampleVersionIdOf,
} from "@/price-dashboard/publish-sample-client";
import type {
  PublishPageInput,
  VersionDetailInput,
} from "@/price-dashboard/publish-model";
import { PublishScreen } from "@/price-dashboard/publish-page";
import {
  SAMPLE_PUBLISH_PAGE,
  sampleVersionDetail,
} from "@/price-dashboard/publish-sample";
import { VersionDetailScreen } from "@/price-dashboard/version-detail";

import roMessages from "../../src/messages/ro.json";
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
  mountInStaffFrame,
  stubTheStaffServer,
} from "./staff-frame-harness";

const COPY = roMessages.priceDashboard;
const MENU: Parameters<typeof contextOf>[1] = [
  "kitchens",
  "audit",
  "cabinets",
  "publish",
];
const ACTIVE = SAMPLE_PUBLISH_PAGE.state.active.book;
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

// ---- fixtures ---------------------------------------------------------------------------------------------------------

function numberAt(address: AppliedAddress): number {
  const reading = readEditableFields(ACTIVE).find((row) =>
    isSameAddress(row.address, address),
  );
  if (typeof reading?.value !== "number") throw new Error("not a number");
  return reading.value;
}

const BASE_ANCHOR: AppliedAddress = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
};
const SHELF_ANCHOR: AppliedAddress = {
  kind: "cabinet",
  ruleId: "cabinet.open-shelf",
  field: "anchorMinor",
};
const PRICE: DraftChange = {
  address: BASE_ANCHOR,
  value: numberAt(BASE_ANCHOR) + 20_000,
};
const PROVISIONAL_OFF: DraftChange = {
  address: { kind: "provisional" },
  value: false,
};
const PROVISIONAL_ON: DraftChange = {
  address: { kind: "provisional" },
  value: true,
};

function inputWith(
  changes: readonly DraftChange[],
  revision = "1",
): PublishPageInput {
  return {
    ...SAMPLE_PUBLISH_PAGE,
    state: {
      ...SAMPLE_PUBLISH_PAGE.state,
      draft: { draftRevision: revision, changes },
    },
  };
}

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

async function settle(): Promise<void> {
  await act(async () => {
    await flushPromises(5);
  });
}

async function mountPublish(
  input: PublishPageInput,
  client: PublishClient = spiedClient(input),
  view: "pending" | "history" = "pending",
) {
  screen = mountInCatalogue(
    createElement(PublishScreen, {
      locale: "ro",
      context: contextOf("administrator", MENU),
      input,
      initialView: view,
      client,
    }),
    "ro",
  );
  await flushPromises(5);
  return screen.container;
}

const nameField = (container: HTMLElement): HTMLInputElement =>
  requireIn<HTMLInputElement>(container, 'input[type="text"]');
const publishButton = (container: HTMLElement): HTMLButtonElement =>
  requireIn<HTMLButtonElement>(container, '[class*="primary"]');
const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="alertdialog"]');
const requireDialog = (): HTMLElement => {
  const found = dialog();
  if (found === null) throw new Error("no dialog is open");
  return found;
};
const key = (
  target: Element | Document,
  name: string,
  options: KeyboardEventInit = {},
): void => {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: name,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    );
  });
};

async function askToPublish(
  input: PublishPageInput,
  client: Spied,
  name = "Ajustari",
) {
  const container = await mountPublish(input, client);
  typeInto(nameField(container), name);
  publishButton(container).focus();
  click(publishButton(container));
  return container;
}

// ---- the publish question (D7B) ---------------------------------------------------------------------------------------

describe("the publish question when it is open", () => {
  it("wraps Shift+Tab from the first control to the last, holds the page behind inert, and gives focus back to the button that asked", async () => {
    const container = await askToPublish(
      inputWith([PRICE]),
      spiedClient(inputWith([PRICE])),
    );
    const open = requireDialog();
    const page = requireIn(container, '[data-testid="publish-page"]');
    const confirm = byWords<HTMLButtonElement>(
      open,
      "button",
      COPY.publish.confirmAction,
    );
    const cancel = byWords<HTMLButtonElement>(
      open,
      "button",
      COPY.common.cancel,
    );

    confirm.focus();
    key(open, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(cancel);
    expect(page.closest("[inert]")).not.toBeNull();

    key(document, "Escape");

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(publishButton(container));
    expect(page.closest("[inert]")).toBeNull();
  });

  it("sends one request when the act is pressed twice, and neither Escape nor Cancel leaves while it is out", async () => {
    let answer: (
      outcome: Awaited<ReturnType<PublishClient["publish"]>>,
    ) => void = () => undefined;
    const client = spiedClient(inputWith([PRICE]), {
      publish: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    await askToPublish(inputWith([PRICE]), client);
    const open = requireDialog();

    click(byWords(open, "button", COPY.publish.confirmAction));
    click(byWords(open, "button", COPY.publish.publishing));
    key(document, "Escape");
    click(byWords(open, "button", COPY.common.cancel));
    await settle();

    expect(client.publish).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toBeNull();

    answer({ kind: "failed" });
    await settle();

    expect(dialog()).toBeNull();
  });

  it("sends the name the person typed without the spaces around it, and keeps an 80-character name that the 81-character one is refused for", async () => {
    const longest = "N".repeat(80);
    const client = spiedClient(inputWith([PRICE]));
    await askToPublish(inputWith([PRICE]), client, `  ${longest}  `);
    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();
    expect(client.publish.mock.calls[0]?.[0].label).toBe(longest);

    screen?.unmount();
    const tooLong = spiedClient(inputWith([PRICE]));
    const again = await askToPublish(
      inputWith([PRICE]),
      tooLong,
      "N".repeat(81),
    );
    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(tooLong.publish).toHaveBeenCalledTimes(1);
    expect(requireIn(again, '[role="alert"]').textContent).toBe(
      COPY.publish.versionNameTooLong,
    );
  });

  it("treats a name of spaces as no name", async () => {
    const client = spiedClient(inputWith([PRICE]));
    const container = await mountPublish(inputWith([PRICE]), client);
    typeInto(nameField(container), "     ");

    click(publishButton(container));

    expect(dialog()).toBeNull();
    expect(requireIn(container, '[role="alert"]').textContent).toBe(
      COPY.publish.versionNameEmpty,
    );
    expect(client.publish).not.toHaveBeenCalled();
  });
});

// ---- the provisional question (D7C) -----------------------------------------------------------------------------------

describe("the provisional question", () => {
  const WITH_FIGURES_OFF = inputWith([PRICE, PROVISIONAL_OFF]);

  it("is asked whenever the draft turns the figures off, beside any number of other changes, and never for a draft that turns them on", async () => {
    await askToPublish(WITH_FIGURES_OFF, spiedClient(WITH_FIGURES_OFF));
    expect(
      requireDialog().querySelector('input[type="checkbox"]'),
    ).not.toBeNull();

    screen?.unmount();
    const turningOn = inputWith([PRICE, PROVISIONAL_ON]);
    await askToPublish(turningOn, spiedClient(turningOn));
    expect(requireDialog().querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("is off again when the box is cleared, and a press on it then sends nothing", async () => {
    const client = spiedClient(WITH_FIGURES_OFF);
    await askToPublish(WITH_FIGURES_OFF, client);
    const open = requireDialog();
    const box = requireIn<HTMLInputElement>(open, 'input[type="checkbox"]');
    const confirm = byWords(open, "button", COPY.publish.provisionalOffConfirm);

    click(box);
    expect(confirm.getAttribute("aria-disabled")).toBeNull();
    click(box);
    expect(box.checked).toBe(false);
    click(confirm);
    await settle();

    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(client.publish).not.toHaveBeenCalled();
  });

  it("does not remember a ticked box through a cancel: the next question opens unticked", async () => {
    const client = spiedClient(WITH_FIGURES_OFF);
    const container = await askToPublish(WITH_FIGURES_OFF, client);
    click(requireIn(requireDialog(), 'input[type="checkbox"]'));
    click(byWords(requireDialog(), "button", COPY.common.cancel));
    expect(dialog()).toBeNull();

    click(publishButton(container));

    const reopened = requireIn<HTMLInputElement>(
      requireDialog(),
      'input[type="checkbox"]',
    );
    expect(reopened.checked).toBe(false);
    expect(
      byWords(
        requireDialog(),
        "button",
        COPY.publish.provisionalOffConfirm,
      ).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("does not remember a ticked box through a failed publish and its retry", async () => {
    const client = spiedClient(WITH_FIGURES_OFF, {
      publish: () => Promise.resolve({ kind: "failed" }),
    });
    const container = await askToPublish(WITH_FIGURES_OFF, client);
    click(requireIn(requireDialog(), 'input[type="checkbox"]'));
    click(
      byWords(requireDialog(), "button", COPY.publish.provisionalOffConfirm),
    );
    await settle();
    expect(client.publish).toHaveBeenCalledTimes(1);

    click(byWords(container, "button", COPY.publish.retry));

    expect(
      requireIn<HTMLInputElement>(requireDialog(), 'input[type="checkbox"]')
        .checked,
    ).toBe(false);
    click(
      byWords(requireDialog(), "button", COPY.publish.provisionalOffConfirm),
    );
    await settle();
    expect(client.publish).toHaveBeenCalledTimes(1);
  });
});

// ---- a publish that does not happen (D7G) -----------------------------------------------------------------------------

describe("a publish another person got ahead of", () => {
  it("draws the draft that was read again, keeps the active version, and sends the fresh revision on the next try", async () => {
    const mine = inputWith([PRICE], "1");
    const theirs = inputWith(
      [{ address: SHELF_ANCHOR, value: numberAt(SHELF_ANCHOR) + 5_000 }],
      "2",
    );
    const client = spiedClient(mine, {
      readState: () => Promise.resolve(theirs.state),
      publish: vi
        .fn<PublishClient["publish"]>()
        .mockResolvedValueOnce({ kind: "conflict" })
        .mockResolvedValue({ kind: "failed" }),
    });
    const container = await askToPublish(mine, client);

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(allIn(container, '[data-testid="diff-row"]')).toHaveLength(1);
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.errors.changedMeanwhile);
    expect(
      container.querySelector('[data-testid="version-history"]'),
    ).toBeNull();
    expect(nameField(container).value).toBe("Ajustari");

    click(publishButton(container));
    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(
      client.publish.mock.calls.map(
        ([request]) => request.expectedDraftRevision,
      ),
    ).toEqual(["1", "2"]);
    expect(
      client.publish.mock.calls.every(
        ([request]) =>
          request.expectedActiveSequence === mine.state.active.sequenceNumber,
      ),
    ).toBe(true);
  });

  it("leaves the rows and the count alone when the state cannot be read again", async () => {
    const mine = inputWith([PRICE]);
    const client = spiedClient(mine, {
      readState: () => Promise.resolve(undefined),
      publish: () => Promise.resolve({ kind: "conflict" }),
    });
    const container = await askToPublish(mine, client);

    click(byWords(requireDialog(), "button", COPY.publish.confirmAction));
    await settle();

    expect(allIn(container, '[data-testid="diff-row"]')).toHaveLength(1);
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
  });

  it("leaves the draft where it was when taking a row back is refused or answered late", async () => {
    const input = inputWith([PRICE]);
    const client = spiedClient(input, {
      revert: () => Promise.resolve({ kind: "failed" }),
    });
    const container = await mountPublish(input, client);

    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();

    expect(allIn(container, '[data-testid="diff-row"]')).toHaveLength(1);
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(COPY.errors.saveFailed);
    expect((await client.readState())?.draft.changes).toEqual([PRICE]);
  });
});

// ---- the history ------------------------------------------------------------------------------------------------------

function versionsOf(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const sequenceNumber = count - index;
    return {
      versionId: sampleVersionIdOf(sequenceNumber),
      sequenceNumber,
      label: `Versiunea ${String(sequenceNumber)}`,
      state: index === 0 ? ("active" as const) : ("archived" as const),
      publishedAt: `2026-0${String(Math.min(9, sequenceNumber))}-10T08:00:00.000Z`,
      changeCount: sequenceNumber,
    };
  });
}

describe.each([1, 2, 3, 9, 25])("the history of %i versions", (count) => {
  it("lists them newest first with one active, and the waiting row above them only when something waits", async () => {
    const versions = versionsOf(count);
    const withDraft: PublishPageInput = {
      ...inputWith([PRICE]),
      versions: { total: count, page: 1, pageSize: 50, versions },
    };
    const container = await mountPublish(
      withDraft,
      spiedClient(withDraft),
      "history",
    );

    const rows = allIn(container, '[data-testid="version-row"]');
    expect(rows.map((row) => row.dataset.versionId)).toEqual(
      versions.map((version) => version.versionId),
    );
    expect(rows.filter((row) => row.dataset.state === "active")).toHaveLength(
      1,
    );
    expect(rows[0]?.dataset.state).toBe("active");
    const [first] = allIn(
      requireIn(container, '[data-testid="version-history"]'),
      "ul > li",
    );
    expect(
      first?.querySelector('[data-testid="version-row-pending"]'),
    ).not.toBeNull();
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(
      versions.map(
        (version) => `/ro/staff/catalog/publish/${version.versionId}`,
      ),
    );

    screen?.unmount();
    const nothingWaiting: PublishPageInput = {
      ...withDraft,
      state: { ...withDraft.state, draft: { draftRevision: "1", changes: [] } },
    };
    const empty = await mountPublish(
      nothingWaiting,
      spiedClient(nothingWaiting),
      "history",
    );
    expect(
      empty.querySelector('[data-testid="version-row-pending"]'),
    ).toBeNull();
  });
});

// ---- a version, read-only, and its restore ----------------------------------------------------------------------------

function detailOf(sequenceNumber: number): VersionDetailInput {
  const found = sampleVersionDetail(sampleVersionIdOf(sequenceNumber));
  if (found === undefined) throw new Error("the sample holds no such version");
  return found;
}

function spiedDetailClient(
  input: VersionDetailInput,
  replace: Partial<PublishClient> = {},
): Spied {
  const base = makeSamplePublishClient({
    state: {
      active: {
        versionId: sampleVersionIdOf(input.active.sequenceNumber),
        book: input.active.book,
        availability: { revision: "0", disabled: [] },
        sequenceNumber: input.active.sequenceNumber,
        label: "",
        publishedAt: "",
      },
      draft: input.draft,
    },
    archived: new Map([[input.version.versionId, input.version.book]]),
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

async function mountDetail(
  input: VersionDetailInput,
  client: PublishClient = spiedDetailClient(input),
  locale: TestLocale = "ro",
) {
  screen = mountInCatalogue(
    createElement(VersionDetailScreen, {
      locale,
      context: contextOf("administrator", MENU),
      input,
      client,
    }),
    locale,
  );
  await flushPromises(5);
  return screen.container;
}

const restoreButton = (
  container: HTMLElement,
  sequenceNumber: number,
): HTMLButtonElement =>
  byWords<HTMLButtonElement>(
    container,
    "button",
    roCopy("priceDashboard.history.restoreAction", {
      versionId: String(sequenceNumber),
    }),
  );

describe.each([1, 2, 3, 4])("version %i's page", (sequenceNumber) => {
  it("holds no field, no switch, no arrow and nothing editable: it can be read and, if archived, restored, and no more", async () => {
    const container = await mountDetail(detailOf(sequenceNumber));

    const page = requireIn(container, '[data-testid="version-detail"]');
    expect(
      allIn(
        page,
        "input, textarea, select, [role='switch'], [contenteditable], [data-testid='diff-revert']",
      ),
    ).toEqual([]);
    const buttons = allIn(page, "button").filter(
      (button) => !button.hasAttribute("aria-expanded"),
    );
    const isArchived = sequenceNumber !== 4;
    expect(buttons.map((button) => button.textContent)).toEqual(
      isArchived
        ? [
            roCopy("priceDashboard.history.restoreAction", {
              versionId: String(sequenceNumber),
            }),
          ]
        : [],
    );
    expect(allIn(page, "a").length).toBeGreaterThan(0);
  });
});

describe("restoring an archived version", () => {
  /** active v4, archived v3: both state the base cabinet's anchor at the same price, and the drawers' rate differs. */
  const BASE_ACTIVE_AND_ARCHIVED = numberAt(BASE_ANCHOR);

  it("with active 100, draft 120 and archived 100 on one field takes the draft's 120 out and adds the archived rate, and the count follows", async () => {
    const input: VersionDetailInput = {
      ...detailOf(3),
      draft: {
        draftRevision: "1",
        changes: [
          { address: BASE_ANCHOR, value: BASE_ACTIVE_AND_ARCHIVED + 20_000 },
          { address: SHELF_ANCHOR, value: numberAt(SHELF_ANCHOR) + 3_000 },
        ],
      },
    };
    const client = spiedDetailClient(input);
    const container = await mountDetail(input, client);
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 2 }),
    );

    click(restoreButton(container, 3));
    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    const stored = (await client.readState())?.draft.changes ?? [];
    expect(stored.map((change) => change.address.kind)).toEqual(["hardware"]);
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
    expect(client.publish).not.toHaveBeenCalled();
    expect((await client.readState())?.active.sequenceNumber).toBe(
      input.active.sequenceNumber,
    );
    expect(applyChanges(input.active.book, stored).ok).toBe(true);
  });

  it.each([1, 2, 3])(
    "from version %i puts the archived prices in the draft, never publishes, and then has nothing left to restore",
    async (sequenceNumber) => {
      const input: VersionDetailInput = {
        ...detailOf(sequenceNumber),
        draft: { draftRevision: "1", changes: [] },
      };
      const client = spiedDetailClient(input);
      const container = await mountDetail(input, client);

      click(restoreButton(container, sequenceNumber));
      click(byWords(requireDialog(), "button", COPY.common.addToPending));
      await settle();

      const stored = (await client.readState())?.draft.changes ?? [];
      expect(stored.length).toBeGreaterThan(0);
      expect(client.publish).not.toHaveBeenCalled();
      expect(requireIn(container, PENDING_CHIP).textContent).toContain(
        roCopy("priceDashboard.nav.pendingChip", { count: stored.length }),
      );
      expect(
        restoreButton(container, sequenceNumber).getAttribute("aria-disabled"),
      ).toBe("true");
      const applied = applyChanges(input.active.book, stored);
      if (!applied.ok) throw new Error("the restored draft is refused");
      for (const reading of readEditableFields(input.version.book)) {
        const held = readEditableFields(applied.book).find((row) =>
          isSameAddress(row.address, reading.address),
        );
        expect(held?.value, JSON.stringify(reading.address)).toBe(
          reading.value,
        );
      }
    },
  );

  it("recovers from a changed draft: the retry after the 'read again' notice carries the revision that was read, not the stale one", async () => {
    const input: VersionDetailInput = {
      ...detailOf(3),
      draft: { draftRevision: "1", changes: [] },
    };
    const fresh = { draftRevision: "2", changes: [] as readonly DraftChange[] };
    const client = spiedDetailClient(input, {
      readState: () =>
        Promise.resolve({
          active: {
            versionId: "",
            book: input.active.book,
            availability: { revision: "0", disabled: [] },
            sequenceNumber: input.active.sequenceNumber,
            label: "",
            publishedAt: "",
          },
          draft: fresh,
        }),
      restore: (_versionId, request) =>
        Promise.resolve(
          request.expectedDraftRevision === "2"
            ? {
                kind: "restored",
                draft: { draftRevision: "3", changes: [] },
                addedChangeCount: 1,
              }
            : { kind: "conflict" },
        ),
    });
    const container = await mountDetail(input, client);
    click(restoreButton(container, 3));
    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();
    expect(requireDialog().textContent).toContain(COPY.errors.changedMeanwhile);

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(dialog()).toBeNull();
    expect(
      requireIn(container, '[data-testid="restore-notice"]'),
    ).toBeDefined();
  });

  it("keeps the active version, the draft and the count when the restore fails", async () => {
    const input: VersionDetailInput = {
      ...detailOf(3),
      draft: { draftRevision: "1", changes: [PRICE] },
    };
    const client = spiedDetailClient(input, {
      restore: () => Promise.resolve({ kind: "failed" }),
    });
    const container = await mountDetail(input, client);

    click(restoreButton(container, 3));
    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect((await client.readState())?.draft.changes).toEqual([PRICE]);
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
    expect(client.publish).not.toHaveBeenCalled();
  });

  it("is told with Escape that nothing was sent, and the draft is the one the page had", async () => {
    const input: VersionDetailInput = {
      ...detailOf(3),
      draft: { draftRevision: "1", changes: [PRICE] },
    };
    const client = spiedDetailClient(input);
    const container = await mountDetail(input, client);
    restoreButton(container, 3).focus();
    click(restoreButton(container, 3));

    key(document, "Escape");

    expect(client.restore).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(restoreButton(container, 3));
  });
});

// ---- the count in the frame -------------------------------------------------------------------------------------------

describe("a count that is a number but not a number of waiting prices", () => {
  const PAGES = ["kitchens", "audit", "cabinets", "publish"] as const;

  it.each([
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["past the safe integers", 2 ** 53],
    ["a size no list has", Number.MAX_VALUE],
    ["half a price", 0.5],
    ["minus half", -0.5],
    ["minus one", -1],
  ])(
    "draws neither the chip, the badge nor the 'all published' line for %s, on every page that carries them",
    async (_name, count) => {
      for (const page of PAGES) {
        const framed = await mountInStaffFrame({
          page,
          context: contextOf("administrator", MENU, count),
          children: null,
        });

        expect(framed.container.querySelector(PENDING_CHIP), page).toBeNull();
        expect(framed.container.querySelector(ALL_PUBLISHED), page).toBeNull();
        const link = allIn<HTMLAnchorElement>(framed.container, "a").find(
          (candidate) => candidate.href.endsWith("/staff/catalog/publish"),
        );
        expect(link?.getAttribute("aria-label"), page).toBeNull();
        framed.unmount();
      }
    },
  );

  it.each([1, 2, 5, 19, 20, 100, 9_999])(
    "draws %i as the chip and the badge on every page",
    async (count) => {
      for (const page of PAGES) {
        const framed = await mountInStaffFrame({
          page,
          context: contextOf("administrator", MENU, count),
          children: null,
        });

        expect(
          requireIn(framed.container, PENDING_CHIP).textContent,
          page,
        ).toContain(roCopy("priceDashboard.nav.pendingChip", { count }));
        expect(framed.container.querySelector(ALL_PUBLISHED), page).toBeNull();
        framed.unmount();
      }
    },
  );
});

describe("the order a keyboard visits the pending list in", () => {
  it("follows the order the page is drawn in: the tabs, the rows from the top, then the name, the switch and the button", async () => {
    const container = await mountPublish(SAMPLE_PUBLISH_PAGE);

    const page = requireIn(container, '[data-testid="publish-page"]');
    const kinds = allIn(page, "a[href], button, input").map((control) => {
      if (control.getAttribute("class")?.includes("_tab_")) return "tab";
      if (control.dataset.testid === "diff-revert") return "revert";
      if (control.hasAttribute("aria-expanded")) return "toggle";
      if (control.getAttribute("type") === "text") return "name";
      if (control.getAttribute("role") === "switch") return "switch";
      return "publish";
    });
    const collapsed = kinds.filter((kind, index) => kind !== kinds[index - 1]);

    expect(collapsed).toEqual([
      "tab",
      "revert",
      "toggle",
      "revert",
      "name",
      "switch",
      "publish",
    ]);
    const groupHeader = kinds.indexOf("toggle");
    expect(
      kinds[groupHeader + 1],
      "a bulk row's arrow follows its toggle",
    ).toBe("revert");
  });
});
