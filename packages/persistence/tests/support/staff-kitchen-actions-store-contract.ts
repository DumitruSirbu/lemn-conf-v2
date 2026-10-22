import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import {
  StaffKitchenActionError,
  type StaffActingSession,
  type StaffKitchenActionFailure,
  type StaffKitchenActionsStore,
} from "../../src/staff-kitchen-actions-store.js";
import { rejectionOf } from "./rejection-of.js";

/** A staff member the world has signed in: the account, and the session a call acts for. */
export interface StaffMember {
  readonly accountId: string;
  readonly email: string;
  readonly session: StaffActingSession;
}

export interface ClientAccount {
  readonly accountId: string;
  readonly email: string;
}

export interface KitchenSpec {
  /** The account that owns the kitchen; `null` is a visitor's. */
  readonly client: ClientAccount | null;
  readonly isSent?: boolean;
  readonly isHidden?: boolean;
  readonly isDeletedByClient?: boolean;
}

export interface StoredNote {
  readonly id: string;
  readonly authorAccountId: string;
  readonly text: string;
}

export interface StoredStatus {
  readonly status: string;
  readonly changedByAccountId: string;
  readonly changedAtMs: number;
}

export interface StoredAuditEvent {
  readonly action: string;
  readonly designId: string | null;
  readonly isDetailSqlNull: boolean;
  readonly detail: unknown;
}

/**
 * What the contract needs of a store's surroundings. The fake and the live test database each build one, so the same
 * assertions run against both and a difference between the two is a failing test, not a footnote. Everything that reads
 * a table reads it around the store.
 */
export interface ActionsWorld {
  readonly store: StaffKitchenActionsStore;
  aStaffMember(): Promise<StaffMember>;
  aStaffMemberWhoseSessionIsRevoked(): Promise<StaffMember>;
  aClient(): Promise<ClientAccount>;
  aKitchen(spec: KitchenSpec): Promise<string>;
  /** A status row written the way a script around the store would: any stored text. */
  aStoredStatus(spec: {
    readonly designId: string;
    readonly status: string;
    readonly changedBy: StaffMember;
  }): Promise<void>;
  notesOf(designId: string): Promise<readonly StoredNote[]>;
  statusRowOf(designId: string): Promise<StoredStatus | null>;
  isHidden(designId: string): Promise<boolean>;
  updatedAtMsOf(designId: string): Promise<number>;
  /** Every audit row whose actor is the account, oldest first. */
  auditEventsOf(actorAccountId: string): Promise<readonly StoredAuditEvent[]>;
}

const A_NOTE = "The client asked for a worktop quote.\nCall back on Tuesday.";

async function failureOf(
  pending: PromiseLike<unknown>,
): Promise<StaffKitchenActionError> {
  const failure = await rejectionOf(pending);
  expect(failure).toBeInstanceOf(StaffKitchenActionError);
  return failure as StaffKitchenActionError;
}

function auditOf(
  action: string,
  designId: string,
  detail: unknown = null,
): StoredAuditEvent {
  return {
    action,
    designId,
    isDetailSqlNull: detail === null,
    detail,
  };
}

export function describeStaffKitchenActionsStoreContract(
  suiteName: string,
  newWorld: () => Promise<ActionsWorld>,
): void {
  describeAddNote(suiteName, newWorld);
  describeSetStatus(suiteName, newWorld);
  describeUnhide(suiteName, newWorld);
}

