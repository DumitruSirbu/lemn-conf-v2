// @vitest-environment happy-dom
//
// A request the session's end refused (a `401`) raises the staff frame's sheet and leaves the page as it is: on a publish, a
// discard, a page of the history and a restore alike. A restore the catalogue refuses says so, in its own words.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PriceVersionSummaryWire } from "@/price-dashboard/price-dashboard-wire-contract";
import type { PublishClient } from "@/price-dashboard/publish-client";
import { sampleVersionIdOf } from "@/price-dashboard/publish-sample-client";
import { sampleVersionDetail } from "@/price-dashboard/publish-sample";
import { PublishDraftUnreadableScreen } from "@/price-dashboard/publish-unreadable";
import { VersionDetailScreen } from "@/price-dashboard/version-detail";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";

import {
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const SESSION_ENDED = { kind: "session-ended" } as const;
const PAGE_SIZE = 20;
const TOTAL = 45;

let mounted: MountedDesk | undefined;
let screen: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
  resetStaffSessionExpiryForTests();
});

afterEach(() => {
  mounted?.unmount();
  screen?.unmount();
  mounted = undefined;
  screen = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="alertdialog"]');

const requireDialog = (): HTMLElement => {
  const found = dialog();
  if (found === null) throw new Error("no dialog is open");
  return found;
};

describe("a publish the session's end refused", () => {
  it("raises the sheet, publishes nothing and says so, with the prepared prices kept", async () => {
    const input = inputWithDraft([
      {
        address: {
          kind: "cabinet",
          ruleId: "cabinet.base-cabinet",
          field: "anchorMinor",
        },
        value: 400_000,
      },
    ]);
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        publish: () => Promise.resolve(SESSION_ENDED),
      }),
    });
    const { container } = mounted;
    typeInto(
      requireIn<HTMLInputElement>(container, 'input[type="text"]'),
      "Ajustari",
    );
    click(requireIn(container, '[class*="primary"]'));
    await settle();

    click(
      byWords(
        requireDialog(),
        "button",
        roCopy("priceDashboard.publish.confirmAction"),
      ),
    );
    await settle();

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
    expect(
      requireIn(container, '[data-testid="publish-notice"]').textContent,
    ).toContain(roCopy("priceDashboard.publish.failedTitle"));
    expect(mounted.client.publish).toHaveBeenCalledTimes(1);
  });
});

describe("a discard the session's end refused", () => {
  it("raises the sheet and keeps the question open with the failure told", async () => {
    const client = spiedPublishClient(inputWithDraft([]), {
      discardDraft: () => Promise.resolve(SESSION_ENDED),
    });
    screen = mountInCatalogue(
      createElement(PublishDraftUnreadableScreen, {
        locale: "ro",
        context: contextOf("administrator", ["kitchens", "publish"]),
        draftRevision: "rev-9",
        client,
      }),
      "ro",
    );
    await settle();
    const discard = roCopy("priceDashboard.publish.discardAction");
    click(byWords(screen.container, "button", discard));
    await settle();

    click(byWords(requireDialog(), "button", discard));
    await settle();

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
    expect(requireDialog().textContent).toContain(
      roCopy("priceDashboard.errors.saveFailed"),
    );
  });
});

describe("a page of the history the session's end refused", () => {
  it("raises the sheet and leaves the page on screen with its notice", async () => {
    const versions: readonly PriceVersionSummaryWire[] = Array.from(
      { length: TOTAL },
      (_, index) => ({
        versionId: `version-${String(TOTAL - index)}`,
        sequenceNumber: TOTAL - index,
        label: `Eticheta ${String(TOTAL - index)}`,
        state: index === 0 ? "active" : "archived",
        publishedAt: "2026-10-01T00:00:00.000Z",
        changeCount: 1,
      }),
    );
    const input = {
      ...inputWithDraft([]),
      versions: {
        total: TOTAL,
        page: 1,
        pageSize: PAGE_SIZE,
        versions: versions.slice(0, PAGE_SIZE),
      },
    };
    mounted = await mountDesk({
      input,
      client: spiedPublishClient(input, {
        readVersionPage: () => Promise.resolve(SESSION_ENDED),
      }),
      view: "history",
    });
    const { container } = mounted;

    click(
      byWords(
        container,
        "button",
        roCopy("staffKitchens.pageNumber", { page: 2 }),
      ),
    );
    await settle();

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
    expect(container.textContent).toContain(
      roCopy("priceDashboard.history.pageFailed"),
    );
  });
});

describe("a restore", () => {
  async function mountRestore(
    replace: Partial<PublishClient>,
  ): Promise<HTMLElement> {
    const input = sampleVersionDetail(sampleVersionIdOf(3), "ro");
    if (input === undefined)
      throw new Error("the sample holds no such version");
    const detail = { ...input, draft: { draftRevision: "1", changes: [] } };
    screen = mountInCatalogue(
      createElement(VersionDetailScreen, {
        locale: "ro",
        context: contextOf("administrator", ["kitchens", "publish"]),
        input: detail,
        client: spiedPublishClient(inputWithDraft([]), replace),
      }),
      "ro",
    );
    await settle();
    click(
      byWords(
        screen.container,
        "button",
        roCopy("priceDashboard.history.restoreAction", { versionId: "3" }),
      ),
    );
    await settle();
    click(
      byWords(
        requireDialog(),
        "button",
        roCopy("priceDashboard.common.addToPending"),
      ),
    );
    await settle();
    return screen.container;
  }

  it("the session's end refused raises the sheet and tells the restore did not save", async () => {
    await mountRestore({ restore: () => Promise.resolve(SESSION_ENDED) });

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: false });
    expect(requireDialog().textContent).toContain(
      roCopy("priceDashboard.errors.saveFailed"),
    );
  });

  it("the catalogue refused says the prices cannot be added, and not that the save failed", async () => {
    await mountRestore({
      restore: () => Promise.resolve({ kind: "candidate-refused" }),
    });

    expect(getStaffSessionExpiry()).toBeUndefined();
    expect(requireDialog().textContent).toContain(
      roCopy("priceDashboard.history.restoreCandidateRefused"),
    );
    expect(requireDialog().textContent).not.toContain(
      roCopy("priceDashboard.errors.saveFailed"),
    );
  });
});
