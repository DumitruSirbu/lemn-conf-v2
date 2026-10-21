import { fc } from "@fast-check/vitest";
import type { StaffKitchenQuery } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { FakeStaffKitchenReader } from "../src/fake-staff-kitchen-reader.js";
import {
  CURRENT_DESIGN,
  describeStaffKitchenReaderContract,
} from "./support/staff-kitchen-reader-contract.js";
import type {
  ClientAccount,
  KitchenWorld,
  StaffAccount,
} from "./support/staff-kitchen-reader-contract.js";

interface DesignMarks {
  readonly hasAccount: boolean;
  readonly isSent: boolean;
  readonly isHidden: boolean;
  readonly isDeleted: boolean;
  readonly minute: number;
}

const ERA_START = Date.UTC(2999, 0, 1);
const ONE_DAY_MS = 86_400_000;
const PAGE_SIZE = 20;
const MAXIMUM_KITCHENS = 200;
const MARKER_LENGTH = 12;
const ID_PREFIX_LENGTH = 20;
const UPPER_CASE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomText(alphabet: string, length: number): string {
  return Array.from(
    { length },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

function newFakeWorld(): KitchenWorld & {
  readonly fake: FakeStaffKitchenReader;
} {
  const fake = new FakeStaffKitchenReader();
  const marker = randomText(
    "abcdefghijklmnopqrstuvwxyz0123456789",
    MARKER_LENGTH,
  );
  let eraCount = 0;
  let accountCount = 0;
  let requestCount = 0;

  function anEmail(): string {
    accountCount += 1;
    return `Mixed.${marker}.${String(accountCount)}@Example.INVALID`;
  }

  return {
    fake,
    marker,
    idPrefix: randomText(UPPER_CASE_LETTERS, ID_PREFIX_LENGTH),
    reader: fake,
    nextEra: () => new Date(ERA_START + ONE_DAY_MS * eraCount++),
    aClient(spec = {}): Promise<ClientAccount> {
      const accountId = nanoid();
      const client: ClientAccount = {
        accountId,
        email: anEmail(),
        name: spec.name === undefined ? `Name ${marker}` : spec.name,
        phone: spec.phone === undefined ? null : spec.phone,
      };
      fake.plantAccount({
        id: accountId,
        email: client.email,
        name: client.name,
        phone: client.phone,
      });
      return Promise.resolve(client);
    },
    aStaffMember(): Promise<StaffAccount> {
      const staff = {
        accountId: nanoid(),
        email: anEmail(),
        name: "Staff Name",
      };
      fake.plantAccount({
        id: staff.accountId,
        email: staff.email,
        name: staff.name,
        phone: null,
      });
      return Promise.resolve(staff);
    },
    aKitchen(spec): Promise<string> {
      const id = spec.id ?? nanoid();
      fake.plantKitchen({
        id,
        name: spec.name ?? null,
        design: spec.document === "unreadable" ? null : CURRENT_DESIGN,
        accountId: spec.client?.accountId ?? null,
        sentAt: spec.sentAt ?? null,
        updatedAt: spec.updatedAt,
        isHidden: spec.isHidden ?? false,
        isDeletedByClient: spec.isDeletedByClient ?? false,
      });
      return Promise.resolve(id);
    },
    aRequest(spec) {
      requestCount += 1;
      const clientRequestId = spec.clientRequestId ?? nanoid();
      const reference = `REF-${marker.toUpperCase()}-${String(requestCount)}`;
      fake.plantRequest({
        clientRequestId,
        designId: spec.designId,
        reference,
        createdAt: spec.createdAt,
      });
      return Promise.resolve({ clientRequestId, reference });
    },
    aSentCopy(spec): Promise<void> {
      fake.plantSentCopy({
        clientRequestId: spec.clientRequestId,
        createdAt: spec.createdAt,
        isRevoked: spec.isRevoked ?? false,
        design: spec.design === "unreadable" ? null : spec.design,
      });
      return Promise.resolve();
    },
    aStatus(spec): Promise<void> {
      fake.plantStatus({
        designId: spec.designId,
        status: spec.status,
        changedByAccountId: spec.changedBy.accountId,
        changedAt: spec.changedAt,
      });
      return Promise.resolve();
    },
    aNote(spec): Promise<string> {
      const id = spec.id ?? nanoid();
      fake.plantNote({
        id,
        designId: spec.designId,
        authorAccountId: spec.author.accountId,
        text: spec.text,
        createdAt: spec.createdAt,
      });
      return Promise.resolve(id);
    },
    removeAccount(accountId): Promise<void> {
      fake.removeAccount(accountId);
      return Promise.resolve();
    },
  };
}

describeStaffKitchenReaderContract("FakeStaffKitchenReader", () =>
  Promise.resolve(newFakeWorld()),
);

describe("FakeStaffKitchenReader: the whole list of an isolated world", () => {
  /** Every combination of the four marks a design can carry, as K-9 draws them. */
  const designMarks: fc.Arbitrary<DesignMarks> = fc.record({
    hasAccount: fc.boolean(),
    isSent: fc.boolean(),
    isHidden: fc.boolean(),
    isDeleted: fc.boolean(),
    minute: fc.integer({ min: 0, max: 6 }),
  });

  function plantMarks(marks: readonly DesignMarks[]) {
    const fake = new FakeStaffKitchenReader();
    fake.plantAccount({
      id: "A".repeat(21),
      email: "client@example.invalid",
      name: null,
      phone: null,
    });
    const base = Date.UTC(2026, 9, 1);
    const kitchens = marks.map((mark, index) => ({
      id: `kitchen-${String(index).padStart(4, "0")}`,
      mark,
      instant: new Date(base + mark.minute * 60_000),
    }));
    for (const { id, mark, instant } of kitchens) {
      fake.plantKitchen({
        id,
        name: null,
        design: CURRENT_DESIGN,
        accountId: mark.hasAccount ? "A".repeat(21) : null,
        sentAt: mark.isSent ? instant : null,
        updatedAt: instant,
        isHidden: mark.isHidden,
        isDeletedByClient: mark.isDeleted,
      });
    }
    return { fake, kitchens };
  }

  async function allPagesOf(
    fake: FakeStaffKitchenReader,
    query: StaffKitchenQuery,
  ) {
    const first = await fake.listPage({ ...query, page: 1 });
    const ids = first.kitchens.map((kitchen) => kitchen.id);
    for (let page = 2; ids.length < first.total; page += 1) {
      const next = await fake.listPage({ ...query, page });
      ids.push(...next.kitchens.map((kitchen) => kitchen.id));
    }
    return { ids, total: first.total };
  }

  it("is, for any 200 designs and each segment, every page in order with no repeat and no omission, and the total", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(designMarks, { maxLength: MAXIMUM_KITCHENS }),
        fc.constantFrom("sent", "drafts", "all"),
        async (marks, segment) => {
          const { fake, kitchens } = plantMarks(marks);
          const expected = kitchens
            .filter(
              ({ mark }) =>
                !mark.isDeleted && isInExpectedSegment(mark, segment),
            )
            .sort((left, right) => {
              const byTime = right.instant.getTime() - left.instant.getTime();
              return byTime !== 0 ? byTime : left.id > right.id ? -1 : 1;
            })
            .map(({ id }) => id);

          const walked = await allPagesOf(fake, {
            segment,
            status: null,
            search: null,
            page: 1,
          });

          expect(walked.ids).toEqual(expected);
          expect(walked.total).toBe(expected.length);
          expect(new Set(walked.ids).size).toBe(walked.ids.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("never holds a page of more than twenty kitchens", async () => {
    const { fake } = plantMarks(
      Array.from({ length: 45 }, () => ({
        hasAccount: true,
        isSent: true,
        isHidden: false,
        isDeleted: false,
        minute: 0,
      })),
    );

    const page = await fake.listPage({
      segment: "sent",
      status: null,
      search: null,
      page: 3,
    });

    expect(page.kitchens).toHaveLength(45 - 2 * PAGE_SIZE);
    expect(page.total).toBe(45);
  });
});

function isInExpectedSegment(
  mark: { readonly hasAccount: boolean; readonly isSent: boolean },
  segment: "sent" | "drafts" | "all",
): boolean {
  if (segment === "sent") return mark.isSent;
  if (segment === "drafts") return !mark.isSent && mark.hasAccount;
  return mark.isSent || mark.hasAccount;
}
