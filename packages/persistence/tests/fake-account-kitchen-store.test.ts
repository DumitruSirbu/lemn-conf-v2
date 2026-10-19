import { fc } from "@fast-check/vitest";
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { DesignId } from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_EXPORTED_KITCHENS,
  type KitchenCursor,
  type KitchenPage,
} from "../src/account-kitchen-store.js";
import {
  FakeAccountKitchenStore,
  FakeSentMarkStore,
  type SeededKitchen,
} from "../src/fake-account-kitchen-store.js";

const OWNER = "O".repeat(21);
const OTHER_OWNER = "X".repeat(21);
const FIRST_INSTANT = new Date("2026-10-19T09:00:00.000Z");

interface Revocation {
  readonly designId: DesignId;
  readonly at: Date;
}

let currentTime: Date;
let revocations: Revocation[];
let store: FakeAccountKitchenStore;
let sentMarks: FakeSentMarkStore;

beforeEach(() => {
  currentTime = new Date(FIRST_INSTANT);
  revocations = [];
  store = new FakeAccountKitchenStore({
    now: () => new Date(currentTime),
    revokeShareLinksOf: (designId, at) => {
      revocations.push({ designId, at });
    },
  });
  sentMarks = new FakeSentMarkStore(store);
});

function advanceClock(milliseconds = 1_000): void {
  currentTime = new Date(currentTime.getTime() + milliseconds);
}

function seed(
  id: string,
  overrides: Partial<Omit<SeededKitchen, "id">> = {},
): DesignId {
  store.seed({
    id,
    accountId: OWNER,
    design: KITCHEN_L_DESIGN,
    ...overrides,
  });
  return id;
}

function mark(designId: DesignId, accountId = OWNER) {
  return { accountId, designId };
}

async function idsOnPageAfter(
  after: KitchenCursor | undefined,
  limit: number,
): Promise<KitchenPage> {
  return store.listPage({
    accountId: OWNER,
    limit,
    ...(after === undefined ? {} : { after }),
  });
}

