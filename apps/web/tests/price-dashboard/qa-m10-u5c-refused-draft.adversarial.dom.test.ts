// @vitest-environment happy-dom
//
// A draft the book no longer takes, taken back one change at a time: each revert asks for exactly the change it is on,
// the line that cannot be applied stays until it is itself taken back, the last change out leaves the empty page, and a
// revert that is refused leaves every line where it was.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import type { PublishClient } from "@/price-dashboard/publish-client";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";

import { allIn, click, requireIn } from "../support/render-with-intl";
import {
  deferred,
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const price = (ruleId: string, value: number, extra: object = {}) =>
  ({
    address: { kind: "cabinet", ruleId, field: "anchorMinor" },
    value,
    ...extra,
  }) as DraftChange;
const VALID = price("cabinet.base-cabinet", 400_000);
const STALE = price("cabinet.gone", 5_000);
const OTHER_VALID = price("cabinet.wall-cabinet", 300_000);
const IN_GROUP = { groupId: "group-1", bulk: { percent: 5, scope: "all" } };
const GROUP_VALID = price("cabinet.base-cabinet", 400_000, IN_GROUP);
const GROUP_STALE = price("cabinet.gone", 5_000, IN_GROUP);

const LIST = '[data-testid="publish-stale-changes"]';
const REVERT = '[data-testid="diff-revert"]';
const EMPTY = '[data-testid="publish-empty"]';

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
  resetStaffSessionExpiryForTests();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
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

const isRefusedPerLine = (container: HTMLElement): string[] =>
  lines(container).map((line) => line.dataset.refused ?? "");

const draftOf = (draftRevision: string, changes: readonly DraftChange[]) =>
  Promise.resolve({
    kind: "changed",
    draft: { draftRevision, changes },
  } as const);

describe("taking back the valid change of a refused draft", () => {
  it("leaves the refused change as the only line, still marked as the one that cannot be applied", async () => {
    const { container } = await mountRefused([VALID, STALE], {
      revert: () => draftOf("8", [STALE]),
    });
    expect(isRefusedPerLine(container)).toEqual(["false", "true"]);

    click(requireIn(lineAt(container, 0), REVERT));
    await settle();

    expect(isRefusedPerLine(container)).toEqual(["true"]);
  });

  it("marks the refused change by what refused it when the change before it goes, and not by the place it held", async () => {
    const { container } = await mountRefused([STALE, VALID, OTHER_VALID], {
      revert: () => draftOf("8", [STALE, OTHER_VALID]),
    });
    expect(isRefusedPerLine(container)).toEqual(["true", "false", "false"]);

    click(requireIn(lineAt(container, 1), REVERT));
    await settle();

    expect(isRefusedPerLine(container)).toEqual(["true", "false"]);
  });

  it("leaves the empty page, and a publish nowhere to go, when the last change is the one taken back", async () => {
    const { container } = await mountRefused([STALE], {
      revert: () => draftOf("8", []),
    });

    click(requireIn(lineAt(container, 0), REVERT));
    await settle();

    expect(container.querySelector(LIST)).toBeNull();
    expect(container.querySelector(EMPTY)).not.toBeNull();
    expect(container.querySelector('[class*="primary"]')).toBeNull();
  });
});

describe("a bulk action in a refused draft", () => {
  it("is one line, refused when any member is, and its ↺ takes the whole group in one request", async () => {
    const { container, client } = await mountRefused(
      [GROUP_VALID, GROUP_STALE, VALID],
      { revert: () => draftOf("8", [VALID]) },
    );

    expect(lines(container)).toHaveLength(2);
    expect(isRefusedPerLine(container)).toEqual(["true", "false"]);
    click(requireIn(lineAt(container, 0), REVERT));
    await settle();

    expect(client.revert).toHaveBeenCalledTimes(1);
    expect(client.revert.mock.calls[0]?.[0]).toStrictEqual({
      expectedDraftRevision: "7",
      target: { kind: "group", groupId: "group-1" },
    });
    expect(container.querySelector(LIST)).toBeNull();
  });
});

describe("a take-back that is not made", () => {
  it("keeps every line, tells the data moved, and sends no second request while the first is out", async () => {
    const pending = deferred<Awaited<ReturnType<PublishClient["revert"]>>>();
    const { container, client } = await mountRefused([VALID, STALE], {
      revert: () => pending.promise,
    });

    click(requireIn(lineAt(container, 0), REVERT));
    click(requireIn(lineAt(container, 1), REVERT));

    expect(client.revert).toHaveBeenCalledTimes(1);
    pending.resolve({ kind: "conflict" });
    await settle();
    expect(lines(container)).toHaveLength(2);
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(roCopy("priceDashboard.errors.changedMeanwhile"));
  });

  it("keeps every line and says the take-back was not saved when the request fails", async () => {
    const { container } = await mountRefused([VALID, STALE], {
      revert: () => Promise.resolve({ kind: "failed" }),
    });

    click(requireIn(lineAt(container, 0), REVERT));
    await settle();

    expect(lines(container)).toHaveLength(2);
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(roCopy("priceDashboard.errors.saveFailed"));
  });

  it("raises the staff frame's sheet when the session ended, and keeps every line", async () => {
    const { container } = await mountRefused([VALID, STALE], {
      revert: () => Promise.resolve({ kind: "session-ended" }),
    });

    click(requireIn(lineAt(container, 0), REVERT));
    await settle();

    expect(getStaffSessionExpiry()).not.toBeUndefined();
    expect(lines(container)).toHaveLength(2);
  });
});
