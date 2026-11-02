// @vitest-environment happy-dom
//
// Adversarial QA of "Renunță la ciornă": what the focus does when the button that opened the question is gone, and
// whether the question can be put again when asking again cannot succeed.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type {
  DiscardOutcome,
  PublishClient,
} from "@/price-dashboard/publish-client";
import { PublishDraftUnreadableScreen } from "@/price-dashboard/publish-unreadable";

import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import {
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

const DISCARD_ACTION = roCopy("priceDashboard.publish.discardAction");
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
      draftRevision: "rev-9",
      client,
    }),
    "ro",
  );
  await settle();
  return { container: mountedScreen.container, client };
}

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

async function openQuestion(container: HTMLElement): Promise<void> {
  click(byWords(container, "button", DISCARD_ACTION));
  await settle();
}

async function confirmDiscard(): Promise<void> {
  click(byWords(requireDialog(), "button", DISCARD_ACTION));
  await settle();
}

describe("where focus goes when the discard went through", () => {
  it("stays on the unreadable page, not on the body, once the dialog and the button are gone", async () => {
    const { container } = await mountUnreadable();
    await openQuestion(container);

    await confirmDiscard();

    expect(dialog()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it("stays on the page when a stale draft was given up and the empty page took its place", async () => {
    const { container } = await mountStale();
    await openQuestion(container);

    await confirmDiscard();

    expect(dialog()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(container.contains(document.activeElement)).toBe(true);
  });
});

describe("a discard the draft has moved under", () => {
  it("is not offered again at the same revision on the unreadable page, which has no way to learn a new one", async () => {
    const { container, client } = await mountUnreadable({
      discardDraft: () => Promise.resolve({ kind: "conflict" }),
    });
    await openQuestion(container);
    await confirmDiscard();

    const dialogStillOffersIt = dialog() !== null;
    if (dialogStillOffersIt) await confirmDiscard();

    const revisions = client.discardDraft.mock.calls.map(
      ([request]) => request.expectedDraftRevision,
    );
    expect(
      new Set(revisions).size,
      `the same revision was sent ${String(revisions.length)} times: ${revisions.join(", ")}`,
    ).toBe(revisions.length);
  });

  it("is not offered at the old revision on the desk when the read that should have renewed it failed", async () => {
    const { container, client } = await mountStale({
      discardDraft: () => Promise.resolve({ kind: "conflict" }),
      readState: () => Promise.resolve(undefined),
    });
    await openQuestion(container);
    await confirmDiscard();

    if (dialog() !== null) await confirmDiscard();

    const revisions = client.discardDraft.mock.calls.map(
      ([request]) => request.expectedDraftRevision,
    );
    expect(
      new Set(revisions).size,
      `the same revision was sent ${String(revisions.length)} times`,
    ).toBe(revisions.length);
  });

  it("does not leave the question open over a draft that is now a list the person has not seen", async () => {
    const healthy = inputWithDraft(
      inputWithDraft([]).state.draft.changes,
      "8",
    ).state;
    const { container, client } = await mountStale({
      discardDraft: () => Promise.resolve({ kind: "conflict" }),
      readState: () =>
        Promise.resolve({
          ...healthy,
          draft: {
            draftRevision: "8",
            changes: [
              {
                address: {
                  kind: "cabinet",
                  ruleId: "cabinet.base-cabinet",
                  field: "anchorMinor",
                },
                value: 90_000,
              } as DraftChange,
            ],
          },
        }),
    });
    await openQuestion(container);
    await confirmDiscard();

    expect(dialog(), "the question is still open over the list").toBeNull();
    expect(
      allIn(container, '[data-testid="diff-row"]').length,
      "the person is left looking at the list",
    ).toBeGreaterThan(0);
    expect(
      client.discardDraft.mock.calls.map(([request]) => request),
      "a confirm discarded revision 8, which the person never saw",
    ).toHaveLength(1);
  });
});