describe("FakeAccountKitchenStore.listPage", () => {
  it("answers an account with no kitchens with an empty page and a total of 0", async () => {
    expect(await idsOnPageAfter(undefined, 12)).toEqual({
      kitchens: [],
      nextCursor: null,
      total: 0,
      skippedCount: 0,
    });
  });

  it("lists newest first by updated_at and then by id, both descending", async () => {
    seed("b-old", { updatedAt: new Date("2026-10-01T00:00:00Z") });
    seed("a-new", { updatedAt: new Date("2026-10-03T00:00:00Z") });
    seed("tie-a", { updatedAt: new Date("2026-10-02T00:00:00Z") });
    seed("tie-c", { updatedAt: new Date("2026-10-02T00:00:00Z") });
    seed("tie-b", { updatedAt: new Date("2026-10-02T00:00:00Z") });

    const page = await idsOnPageAfter(undefined, 12);

    expect(page.kitchens.map((kitchen) => kitchen.id)).toEqual([
      "a-new",
      "tie-c",
      "tie-b",
      "tie-a",
      "b-old",
    ]);
  });

  it("shows the name, or null for a kitchen never named, and whether it was sent", async () => {
    seed("named", { name: "Casa mare", sentAt: FIRST_INSTANT });
    seed("unnamed");

    const byId = new Map(
      (await idsOnPageAfter(undefined, 12)).kitchens.map((kitchen) => [
        kitchen.id,
        kitchen,
      ]),
    );

    expect(byId.get("named")).toMatchObject({
      name: "Casa mare",
      isSent: true,
    });
    expect(byId.get("unnamed")).toMatchObject({ name: null, isSent: false });
  });

  it("returns the design as a copy, so a caller cannot change the stored one", async () => {
    seed("one");

    const [listed] = (await idsOnPageAfter(undefined, 12)).kitchens;
    expect(listed?.design).toEqual(KITCHEN_L_DESIGN);
    expect(listed?.design).not.toBe(store.held("one")?.design);
    if (listed !== undefined) listed.design.placements.length = 0;

    expect(store.held("one")?.design.placements).toHaveLength(
      KITCHEN_L_DESIGN.placements.length,
    );
  });

  describe("never returns a kitchen that is not the account's own, listed kitchen", () => {
    it("leaves out another account's, a hidden one and a deleted one, in the page and in the total", async () => {
      seed("mine");
      seed("theirs", { accountId: OTHER_OWNER });
      seed("hidden", { sentAt: FIRST_INSTANT, hiddenAt: FIRST_INSTANT });
      seed("deleted", { deletedAt: FIRST_INSTANT });
      seed("hidden-and-deleted", {
        hiddenAt: FIRST_INSTANT,
        deletedAt: FIRST_INSTANT,
      });

      const page = await idsOnPageAfter(undefined, 12);

      expect(page.kitchens.map((kitchen) => kitchen.id)).toEqual(["mine"]);
      expect(page.total).toBe(1);
      expect(await store.countListed(OWNER)).toBe(1);
    });
  });

  describe("paging", () => {
    beforeEach(() => {
      for (let index = 0; index < 5; index += 1) {
        seed(`k${String(index)}`, {
          updatedAt: new Date(FIRST_INSTANT.getTime() + index * 1000),
        });
      }
    });

    it("has no next cursor when the page holds the last kitchen, even when the page is full", async () => {
      const page = await idsOnPageAfter(undefined, 5);

      expect(page.kitchens).toHaveLength(5);
      expect(page.nextCursor).toBeNull();
    });

    it("has a next cursor as soon as one kitchen is left", async () => {
      const page = await idsOnPageAfter(undefined, 4);

      expect(page.kitchens).toHaveLength(4);
      expect(page.nextCursor).toEqual({
        updatedAt: "2026-10-19T09:00:01.000000Z",
        id: "k1",
      });
    });

    it("continues exactly after the cursor, and total counts every listed kitchen on every page", async () => {
      const first = await idsOnPageAfter(undefined, 2);
      const second = await idsOnPageAfter(first.nextCursor ?? undefined, 2);
      const third = await idsOnPageAfter(second.nextCursor ?? undefined, 2);

      expect(
        [first, second, third].map((page) =>
          page.kitchens.map((kitchen) => kitchen.id),
        ),
      ).toEqual([["k4", "k3"], ["k2", "k1"], ["k0"]]);
      expect([first, second, third].map((page) => page.total)).toEqual([
        5, 5, 5,
      ]);
      expect(third.nextCursor).toBeNull();
    });

    it("a cursor naming a kitchen that has since been hidden still continues after that position", async () => {
      const first = await idsOnPageAfter(undefined, 2);
      store.seed({
        id: "k3",
        accountId: OWNER,
        design: KITCHEN_L_DESIGN,
        updatedAt: new Date(FIRST_INSTANT.getTime() + 3000),
        sentAt: FIRST_INSTANT,
        hiddenAt: FIRST_INSTANT,
      });

      const second = await idsOnPageAfter(first.nextCursor ?? undefined, 2);

      expect(second.kitchens.map((kitchen) => kitchen.id)).toEqual([
        "k2",
        "k1",
      ]);
      expect(second.total).toBe(4);
    });

    it("a cursor past the end gives an empty page that still reports the total", async () => {
      const page = await idsOnPageAfter(
        { updatedAt: "2000-01-01T00:00:00.000000Z", id: "a" },
        12,
      );

      expect(page).toEqual({
        kitchens: [],
        nextCursor: null,
        total: 5,
        skippedCount: 0,
      });
    });

    it("a tie on updated_at breaks by id in the cursor comparison", async () => {
      const tie = new Date("2026-11-01T00:00:00Z");
      for (const id of ["t1", "t2", "t3"]) seed(id, { updatedAt: tie });

      const first = await idsOnPageAfter(undefined, 1);
      const second = await idsOnPageAfter(first.nextCursor ?? undefined, 1);
      const third = await idsOnPageAfter(second.nextCursor ?? undefined, 1);

      expect(
        [first, second, third].map((page) => page.kitchens[0]?.id),
      ).toEqual(["t3", "t2", "t1"]);
    });
  });

  describe("refuses what the Neon store refuses, with a rejection", () => {
    it.each([0, 51, -3, 2.5, Number.NaN])(
      "a page size of %s",
      async (limit) => {
        await expect(
          store.listPage({ accountId: OWNER, limit }),
        ).rejects.toThrow(/page holds 1 to 50/);
      },
    );

    it("an account id of the wrong shape", async () => {
      await expect(
        store.listPage({ accountId: "short", limit: 12 }),
      ).rejects.toThrow(/account id/);
    });

    it("a cursor this store could not have issued", async () => {
      await expect(
        store.listPage({
          accountId: OWNER,
          limit: 12,
          after: { updatedAt: "yesterday", id: "a" },
        }),
      ).rejects.toThrow(/cursor/);
    });
  });

  describe("property: every page size from 1 to 50 walks each listed kitchen exactly once, newest first", () => {
    const idAlphabet = fc.constantFrom(..."abcdefgh01234_-".split(""));
    const aKitchen = fc.record({
      id: fc.string({ unit: idAlphabet, minLength: 1, maxLength: 4 }),
      owner: fc.constantFrom(OWNER, OWNER, OTHER_OWNER),
      slot: fc.integer({ min: 0, max: 3 }),
      isHidden: fc.boolean(),
      isDeleted: fc.boolean(),
      isSent: fc.boolean(),
    });

    it("holds for rows that share timestamps, a mix of owners and marks, and every limit", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(aKitchen, {
            selector: (row) => row.id,
            maxLength: 60,
          }),
          fc.integer({ min: 1, max: 50 }),
          async (rows, limit) => {
            const fresh = new FakeAccountKitchenStore({
              now: () => FIRST_INSTANT,
            });
            for (const row of rows) {
              fresh.seed({
                id: row.id,
                accountId: row.owner,
                design: KITCHEN_L_DESIGN,
                updatedAt: new Date(FIRST_INSTANT.getTime() + row.slot * 1000),
                ...(row.isSent ? { sentAt: FIRST_INSTANT } : {}),
                ...(row.isHidden ? { hiddenAt: FIRST_INSTANT } : {}),
                ...(row.isDeleted ? { deletedAt: FIRST_INSTANT } : {}),
              });
            }
            const eligible = rows
              .filter(
                (row) => row.owner === OWNER && !row.isHidden && !row.isDeleted,
              )
              .sort(
                (first, second) =>
                  second.slot - first.slot ||
                  (first.id < second.id ? 1 : first.id > second.id ? -1 : 0),
              )
              .map((row) => row.id);

            const walked: string[] = [];
            let after: KitchenCursor | undefined;
            let pageCount = 0;
            do {
              const page = await fresh.listPage({
                accountId: OWNER,
                limit,
                ...(after === undefined ? {} : { after }),
              });
              expect(page.total).toBe(eligible.length);
              expect(page.kitchens.length).toBeLessThanOrEqual(limit);
              walked.push(...page.kitchens.map((kitchen) => kitchen.id));
              after = page.nextCursor ?? undefined;
              pageCount += 1;
              if (pageCount > rows.length + 2) {
                throw new Error(
                  "the walk does not end: a cursor repeats a row",
                );
              }
            } while (after !== undefined);

            expect(walked).toEqual(eligible);
            expect(pageCount).toBe(
              Math.max(1, Math.ceil(eligible.length / limit)),
            );
          },
        ),
        { numRuns: 400 },
      );
    });
  });
});

