import {
  DashboardStoreError,
  FakePriceNoticeStore,
  NeonPriceNoticeStore,
  type AcknowledgedPrices,
  type PriceNoticeStore,
} from "@lemnaria/persistence";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";

import { UNAVAILABLE_PRICE_NOTICE_STORE } from "@/lib/server/unavailable-price-stores";

import { AN_UNREACHABLE_DATABASE_URL } from "../../support/held-price-stores";

// Adds: the unavailable, fake and Neon notice stores refuse the same input with the same operation names.

const A_VALID_PAIR: AcknowledgedPrices = {
  versionId: "V".repeat(21),
  availabilityRevision: "0",
};
const A_BAD_DESIGN_ID = "D".repeat(20);

let neon: PriceNoticeStore;
let fake: PriceNoticeStore;

beforeEach(() => {
  neon = new NeonPriceNoticeStore(AN_UNREACHABLE_DATABASE_URL);
  fake = new FakePriceNoticeStore({
    priceBook: { hasHeldVersion: () => false } as never,
    availability: { head: { current: () => "0" } } as never,
  });
});

async function failureOf(attempt: Promise<unknown>): Promise<unknown> {
  return attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
}

function operationOf(failure: unknown): string {
  if (!(failure instanceof DashboardStoreError)) {
    throw new Error("expected a DashboardStoreError");
  }
  return failure.operation;
}

describe("the operations the unavailable store names", () => {
  it.each([
    [
      "reading a marker",
      (store: PriceNoticeStore) => store.readAcknowledged(A_BAD_DESIGN_ID),
    ],
    [
      "recording a first open",
      (store: PriceNoticeStore) =>
        store.recordIfAbsent(A_BAD_DESIGN_ID, A_VALID_PAIR),
    ],
    [
      "recording an acknowledgement",
      (store: PriceNoticeStore) =>
        store.recordAcknowledged(A_BAD_DESIGN_ID, A_VALID_PAIR),
    ],
  ])(
    "are those the database store names when it refuses %s",
    async (_description, call) => {
      const neonOperation = operationOf(await failureOf(call(neon)));
      const unavailableFailure = await failureOf(
        call(UNAVAILABLE_PRICE_NOTICE_STORE),
      );

      expect(unavailableFailure).toMatchObject({
        failure: "unavailable",
        operation: neonOperation,
      });
      expect(operationOf(await failureOf(call(fake)))).toBe(neonOperation);
    },
  );
});

describe("what the database store refuses before any statement, the seeded fake refuses too", () => {
  const text = fc.oneof(
    fc.string({ maxLength: 26 }),
    fc.stringMatching(/^[A-Za-z0-9_-]{19,23}$/),
    fc.stringMatching(/^[0-9]{0,21}$/),
    fc.constantFrom(
      "0",
      "1",
      "01",
      "-1",
      "9223372036854775807",
      "9223372036854775808",
    ),
  );

  it("refuses the same design ids, versions and revisions with the same failure and operation", async () => {
    await fc.assert(
      fc.asyncProperty(
        text,
        text,
        text,
        async (designId, versionId, revision) => {
          const pair = { versionId, availabilityRevision: revision };
          const refusedByFake = await failureOf(
            fake.recordIfAbsent(designId, pair),
          );
          if (!(refusedByFake instanceof DashboardStoreError)) return;

          const refusedByNeon = await failureOf(
            neon.recordIfAbsent(designId, pair),
          );

          expect(refusedByNeon).toBeInstanceOf(DashboardStoreError);
          expect(refusedByNeon).toMatchObject({
            failure: refusedByFake.failure,
            operation: refusedByFake.operation,
          });
        },
      ),
    );
  });

  it("refuses what the fake refuses on an acknowledgement as well", async () => {
    await fc.assert(
      fc.asyncProperty(
        text,
        text,
        text,
        async (designId, versionId, revision) => {
          const pair = { versionId, availabilityRevision: revision };
          const refusedByFake = await failureOf(
            fake.recordAcknowledged(designId, pair),
          );
          if (!(refusedByFake instanceof DashboardStoreError)) return;

          const refusedByNeon = await failureOf(
            neon.recordAcknowledged(designId, pair),
          );

          expect(refusedByNeon).toMatchObject({
            failure: refusedByFake.failure,
            operation: refusedByFake.operation,
          });
        },
      ),
    );
  });
});
