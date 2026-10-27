// @vitest-environment happy-dom
//
// One published version, read-only (frames D8B, D8C): what it changed against the version before it, and the restore that puts
// its prices into "De publicat". A restore adds to the pending list and never publishes, so the active version and the
// clients' prices are where they were.
import {
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishClient } from "@/price-dashboard/publish-client";
import {
  makeSamplePublishClient,
  sampleVersionIdOf,
} from "@/price-dashboard/publish-sample-client";
import type { VersionDetailInput } from "@/price-dashboard/publish-model";
import { sampleVersionDetail } from "@/price-dashboard/publish-sample";
import { VersionDetailScreen } from "@/price-dashboard/version-detail";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const COPY = roMessages.priceDashboard;
const MENU: Parameters<typeof contextOf>[1] = [
  "kitchens",
  "cabinets",
  "publish",
];
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

function detailOf(sequenceNumber: number): VersionDetailInput {
  const found = sampleVersionDetail(sampleVersionIdOf(sequenceNumber));
  if (found === undefined) throw new Error("the sample holds no such version");
  return found;
}

/** The sample's third version read against an empty draft: restoring it differs from the active book in one price. */
function thirdVersionWithNothingPending(): VersionDetailInput {
  return {
    ...detailOf(3),
    draft: { draftRevision: "1", changes: [] },
  };
}

type Spied = {
  [Method in keyof PublishClient]: ReturnType<
    typeof vi.fn<PublishClient[Method]>
  >;
};

function spiedClient(
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
  options: { locale?: TestLocale; client?: PublishClient } = {},
): Promise<HTMLElement> {
  const { locale = "ro", client = spiedClient(input) } = options;
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

async function settle(): Promise<void> {
  await act(async () => {
    await flushPromises(5);
  });
}

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="alertdialog"]');

const requireDialog = (): HTMLElement => {
  const found = dialog();
  if (found === null) throw new Error("no dialog is open");
  return found;
};

const restoreButton = (container: HTMLElement): HTMLButtonElement =>
  byWords<HTMLButtonElement>(
    container,
    "button",
    roCopy("priceDashboard.history.restoreAction", { versionId: "3" }),
  );

describe("an archived version (D8B)", () => {
  it("names the version, says it is archived and read-only, and says what it changed against the one before", async () => {
    const container = await mountDetail(detailOf(3));

    const heading = requireIn(container, "h1");
    expect(heading.textContent).toContain("Scumpire MDF");
    expect(heading.textContent).toContain(COPY.history.stateArchivedReadOnly);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.history.detailSubtitle", {
        date: "06.10.2026",
        count: 2,
        previousId: "2",
      }),
    );
  });

  it("draws the changes under the two versions' own numbers, with no arrow to take one back", async () => {
    const container = await mountDetail(detailOf(3));

    const heads = allIn(
      container,
      '[data-testid="diff-table"] [aria-hidden="true"] span',
    )
      .map((cell) => cell.textContent)
      .filter((words) => words !== "");
    expect(heads).toEqual([
      COPY.publish.columnChange,
      roCopy("priceDashboard.history.columnInVersion", { versionId: "2" }),
      roCopy("priceDashboard.history.columnInVersion", { versionId: "3" }),
      COPY.publish.columnDifference,
    ]);
    expect(
      allIn(container, '[data-testid="diff-row"]').length,
    ).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="diff-revert"]')).toBeNull();
  });

  it("calls a depth rule that the version before it did not have a new rule, and its old side a dash", async () => {
    const input: VersionDetailInput = {
      ...detailOf(2),
      predecessor: { sequenceNumber: 1, book: SAMPLE_PRICE_BOOK },
    };

    const container = await mountDetail(input);

    const depth = allIn(container, '[data-testid="diff-row"]').find((row) =>
      row.textContent.includes(COPY.rule.isNew),
    );
    expect(depth).toBeDefined();
    expect(depth?.textContent).toContain(
      COPY.rule.deepKitchenLabel.split("(")[0]?.trim(),
    );
    const [before, after] = allIn(depth ?? container, '[class*="cellValue"]');
    expect([before?.textContent, after?.textContent]).toEqual([
      roMessages.staffKitchens.noValue,
      roCopy("priceDashboard.common.percentPlus", { percent: "15" }),
    ]);
  });

  it("says the first version has nothing to be compared with, and draws no table", async () => {
    const container = await mountDetail(detailOf(1));

    expect(container.textContent).toContain(COPY.history.firstVersion);
    expect(container.querySelector('[data-testid="diff-table"]')).toBeNull();
  });

  it("offers no restore of the version that is active", async () => {
    const container = await mountDetail(detailOf(4));

    expect(requireIn(container, "h1").textContent).toContain(
      COPY.history.stateActive,
    );
    expect(
      allIn(container, "button").some((button) =>
        button.textContent.includes(
          roCopy("priceDashboard.history.restoreAction", { versionId: "4" }),
        ),
      ),
    ).toBe(false);
  });

  it("is told in Russian too", async () => {
    const container = await mountDetail(detailOf(3), { locale: "ru" });

    expect(container.textContent).toContain(
      ruMessages.priceDashboard.history.stateArchivedReadOnly,
    );
    expect(container.textContent).toContain(
      ruMessages.priceDashboard.history.restoreHeading,
    );
  });
});