describe("FakeAccountKitchenStore.rename", () => {
  it("sets the name and nothing else: the document, the instant and every mark stay", async () => {
    seed("k", {
      name: "Vechi",
      sentAt: FIRST_INSTANT,
      updatedAt: FIRST_INSTANT,
    });
    advanceClock();
    const before = store.held("k");

    expect(
      await store.rename({ accountId: OWNER, designId: "k", name: "Nou" }),
    ).toEqual({ kind: "renamed" });

    expect(store.held("k")).toEqual({ ...before, name: "Nou" });
    expect(store.held("k")?.updatedAt).toEqual(FIRST_INSTANT);
  });

  it("names a kitchen that never had a name", async () => {
    seed("k");

    await store.rename({ accountId: OWNER, designId: "k", name: "Prima" });

    expect(store.held("k")?.name).toBe("Prima");
  });

  it("is idempotent: the same rename answers renamed again", async () => {
    seed("k");

    const first = await store.rename({
      accountId: OWNER,
      designId: "k",
      name: "Casa",
    });
    const second = await store.rename({
      accountId: OWNER,
      designId: "k",
      name: "Casa",
    });

    expect([first, second]).toEqual([{ kind: "renamed" }, { kind: "renamed" }]);
  });

  it("answers one outcome, none, for a missing, foreign, hidden and deleted kitchen, and changes none", async () => {
    seed("foreign", { accountId: OTHER_OWNER, name: "Theirs" });
    seed("hidden", {
      name: "H",
      sentAt: FIRST_INSTANT,
      hiddenAt: FIRST_INSTANT,
    });
    seed("deleted", { name: "D", deletedAt: FIRST_INSTANT });
    const before = ["foreign", "hidden", "deleted"].map((id) => store.held(id));

    const outcomes = await Promise.all(
      ["missing", "foreign", "hidden", "deleted"].map((designId) =>
        store.rename({ accountId: OWNER, designId, name: "Intrus" }),
      ),
    );

    expect(outcomes).toEqual(
      Array.from({ length: 4 }, () => ({ kind: "none" })),
    );
    expect(
      ["foreign", "hidden", "deleted"].map((id) => store.held(id)),
    ).toEqual(before);
    expect(store.held("missing")).toBeUndefined();
  });

  it.each(["", "a\nb", "a​b", "a\u0000b", "a".repeat(121), "\uD800"])(
    "refuses the name %j with a rejection and leaves the kitchen alone",
    async (name) => {
      seed("k", { name: "Ramas" });

      await expect(
        store.rename({ accountId: OWNER, designId: "k", name }),
      ).rejects.toThrow(/Refusing to rename a kitchen/);

      expect(store.held("k")?.name).toBe("Ramas");
    },
  );

  it("refuses a name before it looks at ownership, so an invalid name is never answered none", async () => {
    await expect(
      store.rename({ accountId: OWNER, designId: "missing", name: "" }),
    ).rejects.toThrow();
  });

  it("refuses an account id of the wrong shape", async () => {
    await expect(
      store.rename({ accountId: "x", designId: "k", name: "A" }),
    ).rejects.toThrow(/account id/);
  });
});

