// @vitest-environment happy-dom
//
// "Renunță la ciornă": the one write that works on a draft the page cannot read (`409 draft-unreadable`) and the way out
// of a draft whose changes no longer make a book. It discards everything, so it is asked first, opens on "Anulează", and
// sends exactly `{expectedDraftRevision, scope: "all"}` at the revision the page was told.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type {
  DiscardOutcome,
  PublishClient,
} from "@/price-dashboard/publish-client";
import { PublishDraftUnreadableScreen } from "@/price-dashboard/publish-unreadable";
import { publishPathOf } from "@/price-dashboard/publish-paths";

import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  deferred,
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
  type SpiedPublishClient,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const REVISION_READ = "rev-9";
const DISCARD_ACTION = roCopy("priceDashboard.publish.discardAction");
const CANCEL = roCopy("priceDashboard.common.cancel");
const PENDING_CHIP = '[data-testid="staff-pending-prices"]';
const ALL_PUBLISHED = '[data-testid="staff-all-published"]';
const NEGATIVE_ANCHOR = {
  address: {
    kind: "cabinet",
    ruleId: "cabinet.base-cabinet",
    field: "anchorMinor",
  },
  value: -1,
} as DraftChange;

const DISCARDED: DiscardOutcome = {
  kind: "changed",
  draft: { draftRevision: "10", changes: [] },
};

let mountedDesk: MountedDesk | undefined;
let mountedScreen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mountedDesk?.unmount();
  mountedScreen?.unmount();
  mountedDesk = undefined;
  mountedScreen = undefined;
  leaveTheStaffServer();
});

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="alertdialog"]');

const requireDialog = (): HTMLElement => {
  const found = dialog();
  if (found === null) throw new Error("no dialog is open");
  return found;
};

