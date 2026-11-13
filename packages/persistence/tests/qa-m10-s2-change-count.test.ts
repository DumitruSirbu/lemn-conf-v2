import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  BOOK_FIELD_ADDRESS_KINDS,
  countPendingPrices,
} from "@lemnaria/configurator-domain";
import type { DraftChange } from "@lemnaria/configurator-domain";

import { storablePublishOf } from "../src/dashboard-store-shapes.js";
import type {
  PricePublishedAuditInput,
  PublishAuditRecord,
  PublishPriceBookRequest,
} from "../src/m10-ports.js";
import { listVersionsStatement } from "../src/price-book-statements.js";
import {
  ACCESSORY_IDS,
  changeSummaryArbitrary,
} from "./support/change-summary-arbitrary.js";
import {
  A_BOOK,
  aBookLinking,
  dashboardFailureOf,
  deletedItemsOfSummary,
  publishNextVersion,
  publishRequestFor,
} from "./support/dashboard-contract-support.js";
import { newFakeDashboardWorld } from "./support/fake-dashboard-world.js";

const PROPERTY_RUNS = 300;

/** The book every publish here stores and the one it seeds: it states each accessory a summary can delete. */
const STATING_BOOK = aBookLinking(ACCESSORY_IDS);

/** A publish of the summary, over an active version that states what the summary may delete. */
function requestOf(
  world: ReturnType<typeof newFakeDashboardWorld>,
  staff: Awaited<ReturnType<typeof world.aStaffMember>>,
  summary: readonly DraftChange[],
) {
  return publishRequestFor(world.priceBook, world.availability, staff, {
    changeSummary: summary,
    deletedItems: deletedItemsOfSummary(summary),
    book: STATING_BOOK,
  });
}

async function publishedBy(summary: readonly DraftChange[]) {
  const world = newFakeDashboardWorld();
  const seeder = await world.aStaffMember();
  await publishNextVersion(
    world.priceBook,
    world.availability,
    seeder,
    STATING_BOOK,
  );
  const staff = await world.aStaffMember();
  const request = await requestOf(world, staff, summary);
  const result = await world.priceBook.publish(request);
  const listed = await world.priceBook.listVersions({ page: 1 });
  const audit = await world.auditEventsOf(staff.accountId);
  return { request, result, listed, audit };
}

describe("the generated summaries reach the cases the count exists for", () => {
  const drawn = fc.sample(changeSummaryArbitrary, { numRuns: 600, seed: 7 });

  it("draw every address kind", () => {
    const kinds = new Set(
      drawn.flatMap((summary) =>
        summary.map((change) => (change.address as { kind: string }).kind),
      ),
    );

    expect([...kinds].sort()).toEqual([...BOOK_FIELD_ADDRESS_KINDS].sort());
  });

  it("often hold a count that differs from the length, and the empty summary", () => {
    const differing = drawn.filter(
      (summary) => countPendingPrices(summary) !== summary.length,
    );

    expect(differing.length).toBeGreaterThan(drawn.length / 5);
    expect(drawn.some((summary) => summary.length === 0)).toBe(true);
  });
});

