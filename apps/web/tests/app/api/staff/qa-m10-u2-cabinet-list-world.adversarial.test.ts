// Adversarial QA of M10 wave U2, the cabinet list's source over the dashboard's real read (`cabinet-list-source.ts`
// over `readDashboardStateForAdmittedPage`, the persistence package's fake stores and the app's own sessions).
// `cabinet-list-source-world.test.ts` reads an empty draft. Here the draft holds a price its author's address and
// account stand behind, and the page the browser is handed is searched for everything that must not travel with it. Who
// may be given the page is the staff gate's, held by `read-catalog-page.test.ts` and `qa-m10-u1-catalog-gate`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { readCabinetList } from "@/price-dashboard/cabinet-list-source";
import { deriveCabinetList } from "@/price-dashboard/cabinet-list-facts";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import {
  bulkDraft,
  changeDraft,
  currentDraftRevision,
} from "../../../support/price-dashboard-requests";
import { freshPriceDashboardWorld } from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const ANCHOR = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
} as const;

describe("the page the browser is handed when the draft holds prices someone wrote", () => {
  it("carries the pending prices, and not the author's address, account, session or the token that wrote them", async () => {
    const author = await signedInAs(
      { role: "administrator" },
      "price-author@example.test",
    );
    const wrote = await changeDraft({
      cookie: author.session.cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: ANCHOR, value: 400_000 },
      },
    });
    expect(wrote.status).toBe(200);
    const bulked = await bulkDraft({
      cookie: author.session.cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        target: { scope: "group", groupCode: "wall" },
        percent: 10,
      },
    });
    expect(bulked.status).toBe(200);

    const read = await readCabinetList();

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    expect(read.page.state.draft.changes.length).toBeGreaterThan(1);
    const shipped = JSON.stringify(read.page);
    for (const secret of [
      "price-author@example.test",
      author.account.id,
      author.session.value,
      author.session.tokenHash,
    ]) {
      expect(shipped, secret).not.toContain(secret);
    }
    for (const change of read.page.state.draft.changes) {
      expect(
        Object.keys(change).every((key) =>
          ["address", "value", "groupId", "bulk"].includes(key),
        ),
        JSON.stringify(Object.keys(change)),
      ).toBe(true);
    }
    expect(deriveCabinetList(read.page).kind).toBe("ready");
  });

  it("is the list's own derived rows with each pending price shown beside its active one, never as the active one", async () => {
    const author = await signedInAs({ role: "administrator" });
    await changeDraft({
      cookie: author.session.cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: ANCHOR, value: 400_000 },
      },
    });

    const read = await readCabinetList();

    if (read.kind !== "ready") throw new Error("unavailable");
    const derived = deriveCabinetList(read.page);
    if (derived.kind !== "ready") throw new Error("unreadable");
    const row = derived.input.rules.find(
      ({ ruleId }) => ruleId === ANCHOR.ruleId,
    );
    expect(row?.price?.activeMinor).toBe(396_000);
    expect(row?.price?.pendingMinor).toBe(400_000);
    expect(read.page.state.active.book.cabinetRules).toEqual(
      SAMPLE_PRICE_BOOK.cabinetRules,
    );
  });
});

describe("what a render says", () => {
  it("names no price in the log", async () => {
    await readCabinetList();

    expect(console_.everything()).not.toContain("396000");
  });
});
