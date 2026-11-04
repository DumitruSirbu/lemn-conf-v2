// @vitest-environment happy-dom
//
// A draft that no longer makes a book (a rule tightened after its changes were stored) lists every change with its own
// ↺, so the valid change beside a refused one is not lost to giving the whole draft up. A line the revert route does not
// take is told so, and the discard of everything stays beside the list.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type { PublishClient } from "@/price-dashboard/publish-client";
import { isolated } from "@/staff/bidi-isolate";

import { allIn, byWords, click, requireIn } from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { createTierChanges } from "./publish-structural-rows.support";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const VALID = {
  address: {
    kind: "cabinet",
    ruleId: "cabinet.base-cabinet",
    field: "anchorMinor",
  },
  value: 400_000,
} as DraftChange;
const STALE = {
  address: { kind: "cabinet", ruleId: "cabinet.gone", field: "anchorMinor" },
  value: 5_000,
} as DraftChange;
const DELETION = {
  address: {
    kind: "item-deleted",
    item: { kind: "hardware", tierId: "hardware.soft-close" },
  },
  value: true,
} as DraftChange;

const LIST = '[data-testid="publish-stale-changes"]';
const REVERT = '[data-testid="diff-revert"]';

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

async function mountRefused(
  changes: readonly DraftChange[],
  replace: Partial<PublishClient> = {},
): Promise<MountedDesk> {
  const input = inputWithDraft(changes, "7");
  mounted = await mountDesk({
    input,
    client: spiedPublishClient(input, replace),
  });
  return mounted;
}

const lines = (container: HTMLElement): HTMLElement[] =>
  allIn(requireIn(container, LIST), "li");

function lineAt(container: HTMLElement, position: number): HTMLElement {
  const line = lines(container)[position];
  if (line === undefined) throw new Error(`no line at ${String(position)}`);
  return line;
}

describe("a refused draft that also holds a valid change", () => {
  it("lists the valid change and the refused one, each with its own ↺, and says which cannot be applied", async () => {
    const { container } = await mountRefused([VALID, STALE]);

    const shown = lines(container);
    expect(shown).toHaveLength(2);
    expect(shown.map((line) => allIn(line, REVERT).length)).toEqual([1, 1]);
    expect(shown[0]?.dataset.refused).toBe("false");
    expect(shown[1]?.dataset.refused).toBe("true");
    expect(shown[1]?.textContent).toContain(
      roCopy("priceDashboard.publish.refusalChange", {
        name: isolated("cabinet.gone"),
      }),
    );
    expect(container.querySelector('[class*="primary"]')).toBeNull();
  });

  it("takes back the valid change alone, sending its address at the revision the page holds", async () => {
    const { container, client } = await mountRefused([VALID, STALE], {
      revert: () =>
        Promise.resolve({
          kind: "changed",
          draft: { draftRevision: "8", changes: [STALE] },
        }),
    });

    click(requireIn(lineAt(container, 0), REVERT));
    await settle();

    expect(client.revert).toHaveBeenCalledTimes(1);
    expect(client.revert.mock.calls[0]?.[0]).toStrictEqual({
      expectedDraftRevision: "7",
      target: { kind: "change", address: VALID.address },
    });
    expect(lines(container)).toHaveLength(1);
    expect(client.discardDraft).not.toHaveBeenCalled();
  });

  it("draws the page again, ready to publish, once the refused change is taken back too", async () => {
    const { container } = await mountRefused([VALID, STALE], {
      revert: () =>
        Promise.resolve({
          kind: "changed",
          draft: { draftRevision: "8", changes: [VALID] },
        }),
    });

    click(requireIn(lineAt(container, 1), REVERT));
    await settle();

    expect(container.querySelector(LIST)).toBeNull();
    expect(
      requireIn(container, '[class*="primary"]').isConnected,
      "the publish button is back",
    ).toBe(true);
  });

  it("keeps offering the discard of everything beside the list", async () => {
    const { container } = await mountRefused([VALID, STALE]);

    expect(
      byWords(
        container,
        "button",
        roCopy("priceDashboard.publish.discardAction"),
      ).isConnected,
    ).toBe(true);
  });
});

describe("a refused draft with a change the revert route does not take", () => {
  it("offers no ↺ on a deletion, says only the whole draft gives it up, and still reverts the change beside it", async () => {
    const { container } = await mountRefused([DELETION, STALE]);

    const deletion = lineAt(container, 0);
    expect(allIn(deletion, REVERT)).toHaveLength(0);
    expect(deletion.textContent).toContain(
      roCopy("priceDashboard.publish.staleChangeWholeDraftOnly", {
        name: isolated("Hettich"),
      }),
    );
    expect(allIn(lineAt(container, 1), REVERT)).toHaveLength(1);
  });
});

describe("a refused draft beside a class the draft created", () => {
  it("draws the class and its rates as one line without a ↺, so no press can take the class away by one of its rates", async () => {
    const { container } = await mountRefused([...createTierChanges(), STALE]);

    expect(createTierChanges().length).toBeGreaterThan(2);
    expect(lines(container)).toHaveLength(2);
    expect(allIn(container, REVERT)).toHaveLength(1);
    expect(lineAt(container, 0).textContent).toContain(
      roCopy("priceDashboard.publish.staleChangeWholeDraftOnly", {
        name: isolated("Economic"),
      }),
    );
  });
});

describe("a refused draft whose whole book is refused", () => {
  it("says no change is the one to blame, lists none and offers no ↺, only the discard of everything", async () => {
    const input = inputWithDraft([VALID], "7");
    const wholeBookRefused = {
      ...input,
      state: {
        ...input.state,
        active: {
          ...input.state.active,
          book: { ...input.state.active.book, currency: "EUR" },
        },
      },
    } as unknown as typeof input;
    mounted = await mountDesk({
      input: wholeBookRefused,
      client: spiedPublishClient(wholeBookRefused),
    });
    const { container } = mounted;

    expect(container.textContent).toContain(
      roCopy("priceDashboard.publish.staleDraftWholeBook"),
    );
    expect(container.querySelector(LIST)).toBeNull();
    expect(allIn(container, REVERT)).toHaveLength(0);
    expect(
      byWords(
        container,
        "button",
        roCopy("priceDashboard.publish.discardAction"),
      ).isConnected,
    ).toBe(true);
  });
});

describe("a take-back the catalogue would refuse", () => {
  it("says nothing was changed and that trying again cannot help, not that the save failed", async () => {
    const { container } = await mountRefused([VALID, STALE], {
      revert: () => Promise.resolve({ kind: "candidate-refused" }),
    });

    click(requireIn(lineAt(container, 0), REVERT));
    await settle();

    const notice = requireIn(container, '[data-testid="publish-notice"]');
    expect(notice.textContent).toContain(
      roCopy("priceDashboard.publish.writeCandidateRefused"),
    );
    expect(notice.textContent).not.toContain(
      roCopy("priceDashboard.errors.saveFailed"),
    );
    expect(lines(container)).toHaveLength(2);
  });
});