describe("FakeAccountKitchenStore.duplicate", () => {
  it("copies a listed kitchen to a new row of the same account with a fresh id and no marks", async () => {
    seed("source", {
      name: "Sursa",
      sentAt: FIRST_INSTANT,
      updatedAt: new Date("2026-09-01T00:00:00Z"),
    });
    advanceClock();

    const outcome = await store.duplicate({
      accountId: OWNER,
      designId: "source",
      name: "Sursa (copie)",
    });

    expect(outcome.kind).toBe("duplicated");
    if (outcome.kind !== "duplicated") return;
    const copy = store.held(outcome.id);
    expect(outcome.id).not.toBe("source");
    expect(copy).toEqual({
      id: outcome.id,
      accountId: OWNER,
      design: KITCHEN_L_DESIGN,
      name: "Sursa (copie)",
      updatedAt: currentTime,
      sentAt: undefined,
      hiddenAt: undefined,
      deletedAt: undefined,
    });
    expect(copy?.design).not.toBe(store.held("source")?.design);
  });

  it("leaves the source exactly as it was", async () => {
    seed("source", { name: "Sursa", sentAt: FIRST_INSTANT });
    const before = store.held("source");

    await store.duplicate({
      accountId: OWNER,
      designId: "source",
      name: "Copie",
    });

    expect(store.held("source")).toEqual(before);
  });

  it("makes the copy listed, first in the list, and counts it", async () => {
    seed("source", { updatedAt: new Date("2026-09-01T00:00:00Z") });

    const outcome = await store.duplicate({
      accountId: OWNER,
      designId: "source",
      name: "Copie",
    });

    const page = await idsOnPageAfter(undefined, 12);
    expect(page.total).toBe(2);
    expect(page.kitchens[0]?.id).toBe(
      outcome.kind === "duplicated" ? outcome.id : "",
    );
  });

  it("gives every copy its own id", async () => {
    seed("source");
    const ids = new Set<string>();

    for (let count = 0; count < 50; count += 1) {
      const outcome = await store.duplicate({
        accountId: OWNER,
        designId: "source",
        name: "Copie",
      });
      if (outcome.kind === "duplicated") ids.add(outcome.id);
    }

    expect(ids.size).toBe(50);
  });

  it("answers none, and inserts nothing, for a missing, foreign, hidden and deleted source", async () => {
    seed("foreign", { accountId: OTHER_OWNER });
    seed("hidden", { sentAt: FIRST_INSTANT, hiddenAt: FIRST_INSTANT });
    seed("deleted", { deletedAt: FIRST_INSTANT });
    const exportedBefore = await store.exportAll(OWNER);

    const outcomes = await Promise.all(
      ["missing", "foreign", "hidden", "deleted"].map((designId) =>
        store.duplicate({ accountId: OWNER, designId, name: "Copie" }),
      ),
    );

    expect(outcomes).toEqual(
      Array.from({ length: 4 }, () => ({ kind: "none" })),
    );
    expect(await store.exportAll(OWNER)).toEqual(exportedBefore);
    expect(await store.countListed(OTHER_OWNER)).toBe(1);
  });

  it.each(["", "a".repeat(121), "x\ny"])(
    "refuses the name %j without inserting a row, so a suffix that overflows is the caller's to truncate",
    async (name) => {
      seed("source");

      await expect(
        store.duplicate({ accountId: OWNER, designId: "source", name }),
      ).rejects.toThrow(/Refusing to duplicate a kitchen/);

      expect(await store.countListed(OWNER)).toBe(1);
    },
  );

  it("stores a 120-character name as given, without truncating it", async () => {
    seed("source");
    const name = "n".repeat(120);

    const outcome = await store.duplicate({
      accountId: OWNER,
      designId: "source",
      name,
    });

    expect(
      outcome.kind === "duplicated" ? store.held(outcome.id)?.name : undefined,
    ).toBe(name);
  });
});