function describeAddNote(
  suiteName: string,
  newWorld: () => Promise<ActionsWorld>,
): void {
  describe(`${suiteName}: addNote`, () => {
    it("writes the note and its audit row, both for the account of the session and no other", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const bystander = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });

      const result = await world.store.addNote({
        session: staff.session,
        designId,
        text: A_NOTE,
      });

      expect(result).toMatchObject({
        kind: "added",
        note: { text: A_NOTE, author: { id: staff.accountId } },
      });
      expect(await world.notesOf(designId)).toEqual([
        {
          id: expect.any(String) as string,
          authorAccountId: staff.accountId,
          text: A_NOTE,
        },
      ]);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        auditOf("note-added", designId),
      ]);
      expect(await world.auditEventsOf(bystander.accountId)).toEqual([]);
    });

    it("names the author by the e-mail the account has now", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });

      const result = await world.store.addNote({
        session: staff.session,
        designId,
        text: A_NOTE,
      });

      expect(result).toMatchObject({
        note: { author: { email: staff.email } },
      });
    });

    it.each([
      ["a client's draft", { isSent: false, isHidden: false, hasClient: true }],
      ["a hidden kitchen", { isSent: true, isHidden: true, hasClient: true }],
      [
        "a sent kitchen that no account owns",
        { isSent: true, isHidden: false, hasClient: false },
      ],
    ])("writes a note on %s", async (_name, spec) => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: spec.hasClient ? await world.aClient() : null,
        isSent: spec.isSent,
        isHidden: spec.isHidden,
      });

      const result = await world.store.addNote({
        session: staff.session,
        designId,
        text: A_NOTE,
      });

      expect(result.kind).toBe("added");
    });

    it("keeps two notes of one kitchen apart, each with its own audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });

      await world.store.addNote({
        session: staff.session,
        designId,
        text: "a",
      });
      await world.store.addNote({
        session: staff.session,
        designId,
        text: "b",
      });

      expect(
        (await world.notesOf(designId)).map(({ text }) => text).sort(),
      ).toEqual(["a", "b"]);
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(2);
    });

    it.each([
      ["a kitchen that does not exist", () => nanoid()],
      ["an id that is not a kitchen's shape", () => "short"],
    ])(
      "answers the one kitchen refusal for %s and writes nothing",
      async (_n, idOf) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();

        const result = await world.store.addNote({
          session: staff.session,
          designId: idOf(),
          text: A_NOTE,
        });

        expect(result).toEqual({ kind: "kitchen-not-found" });
        expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
      },
    );

    it.each([
      [
        "a kitchen its client deleted",
        { isDeletedByClient: true, isSent: true, hasClient: true },
      ],
      [
        "a visitor's unsent draft, which the reader never shows",
        { isDeletedByClient: false, isSent: false, hasClient: false },
      ],
    ])("writes no note on %s", async (_name, spec) => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: spec.hasClient ? await world.aClient() : null,
        isSent: spec.isSent,
        isDeletedByClient: spec.isDeletedByClient,
      });

      const result = await world.store.addNote({
        session: staff.session,
        designId,
        text: A_NOTE,
      });

      expect(result).toEqual({ kind: "kitchen-not-found" });
      expect(await world.notesOf(designId)).toEqual([]);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });

    it("writes neither note nor audit row when the session is not live, even for a kitchen it could not see", async () => {
      const world = await newWorld();
      const gone = await world.aStaffMemberWhoseSessionIsRevoked();
      const visible = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });

      const onVisible = await failureOf(
        world.store.addNote({
          session: gone.session,
          designId: visible,
          text: A_NOTE,
        }),
      );
      const onUnknown = await failureOf(
        world.store.addNote({
          session: gone.session,
          designId: nanoid(),
          text: A_NOTE,
        }),
      );

      expect([onVisible.failure, onUnknown.failure]).toEqual([
        "not-recorded",
        "not-recorded",
      ]);
      expect(await world.notesOf(visible)).toEqual([]);
      expect(await world.auditEventsOf(gone.accountId)).toEqual([]);
    });

    it.each([
      ["empty text", ""],
      ["text with a space the domain trims", " padded "],
      ["text with a bidi override", "a\u202Eb"],
      ["text with a NUL", "a\u0000b"],
      ["text over 2000 characters", "x".repeat(2001)],
      ["a value that is not text", 42 as unknown as string],
    ])("refuses %s before any write", async (_name, text) => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });

      const failure = await failureOf(
        world.store.addNote({ session: staff.session, designId, text }),
      );

      expect(failure.failure satisfies StaffKitchenActionFailure).toBe(
        "invalid-request",
      );
      expect(failure.refusal).toBe("NOTE_TEXT_NOT_JUDGED");
      expect(await world.notesOf(designId)).toEqual([]);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });
  });
}

