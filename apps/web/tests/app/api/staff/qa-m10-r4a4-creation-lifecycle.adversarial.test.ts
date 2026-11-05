import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  isSameAddress,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { readPendingDraft } from "@/price-dashboard/publish-model";
import type { RowView } from "@/price-dashboard/publish-model";
import { staleDraftOf } from "@/price-dashboard/stale-draft";
import type { DraftRevertTargetWire } from "@/price-dashboard/price-dashboard-wire-contract";

import { jsonOf } from "../../../support/account-world";
import {
  activeBookOf,
  createAccessoryAs,
  createClassAs,
  mintedIdOf,
  plantDraft,
  putChangeAs,
  revertAs,
  startCreationWorld,
  storedChangesOf,
  type CreationWorld,
} from "../../../support/creation-world";
import {
  publishBody,
  publishDraft,
} from "../../../support/price-dashboard-requests";

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

// A draft made by the creation routes, followed past the routes: published, drawn for review, drawn as a list of stale
// changes, and taken back through the revert route by every ↺ the screens offer.

let world: CreationWorld;

beforeEach(async () => {
  world = await startCreationWorld(SAMPLE_PRICE_BOOK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const CABINET_NAMES = Object.fromEntries(
  SAMPLE_PRICE_BOOK.cabinetRules.map(({ buildId }) => [buildId, buildId]),
);
const STALE: DraftChange = {
  address: { kind: "cabinet", ruleId: "cabinet.gone", field: "anchorMinor" },
  value: 5_000,
} as DraftChange;

const activeBook = (): Promise<PriceBook> => activeBookOf(world.prices);

interface CreatedIds {
  readonly tierId: string;
  readonly accessoryId: string;
}

/** A class and an accessory, each made by the route a page sends it to. */
async function buildCreations(): Promise<CreatedIds> {
  const tierId = await mintedIdOf(await createClassAs(world.cookie));
  const accessoryId = await mintedIdOf(await createAccessoryAs(world.cookie));
  return { tierId, accessoryId };
}

async function rewordCreatedRows({
  tierId,
  accessoryId,
}: CreatedIds): Promise<void> {
  const words = [
    [{ kind: "accessory", accessoryId }, "name", "Soclu nou"],
    [{ kind: "hardware", tierId }, "description", "Alta descriere"],
  ] as const;
  for (const [item, field, value] of words) {
    const answer = await putChangeAs(world.cookie, {
      address: { kind: "created-row-text", item, field },
      value,
    });
    expect(answer.status).toBe(200);
  }
}

async function buildDraftOfCreations(): Promise<CreatedIds> {
  const ids = await buildCreations();
  await rewordCreatedRows(ids);
  return ids;
}

function namesId(change: DraftChange, id: string): boolean {
  return JSON.stringify(change.address).includes(id);
}

function revertsOf(rows: readonly RowView[]): DraftRevertTargetWire[] {
  return rows.flatMap((row) => {
    const own = row.revert === undefined ? [] : [row.revert];
    const inside = row.kind === "group" ? revertsOf(row.items) : [];
    return [...own, ...inside];
  });
}

function isHeld(
  changes: readonly DraftChange[],
  target: DraftRevertTargetWire,
): boolean {
  return target.kind === "change"
    ? changes.some((held) => isSameAddress(held.address, target.address))
    : changes.some((held) => held.groupId === target.groupId);
}

describe("a created class and accessory, published", () => {
  it("is published, so Create is not a dead end: the catalogue's judgement accepts a created row", async () => {
    const { tierId, accessoryId } = await buildDraftOfCreations();

    const answer = await publishDraft({
      cookie: world.cookie,
      json: await publishBody(),
    });

    expect({ status: answer.status, body: await jsonOf(answer) }).toMatchObject(
      { status: 200 },
    );
    const book = await activeBook();
    expect(book.hardware.tiers.map(({ tierId: id }) => id)).toContain(tierId);
    expect(book.linkedAccessories.map(({ accessoryId: id }) => id)).toContain(
      accessoryId,
    );
  });

  it("starts switched off: the availability head names both created rows as disabled (A-17)", async () => {
    const { tierId, accessoryId } = await buildDraftOfCreations();

    const answer = await publishDraft({
      cookie: world.cookie,
      json: await publishBody(),
    });

    expect(answer.status).toBe(200);
    const { disabled } = await world.prices.stores.availability.readCurrent();
    const expected: ItemRef[] = [
      { kind: "hardware", tierId },
      { kind: "accessory", accessoryId },
    ];
    expect(disabled).toEqual(expect.arrayContaining(expected));
  });

  it("leaves the draft empty after the publish, so the created rows are not created twice", async () => {
    await buildDraftOfCreations();

    await publishDraft({ cookie: world.cookie, json: await publishBody() });

    expect(await storedChangesOf(world.prices)).toEqual([]);
  });

  it("refuses a second creation that read the draft before the publish, with 409, and adds no row", async () => {
    await buildDraftOfCreations();
    const staleRevision = (await world.prices.stores.priceBook.readDraft())
      .draftRevision;
    await publishDraft({ cookie: world.cookie, json: await publishBody() });
    const booksBefore = (await activeBook()).hardware.tiers.length;

    const answer = await createClassAs(world.cookie, {
      expectedDraftRevision: staleRevision,
    });

    expect(answer.status).toBe(409);
    expect((await activeBook()).hardware.tiers).toHaveLength(booksBefore);
    expect(await storedChangesOf(world.prices)).toEqual([]);
  });
});

describe("every ↺ the pending-draft review offers, sent to the revert route", () => {
  it("names an address the draft holds, and the route takes it and leaves a draft that still applies", async () => {
    await buildDraftOfCreations();
    const snapshot = await storedChangesOf(world.prices);
    const reading = readPendingDraft({
      active: await activeBook(),
      changes: snapshot,
      cabinetNames: CABINET_NAMES,
    });
    if (reading.kind !== "ready") throw new Error("the draft is not ready");
    const targets = reading.view.sections.flatMap(({ rows }) =>
      revertsOf(rows),
    );
    expect(targets.length).toBeGreaterThan(0);

    for (const target of targets) {
      expect(isHeld(snapshot, target), JSON.stringify(target)).toBe(true);
      await plantDraft(world, snapshot);

      const answer = await revertAs(world.cookie, target);

      expect(answer.status, JSON.stringify(target)).toBe(200);
      const remaining = await storedChangesOf(world.prices);
      expect(remaining.length).toBeLessThan(snapshot.length);
      expect(applyChanges(await activeBook(), remaining).ok).toBe(true);
    }
  });

  it("takes every ↺ of a draft that only creates, with no word changed since", async () => {
    await buildCreations();
    const snapshot = await storedChangesOf(world.prices);
    const reading = readPendingDraft({
      active: await activeBook(),
      changes: snapshot,
      cabinetNames: CABINET_NAMES,
    });
    if (reading.kind !== "ready") throw new Error("the draft is not ready");
    const targets = reading.view.sections.flatMap(({ rows }) =>
      revertsOf(rows),
    );

    const statuses: number[] = [];
    for (const target of targets) {
      await plantDraft(world, snapshot);
      expect(isHeld(snapshot, target), JSON.stringify(target)).toBe(true);
      statuses.push((await revertAs(world.cookie, target)).status);
    }

    expect(targets).toHaveLength(2);
    expect(statuses).toEqual([200, 200]);
  });

  it("offers a created class's ↺ once, on its own row, never on one of its rates", async () => {
    const { tierId } = await buildDraftOfCreations();
    const reading = readPendingDraft({
      active: await activeBook(),
      changes: await storedChangesOf(world.prices),
      cabinetNames: CABINET_NAMES,
    });
    if (reading.kind !== "ready") throw new Error("the draft is not ready");

    const offered = reading.view.sections
      .flatMap(({ rows }) => revertsOf(rows))
      .filter(
        (target) =>
          target.kind === "change" &&
          JSON.stringify(target.address).includes(tierId),
      );

    expect(offered).toEqual([
      { kind: "change", address: { kind: "hardware-tier-created", tierId } },
    ]);
  });

  it("takes a created accessory's reworded name back alone, and the accessory stays", async () => {
    const { accessoryId } = await buildDraftOfCreations();
    const before = await storedChangesOf(world.prices);

    const answer = await revertAs(world.cookie, {
      kind: "change",
      address: {
        kind: "created-row-text",
        item: { kind: "accessory", accessoryId },
        field: "name",
      },
    });

    expect(answer.status).toBe(200);
    const after = await storedChangesOf(world.prices);
    expect(after).toHaveLength(before.length - 1);
    expect(after.some((change) => namesId(change, accessoryId))).toBe(true);
  });
});

describe("every ↺ the stale-draft list offers, sent to the revert route", () => {
  it("names an address the draft holds, and the route takes it with the stale change still in the draft", async () => {
    const { tierId, accessoryId } = await buildDraftOfCreations();
    const created = await storedChangesOf(world.prices);
    const stale = [...created, STALE];
    const view = staleDraftOf({
      active: await activeBook(),
      changes: stale,
      cabinetNames: CABINET_NAMES,
    });
    if (view.kind !== "lines") throw new Error("the whole book is refused");
    const targets = view.lines.flatMap(({ revert }) =>
      revert === undefined ? [] : [revert],
    );
    expect(targets.length).toBeGreaterThanOrEqual(3);

    for (const target of targets) {
      await plantDraft(world, stale);
      expect(isHeld(stale, target), JSON.stringify(target)).toBe(true);

      const answer = await revertAs(world.cookie, target);

      expect(answer.status, JSON.stringify(target)).toBe(200);
      const remaining = await storedChangesOf(world.prices);
      expect(remaining.length).toBeLessThan(stale.length);
      const wasCreation =
        target.kind === "change" && target.address.kind.endsWith("-created");
      if (wasCreation) {
        const gone = JSON.stringify(target.address).includes(tierId)
          ? tierId
          : accessoryId;
        expect(remaining.some((change) => namesId(change, gone))).toBe(false);
      }
    }
  });
});

describe("a deleted row's ↺, until the deletion is reachable", () => {
  const DELETED_TIER = "hardware.soft-close";
  const deletion = {
    address: {
      kind: "item-deleted",
      item: { kind: "hardware", tierId: DELETED_TIER },
    },
    value: true,
  } as DraftChange;

  it.fails(
    "is not offered by the pending-draft review where the revert route refuses it with 400",
    async () => {
      const changes = [deletion];
      const reading = readPendingDraft({
        active: await activeBook(),
        changes,
        cabinetNames: CABINET_NAMES,
      });
      if (reading.kind !== "ready") throw new Error("the draft is not ready");
      const targets = reading.view.sections.flatMap(({ rows }) =>
        revertsOf(rows),
      );

      const statuses: number[] = [];
      for (const target of targets) {
        await plantDraft(world, changes);
        statuses.push((await revertAs(world.cookie, target)).status);
      }

      expect(statuses.filter((status) => status !== 200)).toEqual([]);
    },
  );
});