describe("FakeAccountKitchenStore.hide", () => {
  it("hides a sent kitchen of the account, marks it at the clock and revokes its share link at that instant", async () => {
    seed("k", { sentAt: FIRST_INSTANT });
    advanceClock();

    expect(await store.hide(mark("k"))).toEqual({ kind: "hidden" });

    expect(store.held("k")?.hiddenAt).toEqual(currentTime);
    expect(revocations).toEqual([{ designId: "k", at: currentTime }]);
  });

  it("takes the kitchen out of the list and the total but keeps it in the owner's export, flagged hidden", async () => {
    seed("k", { sentAt: FIRST_INSTANT });
    seed("stays");

    await store.hide(mark("k"));

    expect(
      (await idsOnPageAfter(undefined, 12)).kitchens.map(
        (kitchen) => kitchen.id,
      ),
    ).toEqual(["stays"]);
    const exported = await store.exportAll(OWNER);
    expect(
      exported.kind === "exported"
        ? exported.kitchens
            .map((kitchen) => [kitchen.id, kitchen.isHidden])
            .sort()
        : [],
    ).toEqual([
      ["k", true],
      ["stays", false],
    ]);
  });

  it("refuses an unsent kitchen of the account as not-sent, and changes and revokes nothing", async () => {
    seed("k");

    expect(await store.hide(mark("k"))).toEqual({ kind: "not-sent" });

    expect(store.held("k")?.hiddenAt).toBeUndefined();
    expect(revocations).toEqual([]);
  });

  it("answers none, and never not-sent, to an account that does not own the kitchen", async () => {
    seed("unsent-theirs", { accountId: OTHER_OWNER });
    seed("sent-theirs", { accountId: OTHER_OWNER, sentAt: FIRST_INSTANT });

    expect(await store.hide(mark("unsent-theirs"))).toEqual({ kind: "none" });
    expect(await store.hide(mark("sent-theirs"))).toEqual({ kind: "none" });
    expect(await store.hide(mark("missing"))).toEqual({ kind: "none" });

    expect(store.held("sent-theirs")?.hiddenAt).toBeUndefined();
    expect(revocations).toEqual([]);
  });

  it("answers none for a kitchen already hidden or deleted, so a repeat hides and revokes once", async () => {
    seed("k", { sentAt: FIRST_INSTANT });
    seed("gone", { sentAt: FIRST_INSTANT, deletedAt: FIRST_INSTANT });

    const first = await store.hide(mark("k"));
    const second = await store.hide(mark("k"));
    const deleted = await store.hide(mark("gone"));

    expect([first, second, deleted]).toEqual([
      { kind: "hidden" },
      { kind: "none" },
      { kind: "none" },
    ]);
    expect(revocations).toHaveLength(1);
  });

  it("does not touch the document, the name, the instant of the last edit or the sent mark", async () => {
    seed("k", {
      name: "Casa",
      sentAt: FIRST_INSTANT,
      updatedAt: FIRST_INSTANT,
    });
    advanceClock();
    const before = store.held("k");

    await store.hide(mark("k"));

    expect(store.held("k")).toEqual({ ...before, hiddenAt: currentTime });
  });

  it("revokes nothing when no revoke function was given, and still hides", async () => {
    const plain = new FakeAccountKitchenStore({ now: () => FIRST_INSTANT });
    plain.seed({
      id: "k",
      accountId: OWNER,
      design: KITCHEN_L_DESIGN,
      sentAt: FIRST_INSTANT,
    });

    expect(await plain.hide(mark("k"))).toEqual({ kind: "hidden" });
  });

  it("refuses an account id of the wrong shape", async () => {
    await expect(store.hide({ accountId: "x", designId: "k" })).rejects.toThrow(
      /account id/,
    );
  });
});