describe("restoring a version's prices (D8C)", () => {
  it("asks first, in a dialog that opens on its cancel button and counts the prices that differ", async () => {
    const input = thirdVersionWithNothingPending();
    const client = spiedClient(input);
    const container = await mountDetail(input, { client });

    click(restoreButton(container));

    const open = requireDialog();
    expect(document.activeElement).toBe(
      byWords(open, "button", COPY.common.cancel),
    );
    expect(open.textContent).toContain(
      roCopy("priceDashboard.history.restoreDialogBody", { count: 1 }),
    );
    expect(open.closest("main")).not.toBeNull();
    expect(client.restore).not.toHaveBeenCalled();
  });

  it("closes on Escape and sends nothing", async () => {
    const input = thirdVersionWithNothingPending();
    const client = spiedClient(input);
    const container = await mountDetail(input, { client });
    click(restoreButton(container));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(dialog()).toBeNull();
    expect(client.restore).not.toHaveBeenCalled();
  });

  it("puts the prices into the draft with the displayed revision, and publishes nothing", async () => {
    const input = thirdVersionWithNothingPending();
    const client = spiedClient(input);
    const container = await mountDetail(input, { client });
    expect(container.querySelector(PENDING_CHIP)).toBeNull();
    expect(requireIn(container, ALL_PUBLISHED)).toBeDefined();
    click(restoreButton(container));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(client.restore).toHaveBeenCalledTimes(1);
    expect(client.restore.mock.calls[0]).toEqual([
      input.version.versionId,
      { expectedDraftRevision: "1" },
    ]);
    expect(client.publish).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
    expect(
      requireIn(container, '[data-testid="restore-notice"]').textContent,
    ).toContain(COPY.history.restoredNotice);
    expect(requireIn(container, PENDING_CHIP).textContent).toContain(
      roCopy("priceDashboard.nav.pendingChip", { count: 1 }),
    );
    expect(requireIn(container, "h1").textContent).toContain("Scumpire MDF");
  });

  it("keeps the dialog and says nothing was saved when the client fails", async () => {
    const input = thirdVersionWithNothingPending();
    const client = spiedClient(input, {
      restore: () => Promise.resolve({ kind: "failed" }),
    });
    const container = await mountDetail(input, { client });
    click(restoreButton(container));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(requireDialog().textContent).toContain(COPY.errors.saveFailed);
    expect(
      container.querySelector('[data-testid="restore-notice"]'),
    ).toBeNull();
    expect(container.querySelector(PENDING_CHIP)).toBeNull();
  });

  it("says the data changed when the draft moved since the page read it", async () => {
    const input = thirdVersionWithNothingPending();
    const client = spiedClient(input, {
      restore: () => Promise.resolve({ kind: "conflict" }),
    });
    const container = await mountDetail(input, { client });
    click(restoreButton(container));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(requireDialog().textContent).toContain(COPY.errors.changedMeanwhile);
  });

  it("is off, with the reason, when the version holds nothing that differs from what would be published", async () => {
    const input: VersionDetailInput = {
      ...thirdVersionWithNothingPending(),
      version: {
        ...thirdVersionWithNothingPending().version,
        book: thirdVersionWithNothingPending().active.book,
      },
    };
    const container = await mountDetail(input);

    click(restoreButton(container));

    expect(restoreButton(container).getAttribute("aria-disabled")).toBe("true");
    expect(dialog()).toBeNull();
    expect(container.textContent).toContain(
      roCopy("priceDashboard.history.nothingToRestore", { versionId: "3" }),
    );
  });
});

