// @vitest-environment happy-dom
//
// Adversarial QA of the history's pager at the edges of its numbers: a page the history has since outgrown or shrunk
// below, and a page size that is not the one the first page stated. The pager counts from what the last answer said.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  PriceVersionListWire,
  PriceVersionSummaryWire,
} from "@/price-dashboard/price-dashboard-wire-contract";
import type { PublishClient } from "@/price-dashboard/publish-client";

import { allIn, byWords, click } from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  settle,
  spiedPublishClient,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const FIRST_PAGE_SIZE = 20;

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

function versionsOf(total: number): readonly PriceVersionSummaryWire[] {
  return Array.from({ length: total }, (_, index) => {
    const sequenceNumber = total - index;
    return {
      versionId: `version-${String(sequenceNumber)}`,
      sequenceNumber,
      label: `Eticheta ${String(sequenceNumber)}`,
      state: index === 0 ? ("active" as const) : ("archived" as const),
      publishedAt: "2026-10-01T00:00:00.000Z",
      changeCount: 1,
    };
  });
}

function listOf(
  versions: readonly PriceVersionSummaryWire[],
  page: number,
  pageSize: number,
): PriceVersionListWire {
  const first = (page - 1) * pageSize;
  return {
    total: versions.length,
    page,
    pageSize,
    versions: versions.slice(first, first + pageSize),
  };
}

async function mountHistory(
  total: number,
  answerFor: (page: number) => PriceVersionListWire,
): Promise<HTMLElement> {
  const input = {
    ...inputWithDraft([]),
    versions: listOf(versionsOf(total), 1, FIRST_PAGE_SIZE),
  };
  const replace: Partial<PublishClient> = {
    readVersionPage: (page) =>
      Promise.resolve({ kind: "listed", list: answerFor(page) }),
  };
  mounted = await mountDesk({
    input,
    client: spiedPublishClient(input, replace),
    view: "history",
  });
  return mounted.container;
}

const pageButton = (container: HTMLElement, page: number): HTMLButtonElement =>
  byWords<HTMLButtonElement>(
    container,
    "button",
    roCopy("staffKitchens.pageNumber", { page }),
  );

const shownCount = (container: HTMLElement): string | undefined =>
  container.querySelector('[class*="showing"]')?.textContent;

describe("a page the history has shrunk below since the pager was drawn", () => {
  it("is drawn empty with the pages that exist still offered, and the first of them brings the history back", async () => {
    const versions = versionsOf(45);
    const container = await mountHistory(45, (page) =>
      page === 3
        ? { total: 30, page: 3, pageSize: FIRST_PAGE_SIZE, versions: [] }
        : listOf(versions, page, FIRST_PAGE_SIZE),
    );

    click(pageButton(container, 3));
    await settle();

    expect(allIn(container, '[data-testid="version-row"]')).toEqual([]);
    expect(shownCount(container)).toBeUndefined();
    click(pageButton(container, 1));
    await settle();
    expect(allIn(container, '[data-testid="version-row"]')).toHaveLength(
      FIRST_PAGE_SIZE,
    );
  });
});

describe("a page whose answer states another page size than the first", () => {
  it("is counted by that size: the range shown and the pages offered follow the last answer", async () => {
    const versions = versionsOf(45);
    const container = await mountHistory(45, (page) =>
      listOf(versions, page, 10),
    );

    click(pageButton(container, 2));
    await settle();

    expect(shownCount(container)).toBe(
      roCopy("staffKitchens.showing", { from: 11, to: 20, total: 45 }),
    );
    expect(pageButton(container, 5).isConnected).toBe(true);
  });
});