describe("FakeAccountKitchenStore.markDeleted", () => {
  it("deletes an unsent kitchen of the account, marks it at the clock and revokes its share link at that instant", async () => {
    seed("k");
    advanceClock();

    expect(await store.markDeleted(mark("k"))).toEqual({ kind: "deleted" });

    expect(store.held("k")?.deletedAt).toEqual(currentTime);
    expect(revocations).toEqual([{ designId: "k", at: currentTime }]);
  });

  it("removes it from the list, the count and the export, and keeps the row", async () => {
    seed("k");
    seed("stays");

    await store.markDeleted(mark("k"));

    expect(await store.countListed(OWNER)).toBe(1);
    const exported = await store.exportAll(OWNER);
    expect(
      exported.kind === "exported"
        ? exported.kitchens.map((kitchen) => kitchen.id)
        : [],
    ).toEqual(["stays"]);
    expect(store.held("k")).toBeDefined();
  });

  it("refuses a sent kitchen of the account as sent, and changes and revokes nothing", async () => {
    seed("k", { sentAt: FIRST_INSTANT });

    expect(await store.markDeleted(mark("k"))).toEqual({ kind: "sent" });

    expect(store.held("k")?.deletedAt).toBeUndefined();
    expect(revocations).toEqual([]);
  });

  it("answers none, and never sent, to an account that does not own the kitchen", async () => {
    seed("sent-theirs", { accountId: OTHER_OWNER, sentAt: FIRST_INSTANT });
    seed("unsent-theirs", { accountId: OTHER_OWNER });

    expect(await store.markDeleted(mark("sent-theirs"))).toEqual({
      kind: "none",
    });
    expect(await store.markDeleted(mark("unsent-theirs"))).toEqual({
      kind: "none",
    });
    expect(await store.markDeleted(mark("missing"))).toEqual({ kind: "none" });

    expect(store.held("unsent-theirs")?.deletedAt).toBeUndefined();
    expect(revocations).toEqual([]);
  });

  it("answers none for a hidden kitchen, even a sent one, and for one already deleted", async () => {
    seed("hidden", { sentAt: FIRST_INSTANT, hiddenAt: FIRST_INSTANT });
    seed("k");

    const hidden = await store.markDeleted(mark("hidden"));
    const first = await store.markDeleted(mark("k"));
    const second = await store.markDeleted(mark("k"));

    expect([hidden, first, second]).toEqual([
      { kind: "none" },
      { kind: "deleted" },
      { kind: "none" },
    ]);
    expect(revocations).toHaveLength(1);
  });

  it("does not touch the document, the name or the instant of the last edit", async () => {
    seed("k", { name: "Casa", updatedAt: FIRST_INSTANT });
    advanceClock();
    const before = store.held("k");

    await store.markDeleted(mark("k"));

    expect(store.held("k")).toEqual({ ...before, deletedAt: currentTime });
  });
});

describe("FakeSentMarkStore.markSent", () => {
  it("sets sent_at to the clock for an unsent kitchen and nothing else", async () => {
    seed("k", { name: "Casa", updatedAt: FIRST_INSTANT });
    advanceClock();
    const before = store.held("k");

    await sentMarks.markSent("k");

    expect(store.held("k")).toEqual({ ...before, sentAt: currentTime });
    expect(store.held("k")?.updatedAt).toEqual(FIRST_INSTANT);
  });

  it("keeps the first instant: a repeat after a lost acknowledgement changes nothing", async () => {
    seed("k");
    advanceClock();
    await sentMarks.markSent("k");
    const firstInstant = store.held("k")?.sentAt;
    advanceClock(60_000);

    await sentMarks.markSent("k");

    expect(store.held("k")?.sentAt).toEqual(firstInstant);
  });

  it("is a no-op for a kitchen hidden or deleted by its client, and for an unknown id, without throwing", async () => {
    seed("hidden", { hiddenAt: FIRST_INSTANT });
    seed("deleted", { deletedAt: FIRST_INSTANT });

    await sentMarks.markSent("hidden");
    await sentMarks.markSent("deleted");
    await sentMarks.markSent("never-existed");

    expect(store.held("hidden")?.sentAt).toBeUndefined();
    expect(store.held("deleted")?.sentAt).toBeUndefined();
    expect(store.held("never-existed")).toBeUndefined();
  });

  it("is not scoped by account: the contact flow marks a design whoever owns it", async () => {
    seed("theirs", { accountId: OTHER_OWNER });

    await sentMarks.markSent("theirs");

    expect(store.held("theirs")?.sentAt).toBeDefined();
  });

  it("makes the kitchen undeletable and hideable, and never clears the mark", async () => {
    seed("k");

    await sentMarks.markSent("k");

    expect(await store.markDeleted(mark("k"))).toEqual({ kind: "sent" });
    expect(await store.hide(mark("k"))).toEqual({ kind: "hidden" });
    expect(store.held("k")?.sentAt).toBeDefined();
  });
});