describe("a client that rejects, and focus after a press that did not focus the button", () => {
  it("is told as a failed restore in the dialog, which stays", async () => {
    const input = thirdVersionWithNothingPending();
    const client = spiedClient(input, {
      restore: () => Promise.reject(new Error("the network dropped")),
    });
    const container = await mountDetail(input, { client });
    click(restoreButton(container));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(requireDialog().textContent).toContain(COPY.errors.saveFailed);
    expect(
      byWords(requireDialog(), "button", COPY.common.addToPending).getAttribute(
        "aria-busy",
      ),
    ).toBeNull();
  });

  it("returns to the restore button when the dialog is dismissed", async () => {
    const input = thirdVersionWithNothingPending();
    const container = await mountDetail(input);
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
    click(restoreButton(container));

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(restoreButton(container));
  });
});

describe("a restore of a version the store no longer holds", () => {
  it("says so in the dialog, which stays, and adds nothing", async () => {
    const input = thirdVersionWithNothingPending();
    const client = spiedClient(input, {
      restore: () => Promise.resolve({ kind: "version-not-found" }),
    });
    const container = await mountDetail(input, { client });
    click(restoreButton(container));

    click(byWords(requireDialog(), "button", COPY.common.addToPending));
    await settle();

    expect(requireDialog().textContent).toContain(COPY.history.versionNotFound);
    expect(requireDialog().textContent).not.toContain(COPY.errors.saveFailed);
    expect(
      container.querySelector('[data-testid="restore-notice"]'),
    ).toBeNull();
  });
});

describe("what a restore says it does with what is already pending", () => {
  const PENDING_ON_A_STATED_FIELD: DraftChange = {
    address: {
      kind: "cabinet",
      ruleId: "cabinet.base-cabinet",
      field: "anchorMinor",
    },
    value: 999_000,
  };

  it("says on the page that the archived prices replace pending ones on the same prices and that the rest stay", async () => {
    const container = await mountDetail(thirdVersionWithNothingPending());

    expect(container.textContent).toContain(
      roCopy("priceDashboard.history.restoreBody", { versionId: "3" }),
    );
    /* eslint-disable no-restricted-syntax -- a claim about the wording: the page says "replace" and no longer says "added beside". */
    expect(COPY.history.restoreBody).toContain("înlocuiesc");
    expect(COPY.history.restoreBody).not.toContain("lângă ce ai pregătit");
    /* eslint-enable no-restricted-syntax */
  });

  it("counts, in the dialog, the pending prices it will replace", async () => {
    const input: VersionDetailInput = {
      ...thirdVersionWithNothingPending(),
      draft: { draftRevision: "1", changes: [PENDING_ON_A_STATED_FIELD] },
    };
    const container = await mountDetail(input);

    click(restoreButton(container));

    expect(requireDialog().textContent).toContain(
      roCopy("priceDashboard.history.restoreReplaces", { count: 1 }),
    );
  });

  it("leaves the sentence out when nothing pending is replaced", async () => {
    const container = await mountDetail(thirdVersionWithNothingPending());

    click(restoreButton(container));

    expect(requireDialog().textContent).not.toContain(
      roCopy("priceDashboard.history.restoreReplaces", { count: 0 }),
    );
    expect(requireDialog().querySelector('[role="status"]')).toBeNull();
  });
});