describe("one publish, one number: the list, the stored count and the audit row agree with the rule", () => {
  it("agrees with the rule over arbitrary summaries of every address kind (the fake)", async () => {
    await fc.assert(
      fc.asyncProperty(changeSummaryArbitrary, async (summary) => {
        const { request, result, listed, audit } = await publishedBy(summary);
        const counted = countPendingPrices(summary);
        const stored = storablePublishOf(request)?.changeCount;
        const stamped = audit.map(
          ({ detail }) => (detail as { changeCount?: number }).changeCount,
        );

        expect(result.kind).toBe("ok");
        expect(listed.versions[0]?.changeCount).toBe(counted);
        expect(stored).toBe(counted);
        expect(stamped).toEqual([counted]);
        expect(counted === 0).toBe(summary.length === 0);
        expect(counted).toBeLessThanOrEqual(summary.length);
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("keeps a version's count when later versions are published with other summaries", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(changeSummaryArbitrary, { minLength: 1, maxLength: 4 }),
        async (summaries) => {
          const world = newFakeDashboardWorld();
          const staff = await world.aStaffMember();
          await publishNextVersion(
            world.priceBook,
            world.availability,
            staff,
            STATING_BOOK,
          );
          for (const summary of summaries) {
            await world.priceBook.publish(
              await requestOf(world, staff, summary),
            );
          }

          const listed = await world.priceBook.listVersions({ page: 1 });

          expect(listed.versions.map(({ changeCount }) => changeCount)).toEqual(
            [...summaries.map(countPendingPrices).reverse(), 0],
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("a publish request names no count", () => {
  const baseRequest = {
    expectedDraftRevision: "1",
    expectedActiveSequence: 0,
    expectedAvailabilityRevision: "1",
    label: "L",
    note: "",
    book: A_BOOK,
    changeSummary: [],
    createdItems: [],
  } as const;

  it("accepts no count or sequence number from a caller, in the request or in the audit detail", () => {
    ({
      ...baseRequest,
      audit: {} as PublishAuditRecord,
      // @ts-expect-error the store counts the prices; a request has no place to carry the count
      changeCount: 3,
    }) satisfies PublishPriceBookRequest;
    ({
      action: "price-published",
      // @ts-expect-error the audit row's count is stamped from the stored column, never supplied
      detail: { provisional: true, changeCount: 3 },
    }) satisfies PricePublishedAuditInput;
    ({
      action: "price-published",
      // @ts-expect-error the audit row's sequence number is stamped from the inserted version, never supplied
      detail: { provisional: true, sequenceNumber: 3 },
    }) satisfies PricePublishedAuditInput;
  });
});

describe("the count is never derived again from the stored summary", () => {
  it("names change_summary in no part of the listing statement", () => {
    const textOf = (strings: TemplateStringsArray) => strings.join("?");

    const text = listVersionsStatement(textOf, { offset: 0, limit: 10 });

    expect(text).toContain("change_count");
    expect(text).not.toContain("change_summary");
  });
});

const ANCHOR: DraftChange = {
  address: { kind: "cabinet", ruleId: "cabinet.base", field: "anchorMinor" },
  value: 5_000,
};
const HARDWARE_ROW = { kind: "hardware", tierId: "t1" };
const deletionOf = (item: unknown) => ({
  address: { kind: "item-deleted", item },
  value: true,
});

async function aPublishOf(changeSummary: unknown) {
  const world = newFakeDashboardWorld();
  const staff = await world.aStaffMember();
  const request = await publishRequestFor(
    world.priceBook,
    world.availability,
    staff,
    { changeSummary },
  );
  return { world, staff, request };
}

describe("a summary entry that is no object (FakePriceBookStore)", () => {
  it.each([
    ["null", [null]],
    ["undefined, which JSON stores as null", [undefined]],
    ["null among real changes", [ANCHOR, null, ANCHOR]],
  ])(
    "is refused as invalid-request, and wrote no version and no audit row: %s",
    async (_name, changeSummary) => {
      const { world, staff, request } = await aPublishOf(changeSummary);

      await dashboardFailureOf(
        world.priceBook.publish(request),
        "invalid-request",
      );

      expect(await world.priceBook.listVersions({ page: 1 })).toMatchObject({
        total: 0,
      });
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
      expect(await world.priceBook.readDraft()).toMatchObject({
        draftRevision: request.expectedDraftRevision,
      });
    },
  );

  it.each([
    ["a deletion naming no row", [deletionOf(null)]],
    [
      "a deletion naming no row after one that names a row",
      [deletionOf(HARDWARE_ROW), deletionOf(null)],
    ],
    [
      "the text of a created row naming no row",
      [
        {
          address: { kind: "hardware-tier-created", tierId: "t1" },
          value: { name: "N", description: "D" },
        },
        {
          address: { kind: "created-row-text", item: null, field: "name" },
          value: "words",
        },
      ],
    ],
    ["a deletion whose item is a string", [deletionOf("hardware")]],
    [
      "a deletion whose item has a kind no row has",
      [deletionOf({ kind: "bogus" }), ANCHOR],
    ],
  ])(
    "is refused, or counted as no more prices than the summary has entries: %s",
    async (_name, changeSummary) => {
      const { world, request } = await aPublishOf(changeSummary);

      const outcome = await world.priceBook.publish(request).then(
        () => "published" as const,
        (failure: unknown) => failure,
      );

      if (outcome === "published") {
        const listed = await world.priceBook.listVersions({ page: 1 });
        expect(listed.versions[0]?.changeCount).toBeLessThanOrEqual(
          changeSummary.length,
        );
      } else {
        await dashboardFailureOf(
          Promise.reject(outcome as Error),
          "invalid-request",
        );
      }
    },
  );
});

describe("the count of any JSON a summary may hold", () => {
  const anyJson = fc.jsonValue();
  const addressLike = fc.record(
    {
      kind: fc.constantFrom(...BOOK_FIELD_ADDRESS_KINDS, "bogus"),
      item: anyJson,
      tierId: anyJson,
      accessoryId: anyJson,
    },
    { requiredKeys: ["kind"] },
  );
  const entry = fc.oneof(
    anyJson,
    fc.record({ address: fc.oneof(anyJson, addressLike), value: anyJson }),
  );

  it("never throws and never exceeds the number of entries", () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 12 }), (entries) => {
        const summary = entries as unknown as readonly DraftChange[];

        const counted = countPendingPrices(summary);

        expect(counted).toBeLessThanOrEqual(summary.length);
        expect(counted === 0).toBe(summary.length === 0);
      }),
      { numRuns: 1_000 },
    );
  });
});

/**
 * The rule as a person states it, written without the domain's lookups: a row the draft creates or deletes is one price
 * together with every change that is about it; each other change is a price of its own.
 */
function referenceCountOf(summary: readonly DraftChange[]): number {
  const rowOf = (change: DraftChange): string | undefined => {
    const address = change.address as unknown as Record<string, unknown> & {
      item?: { kind: string; tierId?: string; accessoryId?: string };
    };
    switch (address["kind"]) {
      case "hardware-tier-created":
      case "hardware":
        return `hardware/${String(address["tierId"])}`;
      case "material":
        return `material/${String(address["tierId"])}`;
      case "accessory-created":
      case "accessory":
        return `accessory/${String(address["accessoryId"])}`;
      case "created-row-text":
      case "item-deleted": {
        const { item } = address as { item: Record<string, string> };
        const id = item["tierId"] ?? item["accessoryId"];
        return `${String(item["kind"])}/${String(id)}`;
      }
      default:
        return undefined;
    }
  };
  const changedRows = new Set(
    summary
      .filter(({ address }) =>
        ["hardware-tier-created", "accessory-created", "item-deleted"].includes(
          address.kind,
        ),
      )
      .map(rowOf),
  );
  const aboutNoChangedRow = summary.filter((change) => {
    const row = rowOf(change);
    return row === undefined || !changedRows.has(row);
  });
  return aboutNoChangedRow.length + changedRows.size;
}

describe("the count of a valid summary", () => {
  it("equals the rule stated plainly, for any summary of any address kind", () => {
    fc.assert(
      fc.property(changeSummaryArbitrary, (summary) => {
        expect(countPendingPrices(summary)).toBe(referenceCountOf(summary));
      }),
      { numRuns: 2_000 },
    );
  });
});