function describeSetStatus(
  suiteName: string,
  newWorld: () => Promise<ActionsWorld>,
): void {
  async function sentKitchen(world: ActionsWorld): Promise<string> {
    return world.aKitchen({ client: await world.aClient(), isSent: true });
  }

  describe(`${suiteName}: setStatus`, () => {
    it("saves the first status of a sent kitchen for the account of the session, and audits it from new", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await sentKitchen(world);

      const result = await world.store.setStatus({
        session: staff.session,
        designId,
        status: "contacted",
        seenStatus: "new",
      });

      expect(result).toMatchObject({
        kind: "saved",
        saved: {
          value: "contacted",
          by: { id: staff.accountId, email: staff.email },
        },
      });
      expect(await world.statusRowOf(designId)).toMatchObject({
        status: "contacted",
        changedByAccountId: staff.accountId,
      });
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        auditOf("status-changed", designId, { from: "new", to: "contacted" }),
      ]);
    });

    it("audits the status a later save replaced as its from", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await sentKitchen(world);
      await world.store.setStatus({
        session: staff.session,
        designId,
        status: "contacted",
        seenStatus: "new",
      });

      await world.store.setStatus({
        session: staff.session,
        designId,
        status: "closed",
        seenStatus: "contacted",
      });

      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        auditOf("status-changed", designId, { from: "new", to: "contacted" }),
        auditOf("status-changed", designId, {
          from: "contacted",
          to: "closed",
        }),
      ]);
      expect(await world.statusRowOf(designId)).toMatchObject({
        status: "closed",
      });
    });

    it("lets any status follow any, and the status of a hidden kitchen be saved", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
        isHidden: true,
      });
      await world.store.setStatus({
        session: staff.session,
        designId,
        status: "closed",
        seenStatus: "new",
      });

      const result = await world.store.setStatus({
        session: staff.session,
        designId,
        status: "offer-sent",
        seenStatus: "closed",
      });

      expect(result.kind).toBe("saved");
    });

    it("saves a sent kitchen no account owns", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({ client: null, isSent: true });

      const result = await world.store.setStatus({
        session: staff.session,
        designId,
        status: "contacted",
        seenStatus: "new",
      });

      expect(result.kind).toBe("saved");
    });

    it("answers not-sent for a kitchen that was never sent and writes neither row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: false,
      });

      const result = await world.store.setStatus({
        session: staff.session,
        designId,
        status: "contacted",
        seenStatus: "new",
      });

      expect(result).toEqual({ kind: "not-sent" });
      expect(await world.statusRowOf(designId)).toBeNull();
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });

    it.each([
      ["a kitchen that does not exist", { exists: false }],
      ["a kitchen its client deleted", { isDeletedByClient: true }],
      ["a visitor's unsent draft", { visitorDraft: true }],
    ])("answers the one kitchen refusal for %s", async (_name, spec) => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId =
        "exists" in spec
          ? nanoid()
          : await world.aKitchen({
              client: "visitorDraft" in spec ? null : await world.aClient(),
              isSent: !("visitorDraft" in spec),
              isDeletedByClient: "isDeletedByClient" in spec,
            });

      const result = await world.store.setStatus({
        session: staff.session,
        designId,
        status: "contacted",
        seenStatus: "new",
      });

      expect(result).toEqual({ kind: "kitchen-not-found" });
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });

    it("writes nothing and no audit row for the status the kitchen already shows", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await sentKitchen(world);
      await world.store.setStatus({
        session: staff.session,
        designId,
        status: "contacted",
        seenStatus: "new",
      });
      const before = await world.statusRowOf(designId);

      const result = await world.store.setStatus({
        session: staff.session,
        designId,
        status: "contacted",
        seenStatus: "contacted",
      });

      expect(result).toMatchObject({
        kind: "unchanged",
        current: { value: "contacted", by: { id: staff.accountId } },
      });
      expect(await world.statusRowOf(designId)).toEqual(before);
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });

    it("creates no row for new on a kitchen with no saved status, which already shows as new", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await sentKitchen(world);

      const result = await world.store.setStatus({
        session: staff.session,
        designId,
        status: "new",
        seenStatus: "new",
      });

      expect(result).toEqual({ kind: "unchanged", current: null });
      expect(await world.statusRowOf(designId)).toBeNull();
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });

    it.each(["new", "contacted"] as const)(
      "does not read a stored status outside the list as new: a save of %s answers status-not-recognised and writes nothing",
      async (requested) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const designId = await sentKitchen(world);
        await world.aStoredStatus({
          designId,
          status: "later-build-status",
          changedBy: staff,
        });
        const before = await world.statusRowOf(designId);

        const result = await world.store.setStatus({
          session: staff.session,
          designId,
          status: requested,
          seenStatus: "new",
        });

        expect(result).toEqual({ kind: "status-not-recognised" });
        expect(await world.statusRowOf(designId)).toEqual(before);
        expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
      },
    );

    it.each([
      ["a status outside the list", "won"],
      ["a listed status in another case", "Closed"],
      ["a listed status with a space", " closed"],
      ["a missing status", undefined],
      ["a status that is not text", 42],
    ])(
      "refuses %s with the one published code before any write",
      async (_name, status) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const designId = await sentKitchen(world);

        const failure = await failureOf(
          world.store.setStatus({
            session: staff.session,
            designId,
            status: status as "new",
            seenStatus: "new",
          }),
        );

        expect(failure.failure).toBe("invalid-request");
        expect(failure.refusal).toBe("STATUS_NOT_IN_LIST");
        expect(await world.statusRowOf(designId)).toBeNull();
        expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
      },
    );

    it.each([
      ["a sent kitchen", { isSent: true }],
      ["a kitchen that was never sent", { isSent: false }],
      ["a kitchen that does not exist", { exists: false }],
    ])(
      "answers not-recorded for %s when the session is not live, and writes nothing",
      async (_name, spec) => {
        const world = await newWorld();
        const gone = await world.aStaffMemberWhoseSessionIsRevoked();
        const designId =
          "exists" in spec
            ? nanoid()
            : await world.aKitchen({
                client: await world.aClient(),
                isSent: spec.isSent,
              });

        const failure = await failureOf(
          world.store.setStatus({
            session: gone.session,
            designId,
            status: "contacted",
            seenStatus: "new",
          }),
        );

        expect(failure.failure).toBe("not-recorded");
        expect(await world.statusRowOf(designId)).toBeNull();
        expect(await world.auditEventsOf(gone.accountId)).toEqual([]);
      },
    );

    describe("a save made against the status the person saw", () => {
      async function kitchenSavedByAnother(
        world: ActionsWorld,
        status: "contacted" | "offer-sent",
      ) {
        const other = await world.aStaffMember();
        const designId = await sentKitchen(world);
        await world.store.setStatus({
          session: other.session,
          designId,
          status,
          seenStatus: "new",
        });
        return { other, designId };
      }

      it.each(["closed", "offer-sent", "new"] as const)(
        "answers changed-meanwhile when the page saw new and another saved contacted, whatever %s is asked, and writes nothing",
        async (requested) => {
          const world = await newWorld();
          const staff = await world.aStaffMember();
          const { other, designId } = await kitchenSavedByAnother(
            world,
            "contacted",
          );
          const before = await world.statusRowOf(designId);

          const result = await world.store.setStatus({
            session: staff.session,
            designId,
            status: requested,
            seenStatus: "new",
          });

          expect(result).toEqual({ kind: "changed-meanwhile" });
          expect(await world.statusRowOf(designId)).toEqual(before);
          expect(before).toMatchObject({
            status: "contacted",
            changedByAccountId: other.accountId,
          });
          expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
          expect(await world.auditEventsOf(other.accountId)).toHaveLength(1);
        },
      );

      it("answers changed-meanwhile, and not unchanged, for the status now stored when the page saw another", async () => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const { designId } = await kitchenSavedByAnother(world, "offer-sent");

        const result = await world.store.setStatus({
          session: staff.session,
          designId,
          status: "offer-sent",
          seenStatus: "contacted",
        });

        expect(result).toEqual({ kind: "changed-meanwhile" });
      });

      it("answers changed-meanwhile when the page saw a saved status and no row was ever written", async () => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const designId = await sentKitchen(world);

        const result = await world.store.setStatus({
          session: staff.session,
          designId,
          status: "closed",
          seenStatus: "contacted",
        });

        expect(result).toEqual({ kind: "changed-meanwhile" });
        expect(await world.statusRowOf(designId)).toBeNull();
        expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
      });

      it("saves once the page has read the status that is stored, and audits that status as its from", async () => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const { designId } = await kitchenSavedByAnother(world, "contacted");

        const result = await world.store.setStatus({
          session: staff.session,
          designId,
          status: "closed",
          seenStatus: "contacted",
        });

        expect(result.kind).toBe("saved");
        expect(await world.auditEventsOf(staff.accountId)).toEqual([
          auditOf("status-changed", designId, {
            from: "contacted",
            to: "closed",
          }),
        ]);
      });

      it("answers status-not-recognised before it compares: a stored text outside the list wins over any seen status", async () => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const designId = await sentKitchen(world);
        await world.aStoredStatus({
          designId,
          status: "later-build-status",
          changedBy: staff,
        });

        const result = await world.store.setStatus({
          session: staff.session,
          designId,
          status: "closed",
          seenStatus: "contacted",
        });

        expect(result).toEqual({ kind: "status-not-recognised" });
      });

      it("answers not-sent and the one kitchen refusal before it compares, so a stale page learns nothing from them", async () => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const draft = await world.aKitchen({
          client: await world.aClient(),
          isSent: false,
        });

        const notSent = await world.store.setStatus({
          session: staff.session,
          designId: draft,
          status: "closed",
          seenStatus: "contacted",
        });
        const unknown = await world.store.setStatus({
          session: staff.session,
          designId: nanoid(),
          status: "closed",
          seenStatus: "contacted",
        });

        expect(notSent).toEqual({ kind: "not-sent" });
        expect(unknown).toEqual({ kind: "kitchen-not-found" });
      });

      it.each([
        ["a status outside the list", "won"],
        ["a listed status in another case", "Closed"],
        ["a missing status", undefined],
        ["a status that is not text", 42],
        ["the word the page shows for a status it cannot name", "unrecognised"],
      ])(
        "refuses %s as the seen status with its own code before any write",
        async (_name, seen) => {
          const world = await newWorld();
          const staff = await world.aStaffMember();
          const designId = await sentKitchen(world);

          const failure = await failureOf(
            world.store.setStatus({
              session: staff.session,
              designId,
              status: "closed",
              seenStatus: seen as "new",
            }),
          );

          expect(failure.failure).toBe("invalid-request");
          expect(failure.refusal).toBe("SEEN_STATUS_NOT_IN_LIST");
          expect(await world.statusRowOf(designId)).toBeNull();
          expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
        },
      );
    });

    it("never logs a stale from when two saves race: the audit rows chain through the statuses really replaced", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await sentKitchen(world);

      const results = await Promise.all([
        world.store.setStatus({
          session: staff.session,
          designId,
          status: "contacted",
          seenStatus: "new",
        }),
        world.store.setStatus({
          session: staff.session,
          designId,
          status: "closed",
          seenStatus: "new",
        }),
      ]);

      const audits = (await world.auditEventsOf(staff.accountId)).map(
        ({ detail }) => detail as { from: string; to: string },
      );
      const roots = audits.filter(({ from }) => from === "new");
      const chained = audits.filter(({ from }) => from !== "new");
      const kinds = results.map(({ kind }) => kind);
      expect(roots).toHaveLength(1);
      expect(kinds.filter((kind) => kind === "saved")).toHaveLength(
        audits.length,
      );
      if (chained.length === 1) expect(chained[0]?.from).toBe(roots[0]?.to);
      else expect(kinds).toContain("changed-meanwhile");
      const lastTo = (chained[0] ?? roots[0])?.to;
      expect((await world.statusRowOf(designId))?.status).toBe(lastTo);
    });
  });
}