function pressEscape(): void {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

async function mountUnreadable(
  replace: Partial<PublishClient> = {},
): Promise<{ container: HTMLElement; client: SpiedPublishClient }> {
  const client = spiedPublishClient(inputWithDraft([]), {
    discardDraft: () => Promise.resolve(DISCARDED),
    ...replace,
  });
  mountedScreen = mountInCatalogue(
    createElement(PublishDraftUnreadableScreen, {
      locale: "ro",
      context: contextOf("administrator", ["kitchens", "publish"]),
      draftRevision: REVISION_READ,
      client,
    }),
    "ro",
  );
  await settle();
  return { container: mountedScreen.container, client };
}

async function confirmDiscard(): Promise<void> {
  click(byWords(requireDialog(), "button", DISCARD_ACTION));
  await settle();
}

describe("the page for a draft that cannot be read", () => {
  it("says so, offers the one way out, and writes nothing on being drawn", async () => {
    const { container, client } = await mountUnreadable();

    expect(container.textContent).toContain(
      roCopy("priceDashboard.publish.unreadableTitle"),
    );
    expect(container.textContent).toContain(
      roCopy("priceDashboard.publish.unreadableBody"),
    );
    expect(byWords(container, "button", DISCARD_ACTION).isConnected).toBe(true);
    expect(dialog()).toBeNull();
    for (const call of Object.values(client))
      expect(call).not.toHaveBeenCalled();
  });

  it("reports no count of pending prices, since an unreadable draft is not an empty one", async () => {
    const { container } = await mountUnreadable();

    expect(container.querySelector(PENDING_CHIP)).toBeNull();
    expect(container.querySelector(ALL_PUBLISHED)).toBeNull();
  });
});

describe("asking before giving the draft up", () => {
  it("opens on the cancel button and sends nothing until the act is confirmed", async () => {
    const { container, client } = await mountUnreadable();

    click(byWords(container, "button", DISCARD_ACTION));
    await settle();

    const open = requireDialog();
    expect(open.textContent).toContain(
      roCopy("priceDashboard.publish.discardBody"),
    );
    expect(document.activeElement).toBe(byWords(open, "button", CANCEL));
    expect(client.discardDraft).not.toHaveBeenCalled();
  });

  it("closes on cancel and on Escape, sends nothing, and gives focus back to the button that asked", async () => {
    const { container, client } = await mountUnreadable();
    const asking = byWords(container, "button", DISCARD_ACTION);
    click(asking);
    await settle();
    click(byWords(requireDialog(), "button", CANCEL));
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(asking);

    click(asking);
    await settle();
    pressEscape();
    await settle();

    expect(dialog()).toBeNull();
    expect(client.discardDraft).not.toHaveBeenCalled();
  });

  it("sends exactly the revision the 409 named and the scope all, once", async () => {
    const { container, client } = await mountUnreadable();
    click(byWords(container, "button", DISCARD_ACTION));
    await settle();

    await confirmDiscard();

    expect(client.discardDraft).toHaveBeenCalledTimes(1);
    expect(client.discardDraft.mock.calls[0]?.[0]).toStrictEqual({
      expectedDraftRevision: REVISION_READ,
      scope: "all",
    });
  });

  it("is not left while the request is out, and is not sent twice", async () => {
    const answer = deferred<DiscardOutcome>();
    const { container, client } = await mountUnreadable({
      discardDraft: () => answer.promise,
    });
    click(byWords(container, "button", DISCARD_ACTION));
    await settle();
    await confirmDiscard();

    pressEscape();
    click(
      byWords(
        requireDialog(),
        "button",
        roCopy("priceDashboard.publish.discarding"),
      ),
    );
    await settle();

    expect(dialog()).not.toBeNull();
    expect(client.discardDraft).toHaveBeenCalledTimes(1);
    answer.resolve({ kind: "failed" });
    await settle();
  });
});

describe("what the page says after the answer", () => {
  it("says the draft is gone and links to the publish page, which is read afresh", async () => {
    const { container } = await mountUnreadable();
    click(byWords(container, "button", DISCARD_ACTION));
    await settle();

    await confirmDiscard();

    expect(dialog()).toBeNull();
    const resolved = requireIn(
      container,
      '[data-testid="publish-unreadable-resolved"]',
    );
    expect(resolved.textContent).toContain(
      roCopy("priceDashboard.publish.discardedBody"),
    );
    expect(requireIn(resolved, "a").getAttribute("href")).toBe(
      publishPathOf("ro"),
    );
    expect(
      allIn(container, "button").filter(
        (button) => button.textContent === DISCARD_ACTION,
      ),
      "nothing is left to discard",
    ).toEqual([]);
  });

  it.each([
    [
      "answered as failed",
      (): Promise<DiscardOutcome> => Promise.resolve({ kind: "failed" }),
    ],
    [
      "thrown by the client",
      (): Promise<DiscardOutcome> => Promise.reject(new Error("network")),
    ],
  ])(
    "keeps the question open, saying nothing was saved, when the write is %s, and asks again on a second press",
    async (_name, discardDraft) => {
      const { container, client } = await mountUnreadable({ discardDraft });
      click(byWords(container, "button", DISCARD_ACTION));
      await settle();

      await confirmDiscard();

      expect(requireDialog().textContent).toContain(
        roCopy("priceDashboard.errors.saveFailed"),
      );
      expect(
        container.querySelector('[data-testid="publish-unreadable-resolved"]'),
      ).toBeNull();
      await confirmDiscard();
      expect(client.discardDraft).toHaveBeenCalledTimes(2);
    },
  );

  it("says the draft changed meanwhile and links to the page, when the revision was stale", async () => {
    const { container } = await mountUnreadable({
      discardDraft: () => Promise.resolve({ kind: "conflict" }),
    });
    click(byWords(container, "button", DISCARD_ACTION));
    await settle();

    await confirmDiscard();

    expect(requireDialog().textContent).toContain(
      roCopy("priceDashboard.publish.discardChangedMeanwhile"),
    );
    const resolved = requireIn(
      container,
      '[data-testid="publish-unreadable-resolved"]',
    );
    expect(resolved.textContent).toContain(
      roCopy("priceDashboard.publish.discardChangedMeanwhile"),
    );
    expect(requireIn(resolved, "a").getAttribute("href")).toBe(
      publishPathOf("ro"),
    );
  });
});

describe("a draft whose changes no longer make a book", () => {
  async function mountStale(
    replace: Partial<PublishClient> = {},
    revision = "7",
  ): Promise<MountedDesk> {
    const input = inputWithDraft([NEGATIVE_ANCHOR], revision);
    mountedDesk = await mountDesk({
      input,
      client: spiedPublishClient(input, replace),
    });
    return mountedDesk;
  }

  it("says the list cannot be shown and offers to give the draft up, with no publish button", async () => {
    const { container } = await mountStale();

    expect(container.textContent).toContain(
      roCopy("priceDashboard.publish.staleDraftTitle"),
    );
    expect(byWords(container, "button", DISCARD_ACTION).isConnected).toBe(true);
    expect(container.querySelector('[class*="primary"]')).toBeNull();
  });

  it("asks first, and sends the desk's own revision with the scope all once confirmed", async () => {
    const { container, client } = await mountStale();
    click(byWords(container, "button", DISCARD_ACTION));
    await settle();
    expect(client.discardDraft).not.toHaveBeenCalled();
    click(byWords(requireDialog(), "button", CANCEL));
    await settle();
    expect(client.discardDraft).not.toHaveBeenCalled();

    click(byWords(container, "button", DISCARD_ACTION));
    await settle();
    await confirmDiscard();

    expect(client.discardDraft.mock.calls[0]?.[0]).toStrictEqual({
      expectedDraftRevision: "7",
      scope: "all",
    });
  });

  it("then draws the empty page, says the draft is gone, and the frame counts nothing pending", async () => {
    const { container } = await mountStale();
    click(byWords(container, "button", DISCARD_ACTION));
    await settle();

    await confirmDiscard();

    expect(dialog()).toBeNull();
    expect(
      requireIn(container, '[data-testid="publish-empty"]').isConnected,
    ).toBe(true);
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(roCopy("priceDashboard.publish.discardedBody"));
    expect(requireIn(container, ALL_PUBLISHED).isConnected).toBe(true);
  });

  it("reads the state again on a stale revision and then discards at the revision it found", async () => {
    const { container, client } = await mountStale({
      discardDraft: (request) =>
        Promise.resolve(
          request.expectedDraftRevision === "7"
            ? { kind: "conflict" }
            : { kind: "changed", draft: { draftRevision: "9", changes: [] } },
        ),
      readState: () =>
        Promise.resolve({
          ...inputWithDraft([NEGATIVE_ANCHOR], "8").state,
        }),
    });
    click(byWords(container, "button", DISCARD_ACTION));
    await settle();
    await confirmDiscard();
    expect(requireDialog().textContent).toContain(
      roCopy("priceDashboard.publish.discardChangedMeanwhile"),
    );
    expect(client.readState).toHaveBeenCalledTimes(1);

    await confirmDiscard();

    expect(client.discardDraft.mock.calls.map((call) => call[0])).toStrictEqual(
      [
        { expectedDraftRevision: "7", scope: "all" },
        { expectedDraftRevision: "8", scope: "all" },
      ],
    );
  });
});
