// @vitest-environment happy-dom
//
// R4c3 on the screens: a linked accessory's Delete is offered in a production build and counts the saved kitchens before
// anything is confirmed; the publish page's row of a deleted class and the stale-draft list's line of one each press a ↺
// that sends the deletion's own address to the revert route.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { AccessoryListScreen } from "@/price-dashboard/accessory-list";
import type { PublishPageInput } from "@/price-dashboard/publish-model";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import { SAMPLE_PUBLISH_PAGE } from "../support/publish-sample";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  accessoryItem,
  accessoryPageOf,
  bookWithLinked,
  menuEntry,
  openMenuOf,
  PUBLISHED,
  PUBLISHED_RULE,
} from "./accessory-harness";
import { dialogButton, openDialog, press } from "./hardware-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";
import { stubTheLifecycleServer } from "./lifecycle-server-harness";
import {
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { ACTIVE, change } from "./publish-structural-rows.support";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const DELETE = roCopy("priceDashboard.common.delete");
const PLANTED_DESIGNS = 7;
const REVERT = '[data-testid="diff-revert"]';
const DELETION = change(
  {
    kind: "item-deleted",
    item: { kind: "hardware", tierId: "hardware.soft-close" },
  },
  true,
);
const STALE = {
  address: { kind: "cabinet", ruleId: "cabinet.gone", field: "anchorMinor" },
  value: 5_000,
} as DraftChange;

let screen: MountedScreen | undefined;
let desk: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  screen?.unmount();
  desk?.unmount();
  screen = undefined;
  desk = undefined;
  resetStaffSessionExpiryForTests();
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

describe("a linked accessory's Delete in a production build with the saved defaults read", () => {
  async function mountListOver(plantedDesigns: number) {
    vi.stubEnv("NODE_ENV", "production");
    const server = stubTheLifecycleServer({
      availability: { revision: "1", disabled: [] },
      usage: [{ item: accessoryItem(PUBLISHED), designCount: plantedDesigns }],
      book: bookWithLinked([PUBLISHED_RULE]),
    });
    const page = {
      ...accessoryPageOf({ linked: [PUBLISHED_RULE] }),
      sampleUsage: undefined,
    };
    screen = mountInCatalogue(
      createElement(AccessoryListScreen, {
        locale: "ro",
        context: contextOf("administrator", [
          "kitchens",
          "accessories",
          "publish",
        ]),
        page,
        client: inMemoryPriceDraftClient(page.state).client,
      }),
      "ro",
    );
    await flushPromises(5);
    return { container: screen.container, server };
  }

  it("is offered, counts the saved kitchens first, and says the block when some use it", async () => {
    const { container, server } = await mountListOver(PLANTED_DESIGNS);

    await openMenuOf(container, PUBLISHED, PUBLISHED_RULE.name);
    const entry = menuEntry(container, PUBLISHED, DELETE);
    await press(entry);

    expect(entry.getAttribute("aria-disabled")).toBeNull();
    expect(server.usageRequests).toEqual([[accessoryItem(PUBLISHED)]]);
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.deleteBlockedAccessoryBody", {
        name: PUBLISHED_RULE.name,
        count: PLANTED_DESIGNS,
      }),
    );
  });

  it("opens the confirmation where no saved kitchen uses it, which says no number of its own", async () => {
    const { container, server } = await mountListOver(0);

    await openMenuOf(container, PUBLISHED, PUBLISHED_RULE.name);
    await press(menuEntry(container, PUBLISHED, DELETE));

    expect(server.usageRequests).toHaveLength(1);
    const dialog = openDialog();
    expect(dialog).not.toBeNull();
    expect(dialog && dialogButton(dialog, DELETE)).toBeDefined();
  });
});

describe("a deletion in the draft, on the publish page", () => {
  function inputDeleting(changes: readonly DraftChange[]): PublishPageInput {
    const base = inputWithDraft(changes, "7");
    return {
      ...base,
      state: { ...base.state, active: { ...base.state.active, book: ACTIVE } },
      cabinetNames: SAMPLE_PUBLISH_PAGE.cabinetNames,
    };
  }

  it("is taken back by D7's row with a ↺ that sends the deletion's own address", async () => {
    const input = inputDeleting([DELETION]);
    desk = await mountDesk({ input, client: spiedPublishClient(input) });
    const row = requireIn(
      desk.container,
      '[data-testid="diff-row"][data-row-kind="hardware-deleted"]',
    );

    click(requireIn(row, REVERT));
    await settle();

    expect(desk.client.revert).toHaveBeenCalledTimes(1);
    expect(desk.client.revert.mock.calls[0]?.[0]).toStrictEqual({
      expectedDraftRevision: "7",
      target: { kind: "change", address: DELETION.address },
    });
  });

  it("is taken back by the stale list's line of a draft that no longer makes a book, with the same address", async () => {
    const input = inputWithDraft([DELETION, STALE], "7");
    desk = await mountDesk({ input, client: spiedPublishClient(input) });
    const line = allIn(
      requireIn(desk.container, '[data-testid="publish-stale-changes"]'),
      "li",
    )[0];
    if (line === undefined) throw new Error("no stale line");

    expect(allIn(line, REVERT)).toHaveLength(1);
    click(requireIn(line, REVERT));
    await settle();

    expect(desk.client.revert.mock.calls[0]?.[0]).toStrictEqual({
      expectedDraftRevision: "7",
      target: { kind: "change", address: DELETION.address },
    });
  });
});
