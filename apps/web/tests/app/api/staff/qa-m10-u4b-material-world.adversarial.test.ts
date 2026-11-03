// The materials source (`material-source.ts`) held over the dashboard's real read
// (`readDashboardStateForAdmittedPage`, the persistence package's fake stores and the app's own sessions). The source's own
// tests answer for a planted state; here the state is one a person wrote through the draft route, and what a render may
// not do is held against the stores: a read leaves the ledger, the draft and the availability exactly as they were.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  deriveMaterials,
  surchargeAddressOf,
} from "@/price-dashboard/material-model";
import { SAMPLE_MATERIAL_USAGE } from "@/price-dashboard/material-sample";
import { readMaterial, readMaterials } from "@/price-dashboard/material-source";

import {
  captureConsole,
  currentAccountWorld,
  freshAccountWorld,
} from "../../../support/account-world";
import {
  changeDraft,
  currentDraftRevision,
} from "../../../support/price-dashboard-requests";
import {
  currentPriceDashboardWorld,
  freshPriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  currentStaffWorld,
  freshStaffWorld,
  signedInAs,
} from "../../../support/staff-world";

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

const MDF = "material.painted-mdf";

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function writeSurcharge(percent: number): Promise<string> {
  const author = await signedInAs(
    { role: "administrator" },
    "price-author@example.test",
  );
  const wrote = await changeDraft({
    cookie: author.session.cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      change: { address: surchargeAddressOf(MDF), value: percent },
    },
  });
  expect(wrote.status).toBe(200);
  return author.account.id;
}

describe("the page the browser is handed when the draft holds a surcharge someone wrote", () => {
  it("shows the surcharge beside the active one, and carries nothing of its author", async () => {
    const authorId = await writeSurcharge(35);

    const read = await readMaterials();

    if (read.kind !== "ready") throw new Error("unavailable");
    const derived = deriveMaterials(read.page.state);
    if (derived.kind !== "ready") throw new Error("unreadable");
    const mdf = derived.materials.find(({ tierId }) => tierId === MDF);
    expect(mdf?.pendingPercent).toBe(35);
    expect(mdf?.activePercent).not.toBe(35);
    expect(mdf?.isModified).toBe(true);
    const shipped = JSON.stringify(read.page);
    expect(shipped).not.toContain("price-author@example.test");
    expect(shipped).not.toContain(authorId);
  });

  it("holds the availability the store holds, so a switch another actor made is what the screen starts from", async () => {
    const stored =
      await currentPriceDashboardWorld().stores.availability.readCurrent();

    const read = await readMaterials();

    if (read.kind !== "ready") throw new Error("unavailable");
    expect(read.page.state.active.availability).toEqual(stored);
  });

  it("is the page of the one material asked for, and not-found for an id the book never held", async () => {
    await writeSurcharge(35);

    const held = await readMaterial(MDF);
    const stranger = await readMaterial("material.stranger");

    expect(held.kind).toBe("ready");
    expect(stranger).toEqual({ kind: "not-found" });
  });
});

describe("what a render says and writes", () => {
  const snapshot = async () => {
    const world = currentPriceDashboardWorld();
    return {
      dashboardAudit: world.ledger.heldEvents().length,
      draft: await currentDraftRevision(),
      availability: (await world.stores.availability.readCurrent()).revision,
      staffAuditCalls: [...currentStaffWorld().calls],
      accountStoreCalls: [...currentAccountWorld().calls],
    };
  };

  it("leaves the ledger, the draft, the availability, the staff audit and every account store exactly as they were, in a render of the list and of a material", async () => {
    await writeSurcharge(35);
    const before = await snapshot();

    await readMaterials();
    await readMaterial(MDF);
    await readMaterial("material.stranger");

    expect(await snapshot()).toEqual(before);
    expect(before.dashboardAudit).toBeGreaterThan(0);
    expect(before.accountStoreCalls.length).toBeGreaterThan(0);
  });
});

describe("the counts a page is handed", () => {
  it("are the invented ones outside a production build and none at all in one, whatever the state", async () => {
    await writeSurcharge(35);

    vi.stubEnv("NODE_ENV", "development");
    const development = await readMaterials();
    vi.stubEnv("NODE_ENV", "production");
    const production = await readMaterials();

    if (development.kind !== "ready" || production.kind !== "ready") {
      throw new Error("unavailable");
    }
    expect(development.page.sampleUsage).toEqual(SAMPLE_MATERIAL_USAGE);
    expect(production.page.sampleUsage).toBeUndefined();
    expect(production.page.defaults).toBeUndefined();
    expect(JSON.stringify(production.page)).not.toContain("designCount");
  });
});