function describeUnhide(
  suiteName: string,
  newWorld: () => Promise<ActionsWorld>,
): void {
  describe(`${suiteName}: unhide`, () => {
    it("clears the hide and writes the audit row, and touches no other column of the kitchen", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
        isHidden: true,
      });
      const updatedBefore = await world.updatedAtMsOf(designId);

      const result = await world.store.unhide({
        session: staff.session,
        designId,
      });

      expect(result).toEqual({ kind: "unhidden" });
      expect(await world.isHidden(designId)).toBe(false);
      expect(await world.updatedAtMsOf(designId)).toBe(updatedBefore);
      expect(await world.auditEventsOf(staff.accountId)).toEqual([
        auditOf("kitchen-unhidden", designId),
      ]);
    });

    it("answers not-hidden to a second call and writes no second audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
        isHidden: true,
      });
      await world.store.unhide({ session: staff.session, designId });

      const second = await world.store.unhide({
        session: staff.session,
        designId,
      });

      expect(second).toEqual({ kind: "not-hidden" });
      expect(await world.auditEventsOf(staff.accountId)).toHaveLength(1);
    });

    it("answers not-hidden for a visible kitchen that was never hidden, with no audit row", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();
      const designId = await world.aKitchen({
        client: await world.aClient(),
        isSent: true,
      });

      const result = await world.store.unhide({
        session: staff.session,
        designId,
      });

      expect(result).toEqual({ kind: "not-hidden" });
      expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
    });

    it.each([
      ["a kitchen that does not exist", { exists: false }],
      [
        "a kitchen its client deleted",
        { isDeletedByClient: true, isHidden: false },
      ],
      [
        "a hidden kitchen its client then deleted",
        { isDeletedByClient: true, isHidden: true },
      ],
      ["a visitor's unsent draft", { visitorDraft: true }],
    ])(
      "answers the one kitchen refusal for %s and keeps it as it was",
      async (_name, spec) => {
        const world = await newWorld();
        const staff = await world.aStaffMember();
        const designId =
          "exists" in spec
            ? nanoid()
            : await world.aKitchen({
                client: "visitorDraft" in spec ? null : await world.aClient(),
                isSent: !("visitorDraft" in spec),
                isHidden: "isHidden" in spec && spec.isHidden,
                isDeletedByClient: "isDeletedByClient" in spec,
              });

        const result = await world.store.unhide({
          session: staff.session,
          designId,
        });

        expect(result).toEqual({ kind: "kitchen-not-found" });
        expect(await world.auditEventsOf(staff.accountId)).toEqual([]);
        if (!("exists" in spec) && "isHidden" in spec && spec.isHidden) {
          expect(await world.isHidden(designId)).toBe(true);
        }
      },
    );

    it.each([
      ["a hidden kitchen", true],
      ["a kitchen that is not hidden", false],
    ])(
      "answers not-recorded for %s when the session is not live, and leaves it as it was",
      async (_name, isHidden) => {
        const world = await newWorld();
        const gone = await world.aStaffMemberWhoseSessionIsRevoked();
        const designId = await world.aKitchen({
          client: await world.aClient(),
          isSent: true,
          isHidden,
        });

        const failure = await failureOf(
          world.store.unhide({ session: gone.session, designId }),
        );

        expect(failure.failure).toBe("not-recorded");
        expect(await world.isHidden(designId)).toBe(isHidden);
        expect(await world.auditEventsOf(gone.accountId)).toEqual([]);
      },
    );

    it("leaves the hide in place for a malformed id and answers the kitchen refusal", async () => {
      const world = await newWorld();
      const staff = await world.aStaffMember();

      const result = await world.store.unhide({
        session: staff.session,
        designId: "x",
      });

      expect(result).toEqual({ kind: "kitchen-not-found" });
    });
  });
}
