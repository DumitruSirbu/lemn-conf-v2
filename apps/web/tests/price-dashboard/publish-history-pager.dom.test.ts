// @vitest-environment happy-dom
//
// Frame D8A, the history: the versions a page at a time. Page 1 alone draws what the history always drew; more than a page
// draws the count shown and the pages, each read through the client, and a page that cannot be read leaves the one on screen.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  PriceVersionListWire,
  PriceVersionSummaryWire,
} from "@/price-dashboard/price-dashboard-wire-contract";
import type {
  PublishClient,
  VersionPageOutcome,
} from "@/price-dashboard/publish-client";
import type { PublishPageInput } from "@/price-dashboard/publish-model";
import { SAMPLE_PUBLISH_PAGE } from "../support/publish-sample";

import {
  allIn,
  byWords,
  click,
  requireIn,
  typeInto,
} from "../support/render-with-intl";
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

const PAGE_SIZE = 20;
const TOTAL = 45;

let mounted: MountedDesk | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  leaveTheStaffServer();
});

/** Versions numbered `total` down to 1, newest first, the newest active. */
function historyOf(total: number): readonly PriceVersionSummaryWire[] {
  return Array.from({ length: total }, (_, index) => {
    const sequenceNumber = total - index;
    return {
      versionId: `version-${String(sequenceNumber)}`,
      sequenceNumber,
      label: `Eticheta ${String(sequenceNumber)}`,
      state: index === 0 ? "active" : "archived",
      publishedAt: "2026-10-01T00:00:00.000Z",
      changeCount: 1,
    };
  });
}

function pageOf(
  versions: readonly PriceVersionSummaryWire[],
  page: number,
  pageSize = PAGE_SIZE,
): PriceVersionListWire {
  const first = (page - 1) * pageSize;
  return {
    total: versions.length,
    page,
    pageSize,
    versions: versions.slice(first, first + pageSize),
  };
}

function inputWithHistory(
  versions: readonly PriceVersionSummaryWire[],
  pageSize = PAGE_SIZE,
): PublishPageInput {
  return {
    ...inputWithDraft([]),
    versions: pageOf(versions, 1, pageSize),
  };
}

function answerFrom(
  versions: readonly PriceVersionSummaryWire[],
  pageSize = PAGE_SIZE,
): PublishClient["readVersionPage"] {
  return (page) =>
    Promise.resolve({ kind: "listed", list: pageOf(versions, page, pageSize) });
}

async function mountHistory(
  input: PublishPageInput,
  replace: Partial<PublishClient> = {},
): Promise<MountedDesk> {
  mounted = await mountDesk({
    input,
    client: spiedPublishClient(input, replace),
    view: "history",
  });
  return mounted;
}

const sequencesIn = (container: HTMLElement): number[] =>
  allIn(container, '[data-testid="version-row"]').map((row) =>
    Number(row.querySelector('[class*="versionNumber"]')?.textContent),
  );

const pagerOf = (container: HTMLElement): HTMLElement | null =>
  container.querySelector('[data-testid="version-pager"]');

const showing = (range: { from: number; to: number; total: number }): string =>
  roCopy("staffKitchens.showing", range);

function pageButton(container: HTMLElement, page: number): HTMLButtonElement {
  return byWords<HTMLButtonElement>(
    container,
    "button",
    roCopy("staffKitchens.pageNumber", { page }),
  );
}

async function goTo(container: HTMLElement, page: number): Promise<void> {
  click(pageButton(container, page));
  await settle();
}

describe("drawing the history", () => {
  it("asks the client for nothing: the first page is what the page was given", async () => {
    const { client } = await mountHistory(inputWithHistory(historyOf(TOTAL)));

    for (const call of Object.values(client)) {
      expect(call).not.toHaveBeenCalled();
    }
  });
});

describe("a history of one page", () => {
  it("draws its versions and no pager, as it did before there were pages", async () => {
    const versions = historyOf(PAGE_SIZE);
    const { container } = await mountHistory(inputWithHistory(versions));

    expect(sequencesIn(container)).toHaveLength(PAGE_SIZE);
    expect(pagerOf(container)).toBeNull();
  });

  it("draws the sample's own history with no pager", async () => {
    const { container } = await mountHistory(SAMPLE_PUBLISH_PAGE);

    expect(
      allIn(container, '[data-testid="version-row"]').length,
    ).toBeGreaterThan(0);
    expect(pagerOf(container)).toBeNull();
  });
});

