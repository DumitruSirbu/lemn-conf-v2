import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import type { DraftRevertTargetWire } from "@/price-dashboard/price-dashboard-wire-contract";
import {
  readPendingDraft,
  type RowView,
} from "@/price-dashboard/publish-model";
import { staleDraftOf } from "@/price-dashboard/stale-draft";

import { freshAccountWorld } from "../../../support/account-world";
import {
  createAccessoryInDraft,
  createHardwareClassInDraft,
  currentDraftRevision,
  revertDraft,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
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

// The ↺ of the publish page and of the list of a draft that cannot be applied, against the revert route as it is: every
// target either view offers for what the creation routes wrote is sent to the real route, since a view that offers a
// target the route refuses is a button that answers `400`.

let prices: PriceDashboardWorld;
let cookie: string;
let tokenHash: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  tokenHash = session.tokenHash;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const STALE: DraftChange = {
  address: {
    kind: "cabinet",
    ruleId: "cabinet.no-such-rule",
    field: "anchorMinor",
  },
  value: 1,
};

async function createdClassAndAccessory(): Promise<readonly DraftChange[]> {
  const rates = Object.fromEntries(
    HARDWARE_RATE_FIELDS.map((field) => [field, 2_000]),
  );
  const made = await createHardwareClassInDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      value: { name: "GTV Economic", description: "" },
      rates,
    },
  });
  const accessory = await createAccessoryInDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      value: {
        linkedBuildId: "base-3drawer",
        perUnitMinor: 1_000,
        name: "Soclu",
      },
    },
  });
  expect([made.status, accessory.status]).toEqual([200, 200]);
  return storedChanges();
}

async function storedChanges(): Promise<readonly DraftChange[]> {
  return (await prices.stores.priceBook.readDraft())
    .changes as readonly DraftChange[];
}

async function plant(changes: readonly DraftChange[]): Promise<void> {
  const written = await prices.priceBook.writeDraft({
    expectedDraftRevision: await currentDraftRevision(),
    changes,
    audit: {
      session: {
        sessionTokenHash: tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
      },
      entry: {
        action: "price-draft-changed",
        detail: { changeKind: "provisional" },
      },
    },
  });
  if (written.kind !== "ok") throw new Error("seed: the draft not written");
}

async function sendRevert(target: DraftRevertTargetWire): Promise<Response> {
  return revertDraft({
    cookie,
    json: { expectedDraftRevision: await currentDraftRevision(), target },
  });
}

function revertsOf(rows: readonly RowView[]): readonly DraftRevertTargetWire[] {
  return rows.flatMap((row) => (row.revert === undefined ? [] : [row.revert]));
}

function pendingRows(changes: readonly DraftChange[]): readonly RowView[] {
  const reading = readPendingDraft({
    active: SAMPLE_PRICE_BOOK,
    changes,
    cabinetNames: {},
  });
  if (reading.kind !== "ready") throw new Error(`read as ${reading.kind}`);
  return reading.view.sections.flatMap((section) => section.rows);
}

function staleReverts(
  changes: readonly DraftChange[],
): readonly DraftRevertTargetWire[] {
  const stale = staleDraftOf({
    active: SAMPLE_PRICE_BOOK,
    changes,
    cabinetNames: {},
  });
  if (stale.kind !== "lines") throw new Error("the draft has no lines");
  return stale.lines.flatMap(({ revert }) =>
    revert === undefined ? [] : [revert],
  );
}

describe("the ↺ of the publish page, for what the creation routes wrote", () => {
  it("offers the two creations and nothing else: the class, its rates and the accessory's price carry none", async () => {
    const changes = await createdClassAndAccessory();

    const targets = revertsOf(pendingRows(changes));

    expect(targets).toHaveLength(2);
    expect(
      targets
        .map((target) => target.kind === "change" && target.address.kind)
        .sort(),
    ).toEqual(["accessory-created", "hardware-tier-created"]);
  });

  it("is answered 200 by the revert route for every target it offers, and each takes its row away whole", async () => {
    const changes = await createdClassAndAccessory();

    for (const target of revertsOf(pendingRows(changes))) {
      await plant(changes);
      const answer = await sendRevert(target);

      expect(answer.status).toBe(200);
      const remaining = await storedChanges();
      const named = target.kind === "change" && target.address;
      expect(remaining.length).toBeLessThan(changes.length);
      expect(
        remaining.some(
          ({ address }) => JSON.stringify(address) === JSON.stringify(named),
        ),
      ).toBe(false);
    }
  });
});

describe("the ↺ of a draft that cannot be applied, for what the creation routes wrote", () => {
  it("is answered 200 by the revert route for every line's target, the created rows' included", async () => {
    const changes = [...(await createdClassAndAccessory()), STALE];

    const targets = staleReverts(changes);

    expect(targets).toHaveLength(3);
    for (const target of targets) {
      await plant(changes);
      const answer = await sendRevert(target);

      expect(answer.status).toBe(200);
    }
  });

  it("takes a created class away by its creation even after the draft deleted it", async () => {
    const created = await createdClassAndAccessory();
    const creation = created.find(
      ({ address }) => address.kind === "hardware-tier-created",
    );
    const tierId =
      creation?.address.kind === "hardware-tier-created"
        ? creation.address.tierId
        : "";
    const deletion = {
      address: { kind: "item-deleted", item: { kind: "hardware", tierId } },
      value: true,
    } as DraftChange;
    const changes = [...created, deletion, STALE];

    const targets = staleReverts(changes);

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      await plant(changes);
      expect((await sendRevert(target)).status).toBe(200);
    }
  });
});
