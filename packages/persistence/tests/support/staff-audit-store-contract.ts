import { STAFF_AUDIT_ACTIONS } from "@lemnaria/configurator-domain";
import type { StaffAuditEntry } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import {
  MAX_STAFF_AUDIT_PAGE,
  STAFF_AUDIT_PAGE_SIZE,
  StaffAuditStoreError,
} from "../../src/staff-audit-store.js";
import type {
  StaffAuditPageRequest,
  StaffAuditPageRow,
  StaffAuditStore,
  StaffAuditStoreFailure,
} from "../../src/staff-audit-store.js";
import { rejectionOf } from "./rejection-of.js";

/** A staff member the world has signed in: the account, and the session the store takes the actor from. */
export interface StaffMember {
  readonly accountId: string;
  readonly email: string;
  readonly name: string;
  readonly sessionTokenHash: string;
  readonly idleLifetimeSeconds: {
    client: number;
    operator: number;
    administrator: number;
  };
}

export interface ClientAccount {
  readonly accountId: string;
  readonly email: string;
}

export interface Kitchen {
  readonly designId: string;
  readonly name: string | null;
  readonly client: ClientAccount | null;
}

export interface PlantedEvent {
  readonly occurredAt: Date;
  readonly actorAccountId: string;
  readonly action: string;
  readonly designId?: string | null;
  readonly subjectAccountId?: string | null;
  /** What the column holds: `null` is SQL null. */
  readonly detail?: Readonly<Record<string, unknown>> | null;
  /** Defaults to a fresh id. */
  readonly id?: string;
}

/** A row as stored, read around the store. */
export interface StoredEvent {
  readonly id: string;
  readonly actorAccountId: string;
  readonly action: string;
  readonly designId: string | null;
  readonly subjectAccountId: string | null;
  readonly isDetailSqlNull: boolean;
  readonly detail: unknown;
}

/**
 * What the contract needs of a store's surroundings. The fake and the live test database each build one, so the same
 * assertions run against both and a difference between the two is a failing test, not a footnote.
 */
export interface AuditWorld {
  readonly store: StaffAuditStore;
  aStaffMember(): Promise<StaffMember>;
  aStaffMemberWhoseSessionIsRevoked(): Promise<StaffMember>;
  aClient(): Promise<ClientAccount>;
  /** A kitchen, owned by `client` or by no account; `isDeletedByClient` marks it deleted by its client. */
  aKitchen(spec: {
    readonly client: ClientAccount | null;
    readonly name: string | null;
    readonly isDeletedByClient?: boolean;
  }): Promise<Kitchen>;
  /** Writes a row the way a script around the store would, with any action of the table's shape. */
  plantEvent(event: PlantedEvent): Promise<string>;
  storedEventsOf(actorAccountId: string): Promise<readonly StoredEvent[]>;
  /** Removes the account, as an erasure would, leaving every audit row that names it. */
  removeAccount(accountId: string): Promise<void>;
}

const STATUS_CHANGED: StaffAuditEntry = {
  action: "status-changed",
  detail: { from: "new", to: "contacted" },
};
const FIRST_INSTANT = Date.parse("2026-10-01T09:00:00.000Z");
const ONE_MINUTE_MS = 60_000;
const ROWS_ACROSS_TWO_PAGES = 27;

/** Ids that differ in their first letter only, so every collation sorts them alike. */
function letterId(letter: string): string {
  return letter.repeat(21);
}

function entryOf(action: string): StaffAuditEntry {
  return action === "status-changed"
    ? STATUS_CHANGED
    : ({ action, detail: null } as StaffAuditEntry);
}

function pageRequestFor(
  member: StaffMember,
  overrides: Partial<StaffAuditPageRequest> = {},
): StaffAuditPageRequest {
  return {
    actorAccountId: member.accountId,
    action: null,
    occurredFrom: null,
    occurredBefore: null,
    page: 1,
    ...overrides,
  };
}

async function failureOf(
  pending: PromiseLike<unknown>,
): Promise<StaffAuditStoreError> {
  const failure = await rejectionOf(pending);
  expect(failure).toBeInstanceOf(StaffAuditStoreError);
  return failure as StaffAuditStoreError;
}