describe("a history of several pages", () => {
  it("says which versions are shown out of how many, and offers every page", async () => {
    const { container } = await mountHistory(
      inputWithHistory(historyOf(TOTAL)),
    );

    expect(
      requireIn(container, '[data-testid="version-pager"]').textContent,
    ).toContain(showing({ from: 1, to: PAGE_SIZE, total: TOTAL }));
    expect(
      [1, 2, 3].map((page) => pageButton(container, page).isConnected),
    ).toEqual([true, true, true]);
    expect(pageButton(container, 1).getAttribute("aria-current")).toBe("page");
  });

  it("reads the page asked for through the client and draws its versions in place of the first", async () => {
    const versions = historyOf(TOTAL);
    const { container, client } = await mountHistory(
      inputWithHistory(versions),
      {
        readVersionPage: answerFrom(versions),
      },
    );

    await goTo(container, 2);

    expect(client.readVersionPage).toHaveBeenCalledTimes(1);
    expect(client.readVersionPage.mock.calls[0]?.[0]).toBe(2);
    expect(sequencesIn(container)).toEqual(
      versions.slice(PAGE_SIZE, 2 * PAGE_SIZE).map((v) => v.sequenceNumber),
    );
    expect(container.textContent).toContain(
      showing({ from: PAGE_SIZE + 1, to: 2 * PAGE_SIZE, total: TOTAL }),
    );
    expect(pageButton(container, 2).getAttribute("aria-current")).toBe("page");
    expect(client.readState).not.toHaveBeenCalled();
  });

  it("counts the last page's versions, which are fewer than a page", async () => {
    const versions = historyOf(TOTAL);
    const { container } = await mountHistory(inputWithHistory(versions), {
      readVersionPage: answerFrom(versions),
    });

    await goTo(container, 3);

    expect(sequencesIn(container)).toHaveLength(TOTAL - 2 * PAGE_SIZE);
    expect(container.textContent).toContain(
      showing({ from: 2 * PAGE_SIZE + 1, to: TOTAL, total: TOTAL }),
    );
  });

  it("counts the pages by the size the wire states, not by a size of its own", async () => {
    const versions = historyOf(12);
    const { container } = await mountHistory(inputWithHistory(versions, 5), {
      readVersionPage: answerFrom(versions, 5),
    });

    expect(pageButton(container, 3).isConnected).toBe(true);
    expect(() => pageButton(container, 4)).toThrow();
    await goTo(container, 3);
    expect(sequencesIn(container)).toEqual([2, 1]);
  });

  it("keeps the page on screen, marked busy, until the next one has come", async () => {
    const versions = historyOf(TOTAL);
    const answer = deferred<VersionPageOutcome>();
    const { container } = await mountHistory(inputWithHistory(versions), {
      readVersionPage: () => answer.promise,
    });

    click(pageButton(container, 2));
    await settle();

    expect(sequencesIn(container)[0]).toBe(TOTAL);
    expect(
      requireIn(container, '[data-testid="version-history"]').getAttribute(
        "aria-busy",
      ),
    ).toBe("true");
    answer.resolve({ kind: "listed", list: pageOf(versions, 2) });
    await settle();
    expect(sequencesIn(container)[0]).toBe(TOTAL - PAGE_SIZE);
    expect(
      requireIn(container, '[data-testid="version-history"]').getAttribute(
        "aria-busy",
      ),
    ).toBeNull();
  });
});