describe("FakeAccountKitchenStore export size", () => {
  function seedMany(
    count: number,
    overrides: Partial<Omit<SeededKitchen, "id">> = {},
  ): void {
    for (let index = 0; index < count; index += 1) {
      seed(`bulk-${String(index)}`, overrides);
    }
  }

  it("exports exactly MAX_EXPORTED_KITCHENS and refuses one more, whole", async () => {
    expect(MAX_EXPORTED_KITCHENS).toBe(200);
    seedMany(200);

    expect(await store.measureExport(OWNER)).toEqual({ kind: "within-bound" });
    const atTheBound = await store.exportAll(OWNER);
    expect(
      atTheBound.kind === "exported" ? atTheBound.kitchens.length : -1,
    ).toBe(200);

    seed("one-more");

    expect(await store.measureExport(OWNER)).toEqual({ kind: "too-many" });
    expect(await store.exportAll(OWNER)).toEqual({ kind: "too-many" });
  });

  it("counts a hidden kitchen towards the bound and does not count a deleted one", async () => {
    seedMany(199);
    seed("hidden", { sentAt: FIRST_INSTANT, hiddenAt: FIRST_INSTANT });
    seed("deleted-one", { deletedAt: FIRST_INSTANT });
    seed("deleted-two", { deletedAt: FIRST_INSTANT });
    expect(await store.measureExport(OWNER)).toEqual({ kind: "within-bound" });

    seed("another-hidden", { sentAt: FIRST_INSTANT, hiddenAt: FIRST_INSTANT });

    expect(await store.measureExport(OWNER)).toEqual({ kind: "too-many" });
  });

  it("does not count another account's kitchens", async () => {
    seedMany(201, { accountId: OTHER_OWNER });
    seed("mine");

    expect(await store.measureExport(OWNER)).toEqual({ kind: "within-bound" });
  });

  it("exports newest first, with name, flags and a copy of the document, and no owner", async () => {
    seed("old", { updatedAt: new Date("2026-01-01T00:00:00Z"), name: "Veche" });
    seed("new", {
      updatedAt: new Date("2026-02-01T00:00:00Z"),
      sentAt: FIRST_INSTANT,
    });

    const exported = await store.exportAll(OWNER);

    expect(exported).toEqual({
      kind: "exported",
      kitchens: [
        {
          id: "new",
          name: null,
          updatedAt: new Date("2026-02-01T00:00:00Z"),
          isSent: true,
          isHidden: false,
          design: KITCHEN_L_DESIGN,
        },
        {
          id: "old",
          name: "Veche",
          updatedAt: new Date("2026-01-01T00:00:00Z"),
          isSent: false,
          isHidden: false,
          design: KITCHEN_L_DESIGN,
        },
      ],
    });
    expect(JSON.stringify(exported)).not.toContain(OWNER);
  });
});

describe("share-link revocation and the marks are one step", () => {
  it("the revoke function sees the kitchen already marked", async () => {
    let seenHiddenAt: Date | undefined;
    const observing = new FakeAccountKitchenStore({
      now: () => FIRST_INSTANT,
      revokeShareLinksOf: (designId) => {
        seenHiddenAt = observing.held(designId)?.hiddenAt;
      },
    });
    observing.seed({
      id: "k",
      accountId: OWNER,
      design: KITCHEN_L_DESIGN,
      sentAt: FIRST_INSTANT,
    });

    await observing.hide(mark("k"));

    expect(seenHiddenAt).toEqual(FIRST_INSTANT);
  });
});