export function describeStaffAuditStoreContract(
  suiteName: string,
  newWorld: () => Promise<AuditWorld>,
): void {
  describe(`${suiteName}: record`, () => {
    it("writes one row for the actor of the session it was given and for no other staff member", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const bystander = await world.aStaffMember();
      const kitchen = await world.aKitchen({ client: null, name: null });

      await world.store.record({
        sessionTokenHash: actor.sessionTokenHash,
        idleLifetimeSeconds: actor.idleLifetimeSeconds,
        entry: entryOf("kitchen-opened"),
        designId: kitchen.designId,
        subjectAccountId: null,
      });

      expect(await world.storedEventsOf(actor.accountId)).toHaveLength(1);
      expect(await world.storedEventsOf(bystander.accountId)).toHaveLength(0);
    });

    it("stores the subject account it was given and still takes the actor from the session", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const subject = await world.aClient();
      const kitchen = await world.aKitchen({ client: subject, name: null });

      await world.store.record({
        sessionTokenHash: actor.sessionTokenHash,
        idleLifetimeSeconds: actor.idleLifetimeSeconds,
        entry: entryOf("kitchen-unhidden"),
        designId: kitchen.designId,
        subjectAccountId: subject.accountId,
      });

      expect(await world.storedEventsOf(actor.accountId)).toMatchObject([
        { subjectAccountId: subject.accountId },
      ]);
      expect(await world.storedEventsOf(subject.accountId)).toHaveLength(0);
    });

    it.each(STAFF_AUDIT_ACTIONS)(
      "stores %s with its design and, where it has none, a SQL-null detail",
      async (action) => {
        const world = await newWorld();
        const actor = await world.aStaffMember();
        const kitchen = await world.aKitchen({ client: null, name: null });

        await world.store.record({
          sessionTokenHash: actor.sessionTokenHash,
          idleLifetimeSeconds: actor.idleLifetimeSeconds,
          entry: entryOf(action),
          designId: kitchen.designId,
          subjectAccountId: null,
        });

        const [stored] = await world.storedEventsOf(actor.accountId);
        expect(stored).toMatchObject({
          action,
          designId: kitchen.designId,
          subjectAccountId: null,
        });
        if (action === "status-changed") {
          expect(stored?.detail).toEqual({ from: "new", to: "contacted" });
        } else {
          expect(stored?.isDetailSqlNull).toBe(true);
        }
      },
    );

    it.each(STAFF_AUDIT_ACTIONS)(
      "refuses %s without a design and stores nothing",
      async (action) => {
        const world = await newWorld();
        const actor = await world.aStaffMember();

        const failure = await failureOf(
          world.store.record({
            sessionTokenHash: actor.sessionTokenHash,
            idleLifetimeSeconds: actor.idleLifetimeSeconds,
            entry: entryOf(action),
            designId: null,
            subjectAccountId: null,
          }),
        );

        expect([failure.failure, failure.refusal]).toEqual([
          "invalid-record",
          "DESIGN_ID_MISSING",
        ]);
        expect(await world.storedEventsOf(actor.accountId)).toHaveLength(0);
      },
    );

    it("throws not-recorded for a session that is not live and stores nothing", async () => {
      const world = await newWorld();
      const revoked = await world.aStaffMemberWhoseSessionIsRevoked();
      const kitchen = await world.aKitchen({ client: null, name: null });

      const failure = await failureOf(
        world.store.record({
          sessionTokenHash: revoked.sessionTokenHash,
          idleLifetimeSeconds: revoked.idleLifetimeSeconds,
          entry: entryOf("kitchen-opened"),
          designId: kitchen.designId,
          subjectAccountId: null,
        }),
      );

      expect(failure.failure satisfies StaffAuditStoreFailure).toBe(
        "not-recorded",
      );
      expect(await world.storedEventsOf(revoked.accountId)).toHaveLength(0);
    });

    it("throws not-recorded for a session hash no session holds", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();

      const failure = await failureOf(
        world.store.record({
          sessionTokenHash: "0".repeat(64),
          idleLifetimeSeconds: actor.idleLifetimeSeconds,
          entry: entryOf("kitchen-opened"),
          designId: nanoid(),
          subjectAccountId: null,
        }),
      );

      expect(failure.failure).toBe("not-recorded");
    });
  });

  describe(`${suiteName}: page`, () => {
    it("lists newest first, the later id first among rows of one instant", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const at = (minutes: number) =>
        new Date(FIRST_INSTANT + minutes * ONE_MINUTE_MS);
      const idOldest = await plant(world, actor, at(0), letterId("x"));
      const idTieLow = await plant(world, actor, at(5), letterId("b"));
      const idTieHigh = await plant(world, actor, at(5), letterId("c"));
      const idNewest = await plant(world, actor, at(9), letterId("y"));

      const page = await world.store.page(pageRequestFor(actor));

      expect(page.events.map(({ id }) => id)).toEqual([
        idNewest,
        idTieHigh,
        idTieLow,
        idOldest,
      ]);
    });

    it("counts the whole match and pages by 25: 27 rows are 25 and 2, and a third page is empty with the total", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      for (let minute = 0; minute < ROWS_ACROSS_TWO_PAGES; minute += 1) {
        await plant(
          world,
          actor,
          new Date(FIRST_INSTANT + minute * ONE_MINUTE_MS),
        );
      }

      const [first, second, third] = await Promise.all(
        [1, 2, 3].map((page) =>
          world.store.page(pageRequestFor(actor, { page })),
        ),
      );

      expect([first?.total, second?.total, third?.total]).toEqual([
        ROWS_ACROSS_TWO_PAGES,
        ROWS_ACROSS_TWO_PAGES,
        ROWS_ACROSS_TWO_PAGES,
      ]);
      expect([
        first?.events.length,
        second?.events.length,
        third?.events.length,
      ]).toEqual([
        STAFF_AUDIT_PAGE_SIZE,
        ROWS_ACROSS_TWO_PAGES - STAFF_AUDIT_PAGE_SIZE,
        0,
      ]);
      expect([first?.page, first?.pageSize]).toEqual([
        1,
        STAFF_AUDIT_PAGE_SIZE,
      ]);
      const ids = [...(first?.events ?? []), ...(second?.events ?? [])].map(
        ({ id }) => id,
      );
      expect(new Set(ids).size).toBe(ROWS_ACROSS_TWO_PAGES);
    });

    it("filters by actor, so another staff member's rows are not in the page or the total", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const other = await world.aStaffMember();
      await plant(world, actor, new Date(FIRST_INSTANT));
      await plant(world, other, new Date(FIRST_INSTANT));

      const page = await world.store.page(pageRequestFor(other));

      expect(page.total).toBe(1);
      expect(page.events.map(({ actor: ref }) => ref.id)).toEqual([
        other.accountId,
      ]);
    });

    it("filters by action", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      await plant(
        world,
        actor,
        new Date(FIRST_INSTANT),
        undefined,
        "note-added",
      );
      await plant(
        world,
        actor,
        new Date(FIRST_INSTANT),
        undefined,
        "kitchen-opened",
      );

      const page = await world.store.page(
        pageRequestFor(actor, { action: "note-added" }),
      );

      expect(page.events.map(({ reading }) => reading)).toEqual([
        { kind: "recognised", entry: { action: "note-added", detail: null } },
      ]);
      expect(page.total).toBe(1);
    });

    it("includes the instant a range starts at and excludes the instant it ends at", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const start = new Date(FIRST_INSTANT);
      const end = new Date(FIRST_INSTANT + 24 * 60 * ONE_MINUTE_MS);
      const justBefore = await plant(
        world,
        actor,
        new Date(start.getTime() - 1),
      );
      const atStart = await plant(world, actor, start);
      const lastInside = await plant(world, actor, new Date(end.getTime() - 1));
      const atEnd = await plant(world, actor, end);

      const page = await world.store.page(
        pageRequestFor(actor, { occurredFrom: start, occurredBefore: end }),
      );

      const ids = page.events.map(({ id }) => id);
      expect(ids).toEqual([lastInside, atStart]);
      expect(ids).not.toContain(justBefore);
      expect(ids).not.toContain(atEnd);
      expect(page.total).toBe(2);
    });

    it("keeps a row whose actor account is gone, with no address", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const id = await plant(world, actor, new Date(FIRST_INSTANT));
      await world.removeAccount(actor.accountId);

      const page = await world.store.page(pageRequestFor(actor));

      expect(page.events.map((event) => event.id)).toEqual([id]);
      expect(page.events[0]?.actor).toEqual({
        id: actor.accountId,
        email: null,
        name: null,
      });
    });

    it("names the actor by address and name while the account exists", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      await plant(world, actor, new Date(FIRST_INSTANT));

      const page = await world.store.page(pageRequestFor(actor));

      expect(page.events[0]?.actor).toEqual({
        id: actor.accountId,
        email: actor.email,
        name: actor.name,
      });
    });

    it("names the kitchen and its client's address, and shows neither for a kitchen its client deleted or one that is gone", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const client = await world.aClient();
      const open = await world.aKitchen({ client, name: "Casa" });
      const deleted = await world.aKitchen({
        client,
        name: "Veche",
        isDeletedByClient: true,
      });
      const gone = nanoid();
      const at = (minutes: number) =>
        new Date(FIRST_INSTANT + minutes * ONE_MINUTE_MS);
      await plant(
        world,
        actor,
        at(1),
        undefined,
        "kitchen-opened",
        open.designId,
      );
      await plant(
        world,
        actor,
        at(2),
        undefined,
        "kitchen-opened",
        deleted.designId,
      );
      await plant(world, actor, at(3), undefined, "kitchen-opened", gone);

      const page = await world.store.page(pageRequestFor(actor));

      expect(page.events.map(({ design }) => design)).toEqual([
        { id: gone, name: null, client: null },
        { id: deleted.designId, name: null, client: null },
        {
          id: open.designId,
          name: "Casa",
          client: { id: client.accountId, email: client.email, name: null },
        },
      ]);
    });

    it("shows a kitchen that no account owns by name and with no client", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const kitchen = await world.aKitchen({ client: null, name: "Fara cont" });
      await plant(
        world,
        actor,
        new Date(FIRST_INSTANT),
        undefined,
        "kitchen-opened",
        kitchen.designId,
      );

      const page = await world.store.page(pageRequestFor(actor));

      expect(page.events[0]?.design).toEqual({
        id: kitchen.designId,
        name: "Fara cont",
        client: null,
      });
    });

    it("names the subject account of a row by address while it exists", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const subject = await world.aClient();
      await world.plantEvent({
        occurredAt: new Date(FIRST_INSTANT),
        actorAccountId: actor.accountId,
        action: "kitchen-opened",
        subjectAccountId: subject.accountId,
      });

      const page = await world.store.page(pageRequestFor(actor));

      expect(page.events[0]?.subject).toEqual({
        id: subject.accountId,
        email: subject.email,
        name: null,
      });
    });

    it("returns a row the domain refuses as unrecognised, counted, with its action and never its detail", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const FORGED = "forged-detail-marker-7e1";
      const deferred = await plant(
        world,
        actor,
        new Date(FIRST_INSTANT + 3),
        undefined,
        "preset-hidden",
      );
      const invitedWithDetail = await world.plantEvent({
        occurredAt: new Date(FIRST_INSTANT + 2),
        actorAccountId: actor.accountId,
        action: "staff-invited",
        detail: { role: FORGED },
      });
      const emptyObjectDetail = await world.plantEvent({
        occurredAt: new Date(FIRST_INSTANT + 1),
        actorAccountId: actor.accountId,
        action: "kitchen-opened",
        detail: {},
      });
      const badStatus = await world.plantEvent({
        occurredAt: new Date(FIRST_INSTANT),
        actorAccountId: actor.accountId,
        action: "status-changed",
        detail: { from: "new", to: FORGED },
      });

      const page = await world.store.page(pageRequestFor(actor));

      expect(page.total).toBe(4);
      expect(
        rowReadings(page.events, [
          deferred,
          invitedWithDetail,
          emptyObjectDetail,
          badStatus,
        ]),
      ).toEqual([
        { kind: "unrecognised", action: "preset-hidden" },
        { kind: "unrecognised", action: "staff-invited" },
        { kind: "unrecognised", action: "kitchen-opened" },
        { kind: "unrecognised", action: "status-changed" },
      ]);
      expect(JSON.stringify(page)).not.toContain(FORGED);
    });

    it("reads back what record wrote as the recognised entry", async () => {
      const world = await newWorld();
      const actor = await world.aStaffMember();
      const kitchen = await world.aKitchen({ client: null, name: null });
      await world.store.record({
        sessionTokenHash: actor.sessionTokenHash,
        idleLifetimeSeconds: actor.idleLifetimeSeconds,
        entry: STATUS_CHANGED,
        designId: kitchen.designId,
        subjectAccountId: null,
      });

      const page = await world.store.page(pageRequestFor(actor));

      expect(page.events.map(({ reading }) => reading)).toEqual([
        { kind: "recognised", entry: STATUS_CHANGED },
      ]);
    });

    it.each([
      ["page 0", { page: 0 }],
      ["a fractional page", { page: 2.5 }],
      ["a page beyond the bound", { page: MAX_STAFF_AUDIT_PAGE + 1 }],
      ["an actor id of the wrong shape", { actorAccountId: "someone" }],
      ["an action outside the table's shape", { action: "Note Added" }],
    ] satisfies readonly (readonly [string, Partial<StaffAuditPageRequest>])[])(
      "refuses %s",
      async (_label, overrides) => {
        const world = await newWorld();
        const actor = await world.aStaffMember();

        const failure = await failureOf(
          world.store.page(pageRequestFor(actor, overrides)),
        );

        expect(failure.failure).toBe("invalid-record");
      },
    );
  });
}

async function plant(
  world: AuditWorld,
  actor: StaffMember,
  occurredAt: Date,
  id?: string,
  action = "kitchen-opened",
  designId: string | null = null,
): Promise<string> {
  return world.plantEvent({
    occurredAt,
    actorAccountId: actor.accountId,
    action,
    designId,
    ...(id === undefined ? {} : { id }),
  });
}

/** The readings of the rows named, in the page's order. */
function rowReadings(
  events: readonly StaffAuditPageRow[],
  ids: readonly string[],
) {
  return events
    .filter(({ id }) => ids.includes(id))
    .map(({ reading }) => reading);
}