describe("a page that cannot be read", () => {
  const FAILURES: readonly (readonly [
    string,
    PublishClient["readVersionPage"],
  ])[] = [
    ["answered as failed", () => Promise.resolve({ kind: "failed" })],
    ["thrown by the client", () => Promise.reject(new Error("network"))],
  ];

  it.each(FAILURES)(
    "when %s, leaves the page on screen and says it could not be read",
    async (_name, readVersionPage) => {
      const versions = historyOf(TOTAL);
      const { container } = await mountHistory(inputWithHistory(versions), {
        readVersionPage,
      });

      await goTo(container, 2);

      expect(sequencesIn(container)[0]).toBe(TOTAL);
      expect(pagerOf(container)?.textContent).toContain(
        roCopy("priceDashboard.history.pageFailed"),
      );
      expect(pageButton(container, 1).getAttribute("aria-current")).toBe(
        "page",
      );
    },
  );

  it("is tried again by pressing the page again, and the notice goes once it has come", async () => {
    const versions = historyOf(TOTAL);
    let calls = 0;
    const { container } = await mountHistory(inputWithHistory(versions), {
      readVersionPage: (page) => {
        calls += 1;
        return calls === 1
          ? Promise.resolve({ kind: "failed" })
          : answerFrom(versions)(page);
      },
    });
    await goTo(container, 2);

    await goTo(container, 2);

    expect(sequencesIn(container)[0]).toBe(TOTAL - PAGE_SIZE);
    expect(pagerOf(container)?.textContent).not.toContain(
      roCopy("priceDashboard.history.pageFailed"),
    );
  });
});

describe("a page that arrives after the person has asked for another", () => {
  it("is not drawn: the page asked for last is the one that stays", async () => {
    const versions = historyOf(TOTAL);
    const second = deferred<VersionPageOutcome>();
    const { container } = await mountHistory(inputWithHistory(versions), {
      readVersionPage: (page) =>
        page === 2 ? second.promise : answerFrom(versions)(page),
    });
    click(pageButton(container, 2));
    await settle();
    await goTo(container, 3);

    second.resolve({ kind: "listed", list: pageOf(versions, 2) });
    await settle();

    expect(sequencesIn(container)).toHaveLength(TOTAL - 2 * PAGE_SIZE);
    expect(pageButton(container, 3).getAttribute("aria-current")).toBe("page");
  });

  it("does not leave the failure of an older page standing over the newer one", async () => {
    const versions = historyOf(TOTAL);
    const second = deferred<VersionPageOutcome>();
    const { container } = await mountHistory(inputWithHistory(versions), {
      readVersionPage: (page) =>
        page === 2 ? second.promise : answerFrom(versions)(page),
    });
    click(pageButton(container, 2));
    await settle();
    await goTo(container, 3);

    second.resolve({ kind: "failed" });
    await settle();

    expect(pagerOf(container)?.textContent).not.toContain(
      roCopy("priceDashboard.history.pageFailed"),
    );
  });
});

describe("a version published from this page's desk", () => {
  it("heads the first page and counts toward the total, with the others archived", async () => {
    const versions = historyOf(TOTAL);
    const input = {
      ...inputWithDraft(
        SAMPLE_PUBLISH_PAGE.state.draft.changes.filter(
          (change) => change.address.kind !== "provisional",
        ),
      ),
      versions: pageOf(versions, 1),
    };
    mounted = await mountDesk({ input, view: "pending" });
    const { container } = mounted;
    typeInto(
      requireIn<HTMLInputElement>(container, 'input[type="text"]'),
      "Ajustari",
    );
    click(requireIn(container, '[class*="primary"]'));
    click(
      byWords(
        document.body,
        "button",
        roCopy("priceDashboard.publish.confirmAction"),
      ),
    );
    await settle();
    await settle();

    expect(pagerOf(container)?.textContent).toContain(
      showing({ from: 1, to: PAGE_SIZE, total: TOTAL + 1 }),
    );
    expect(allIn(container, '[data-state="active"]')).toHaveLength(1);
    expect(sequencesIn(container)).toHaveLength(PAGE_SIZE);
    expect(sequencesIn(container)[0]).toBe(
      SAMPLE_PUBLISH_PAGE.state.active.sequenceNumber + 1,
    );
  });
});

describe("the latest versions of an empty draft", () => {
  it("are three, and carry no pager", async () => {
    const versions = historyOf(TOTAL);
    const { container } = await mountDesk({
      input: inputWithHistory(versions),
      view: "pending",
    }).then((desk) => {
      mounted = desk;
      return desk;
    });

    expect(sequencesIn(container)).toHaveLength(3);
    expect(pagerOf(container)).toBeNull();
  });
});
