// @vitest-environment happy-dom
//
// A linked accessory's switch-off in a production build, once the saved defaults are readable (R4b2): the dialog says how
// many saved kitchens use it, as the server counted them over planted designs, and the confirmation switches it through
// the availability route. The built-ins were pressed before (R4a5); the linked accessory, the one a person creates, was not.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccessoryListScreen } from "@/price-dashboard/accessory-list";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { flushPromises } from "../support/render-hook";
import {
  mountInCatalogue,
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
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const DELETE = roCopy("priceDashboard.common.delete");
const DEACTIVATE_CONFIRM = roCopy("priceDashboard.lifecycle.deactivateConfirm");
const PLANTED_DESIGNS = 7;

let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  resetStaffSessionExpiryForTests();
  vi.unstubAllEnvs();
  leaveTheStaffServer();
});

async function mountLinkedAccessoryList(plantedDesigns: number): Promise<{
  container: HTMLElement;
  server: ReturnType<typeof stubTheLifecycleServer>;
}> {
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

describe("a linked accessory's switch-off in a production build with the saved defaults read", () => {
  it("counts the accessory by what the server says and shows the non-zero count in the dialog", async () => {
    const { container, server } =
      await mountLinkedAccessoryList(PLANTED_DESIGNS);

    await openMenuOf(container, PUBLISHED, PUBLISHED_RULE.name);
    await press(menuEntry(container, PUBLISHED, DEACTIVATE));

    expect(server.usageRequests).toEqual([[accessoryItem(PUBLISHED)]]);
    expect(openDialog()?.textContent).toContain(
      roCopy("priceDashboard.lifecycle.usedByAccessory", {
        count: PLANTED_DESIGNS,
      }),
    );
  });

  it("switches the accessory off through the availability route once confirmed, naming the item", async () => {
    const { container, server } =
      await mountLinkedAccessoryList(PLANTED_DESIGNS);
    await openMenuOf(container, PUBLISHED, PUBLISHED_RULE.name);
    await press(menuEntry(container, PUBLISHED, DEACTIVATE));
    const dialog = openDialog();
    if (dialog === null) throw new Error("no dialog is open");

    await press(dialogButton(dialog, DEACTIVATE_CONFIRM));

    expect(server.switchRequests).toEqual([
      { expectedRevision: "1", item: accessoryItem(PUBLISHED), active: false },
    ]);
    expect(server.availability().disabled).toEqual([accessoryItem(PUBLISHED)]);
  });

  it("says nothing of use when the server counted none: the dialog opens and claims no count of its own", async () => {
    const { container } = await mountLinkedAccessoryList(0);

    await openMenuOf(container, PUBLISHED, PUBLISHED_RULE.name);
    await press(menuEntry(container, PUBLISHED, DEACTIVATE));

    const dialogText = openDialog()?.textContent ?? "";
    expect(dialogText).toContain(
      roCopy("priceDashboard.lifecycle.deactivateConfirm"),
    );
    expect(dialogText).not.toMatch(/salvat/);
  });

  it("keeps the accessory's deletion off, a stated row's deletion being R4c's", async () => {
    const { container, server } =
      await mountLinkedAccessoryList(PLANTED_DESIGNS);

    await openMenuOf(container, PUBLISHED, PUBLISHED_RULE.name);
    const entry = menuEntry(container, PUBLISHED, DELETE);
    await press(entry);

    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(openDialog()).toBeNull();
    expect(server.usageRequests).toEqual([]);
  });
});
