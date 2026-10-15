import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import {
  ContactSubmissionStoreError,
  isSubmissionReference,
} from "../../src/contact-submission-store.js";
import type {
  ContactSubmissionStore,
  RecordedSubmission,
  SentReferenceReader,
  SubmissionRecording,
} from "../../src/contact-submission-store.js";
import { generateSubmissionReference } from "../../src/generate-submission-reference.js";
import { rejectionOf } from "./rejection-of.js";
import {
  DIGEST_A,
  DIGEST_B,
  aCallbackSubmission,
  aDesignSubmission,
  aDesignSubmissionNaming,
} from "./contact-submission-fixtures.js";

export interface ContactSubmissionStoreOptions {
  /** Where each reference proposal comes from; a store that is given none draws its own. */
  readonly proposeReference?: () => string;
}

export interface ContactSubmissionStoreContractSubject {
  readonly createStore: (
    options?: ContactSubmissionStoreOptions,
  ) => ContactSubmissionStore & SentReferenceReader;
  /** An id no earlier test used, so a test never meets another's row. Always of the domain's shape. */
  readonly newClientRequestId: () => string;
}

const UPPERCASE_DIGEST = "A".repeat(64);

/** Longer than the clock's resolution, so two marks made one after the other carry two instants. */
const LONGER_THAN_THE_CLOCK_TICK_MS = 20;

/** The keys an answer may carry: nothing personal, no snapshot, no instant. */
const STORED_KEYS = ["isNotified", "kind", "reference"];
const RECORDED_KEYS = ["isNew", ...STORED_KEYS].sort();

/** Hands out the given references in order, then draws at random, so a store that proposes more often than the test
 *  expected gets a fresh reference and the test's assertion fails and not the draw. */
export function proposing(...references: string[]): () => string {
  const remaining = [...references];
  return () => remaining.shift() ?? generateSubmissionReference();
}

function expectStored(
  recording: SubmissionRecording,
): asserts recording is RecordedSubmission {
  expect(recording.kind).toBe("stored");
}

/** A design id no other test uses, so a read of its sent reference never meets another test's row. */
function aDesignIdOfItsOwn(): string {
  return `ContractDesign_${randomBytes(8).toString("hex")}`;
}

function twoReferencesInSortOrder(): {
  sortsFirst: string;
  sortsLast: string;
} {
  const first = generateSubmissionReference();
  const second = generateSubmissionReference();
  return first < second
    ? { sortsFirst: first, sortsLast: second }
    : { sortsFirst: second, sortsLast: first };
}

/** What a `ContactSubmissionStore` promises, asserted once and run against the fake and against the Neon store. */
export function describeContactSubmissionStoreContract({
  createStore,
  newClientRequestId,
}: ContactSubmissionStoreContractSubject): void {
  describe("record", () => {
    it("stores a request for a design and answers a new, unnotified reference", async () => {
      const store = createStore();

      const recording = await store.record(
        aDesignSubmission(newClientRequestId()),
      );

      expectStored(recording);
      expect(isSubmissionReference(recording.reference)).toBe(true);
      expect([recording.isNew, recording.isNotified]).toEqual([true, false]);
    });

    it("stores a callback, which names no design and holds no snapshot", async () => {
      const store = createStore();

      const recording = await store.record(
        aCallbackSubmission(newClientRequestId()),
      );

      expectStored(recording);
      expect(recording.isNew).toBe(true);
    });

    it("answers one reference to one id and digest however often it is recorded, new only the first time", async () => {
      const store = createStore();
      const id = newClientRequestId();

      const recordings = [
        await store.record(aDesignSubmission(id)),
        await store.record(aDesignSubmission(id)),
        await store.record(aDesignSubmission(id)),
      ];

      const answers = recordings.map((recording) => {
        expectStored(recording);
        return [recording.reference, recording.isNew] as const;
      });
      expect(new Set(answers.map(([reference]) => reference)).size).toBe(1);
      expect(answers.map(([, isNew]) => isNew)).toEqual([true, false, false]);
    });

    it("answers a conflict for the same id with another digest, and the stored row is as it was", async () => {
      const store = createStore();
      const id = newClientRequestId();
      const first = await store.record(aDesignSubmission(id, DIGEST_A));
      await store.markNotified(id);

      const conflict = await store.record(aDesignSubmission(id, DIGEST_B));
      const afterwards = await store.lookUp({
        clientRequestId: id,
        payloadDigest: DIGEST_A,
      });

      expectStored(first);
      expect(conflict).toEqual({ kind: "conflict" });
      expect(afterwards).toEqual({
        kind: "stored",
        reference: first.reference,
        isNotified: true,
      });
    });

    it("answers a replay as not new when its proposal is a fresh reference", async () => {
      const first = generateSubmissionReference();
      const store = createStore({
        proposeReference: proposing(first, generateSubmissionReference()),
      });
      const id = newClientRequestId();
      await store.record(aDesignSubmission(id));

      const replay = await store.record(aDesignSubmission(id));

      expectStored(replay);
      expect([replay.reference, replay.isNew]).toEqual([first, false]);
    });

    it("answers a replay as new when its proposal is the reference already stored, as a repeated statement does, in both stores alike", async () => {
      const repeated = generateSubmissionReference();
      const store = createStore({
        proposeReference: proposing(repeated, repeated),
      });
      const id = newClientRequestId();
      await store.record(aDesignSubmission(id));

      const replay = await store.record(aDesignSubmission(id));

      expectStored(replay);
      expect([replay.reference, replay.isNew]).toEqual([repeated, true]);
    });

    it("never clears a mark when the same request is recorded again", async () => {
      const store = createStore();
      const id = newClientRequestId();
      await store.record(aDesignSubmission(id));
      await store.markNotified(id);

      const replay = await store.record(aDesignSubmission(id));

      expectStored(replay);
      expect([replay.isNew, replay.isNotified]).toEqual([false, true]);
    });

    it("draws again when a proposal is another request's reference, and surfaces nothing", async () => {
      const taken = generateSubmissionReference();
      const free = generateSubmissionReference();
      const store = createStore({
        proposeReference: proposing(taken, taken, free),
      });

      const first = await store.record(aDesignSubmission(newClientRequestId()));
      const second = await store.record(
        aDesignSubmission(newClientRequestId()),
      );

      expectStored(first);
      expectStored(second);
      expect([first.reference, second.reference]).toEqual([taken, free]);
    });

    it("fails with the store error after three collisions and stores nothing", async () => {
      const taken = generateSubmissionReference();
      const store = createStore({
        proposeReference: proposing(taken, taken, taken, taken),
      });
      await store.record(aDesignSubmission(newClientRequestId()));
      const refused = aDesignSubmission(newClientRequestId());

      const failure = await rejectionOf(store.record(refused));
      const afterwards = await store.lookUp(refused);

      expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
      expect((failure as ContactSubmissionStoreError).operation).toBe(
        "record a request",
      );
      expect(afterwards).toEqual({ kind: "absent" });
    });

    it("answers the replayed row, with no error, when a replay's proposal is another request's reference", async () => {
      const firstReference = generateSubmissionReference();
      const otherReference = generateSubmissionReference();
      const store = createStore({
        proposeReference: proposing(
          firstReference,
          otherReference,
          otherReference,
        ),
      });
      const replayedId = newClientRequestId();
      await store.record(aDesignSubmission(replayedId));
      await store.record(aDesignSubmission(newClientRequestId()));

      const replay = await store.record(aDesignSubmission(replayedId));

      expectStored(replay);
      expect([replay.reference, replay.isNew]).toEqual([firstReference, false]);
    });

    it("refuses a digest that is not lowercase hex, storing nothing", async () => {
      const store = createStore();
      const refused = aDesignSubmission(newClientRequestId(), UPPERCASE_DIGEST);

      await expect(store.record(refused)).rejects.toThrow(/digest/);

      expect(
        await store.lookUp({
          clientRequestId: refused.clientRequestId,
          payloadDigest: DIGEST_A,
        }),
      ).toEqual({ kind: "absent" });
    });
  });

  describe("lookUp", () => {
    it("answers absent for an id never stored, and stores nothing by asking", async () => {
      const store = createStore();
      const id = newClientRequestId();

      const lookup = await store.lookUp({
        clientRequestId: id,
        payloadDigest: DIGEST_A,
      });
      const recording = await store.record(aDesignSubmission(id));

      expect(lookup).toEqual({ kind: "absent" });
      expectStored(recording);
      expect(recording.isNew).toBe(true);
    });

    it("answers what a record of the same id and digest answers, without isNew", async () => {
      const store = createStore();
      const id = newClientRequestId();
      await store.record(aDesignSubmission(id, DIGEST_A));
      await store.markNotified(id);

      const lookup = await store.lookUp({
        clientRequestId: id,
        payloadDigest: DIGEST_A,
      });
      const replay = await store.record(aDesignSubmission(id, DIGEST_A));

      expectStored(replay);
      const { kind, reference, isNotified } = replay;
      expect(lookup).toEqual({ kind, reference, isNotified });
    });

    it("answers a conflict for another digest, as a record does", async () => {
      const store = createStore();
      const id = newClientRequestId();
      await store.record(aDesignSubmission(id, DIGEST_A));

      const lookup = await store.lookUp({
        clientRequestId: id,
        payloadDigest: DIGEST_B,
      });
      const recording = await store.record(aDesignSubmission(id, DIGEST_B));

      expect([lookup, recording]).toEqual([
        { kind: "conflict" },
        { kind: "conflict" },
      ]);
    });
  });

  describe("markNotified", () => {
    it("marks a stored request, and keeps the mark when it is made again", async () => {
      const store = createStore();
      const id = newClientRequestId();
      await store.record(aDesignSubmission(id));
      const request = { clientRequestId: id, payloadDigest: DIGEST_A };
      const before = await store.lookUp(request);

      await store.markNotified(id);
      await store.markNotified(id);
      const after = await store.lookUp(request);

      expect(
        [before, after].map(
          (answer) => answer.kind === "stored" && answer.isNotified,
        ),
      ).toEqual([false, true]);
    });

    it("fails with the store error for an id that is not stored", async () => {
      const failure = await rejectionOf(
        createStore().markNotified(newClientRequestId()),
      );

      expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
      expect((failure as ContactSubmissionStoreError).operation).toBe(
        "mark a request notified",
      );
    });
  });

  describe("what an answer holds", () => {
    it("carries a kind, a reference and whether notified, and nothing personal, no snapshot and no instant", async () => {
      const store = createStore();
      const id = newClientRequestId();

      const recording = await store.record(aDesignSubmission(id));
      const lookup = await store.lookUp({
        clientRequestId: id,
        payloadDigest: DIGEST_A,
      });

      expect(Object.keys(recording).sort()).toEqual(RECORDED_KEYS);
      expect(Object.keys(lookup).sort()).toEqual(STORED_KEYS);
    });
  });

  describe("findSentReference", () => {
    async function storeNotified(
      store: ContactSubmissionStore,
      design: { id: string; revision: string },
    ): Promise<string> {
      const id = newClientRequestId();
      const recording = await store.record(aDesignSubmissionNaming(id, design));
      expectStored(recording);
      await store.markNotified(id);
      return recording.reference;
    }

    it("answers none for a design no request names", async () => {
      const store = createStore();

      const answer = await store.findSentReference({
        designId: aDesignIdOfItsOwn(),
        revision: "7",
      });

      expect(answer).toEqual({ kind: "none" });
    });

    it("answers the reference of a request whose notice is recorded as sent", async () => {
      const store = createStore();
      const design = { id: aDesignIdOfItsOwn(), revision: "7" };
      const reference = await storeNotified(store, design);

      const answer = await store.findSentReference({
        designId: design.id,
        revision: design.revision,
      });

      expect(answer).toEqual({ kind: "sent", reference });
    });

    it("answers none for a request stored and never marked", async () => {
      const store = createStore();
      const design = { id: aDesignIdOfItsOwn(), revision: "7" };
      await store.record(aDesignSubmissionNaming(newClientRequestId(), design));

      const answer = await store.findSentReference({
        designId: design.id,
        revision: design.revision,
      });

      expect(answer).toEqual({ kind: "none" });
    });

    it("answers none for another revision of the design and for another design at the revision", async () => {
      const store = createStore();
      const design = { id: aDesignIdOfItsOwn(), revision: "7" };
      await storeNotified(store, design);

      const otherRevision = await store.findSentReference({
        designId: design.id,
        revision: "8",
      });
      const otherDesign = await store.findSentReference({
        designId: aDesignIdOfItsOwn(),
        revision: design.revision,
      });

      expect([otherRevision, otherDesign]).toEqual([
        { kind: "none" },
        { kind: "none" },
      ]);
    });

    it("answers the revision asked for when the design is notified at two", async () => {
      const store = createStore();
      const designId = aDesignIdOfItsOwn();
      const earlier = await storeNotified(store, {
        id: designId,
        revision: "7",
      });
      const later = await storeNotified(store, { id: designId, revision: "8" });

      const answers = [
        await store.findSentReference({ designId, revision: "7" }),
        await store.findSentReference({ designId, revision: "8" }),
      ];

      expect(answers).toEqual([
        { kind: "sent", reference: earlier },
        { kind: "sent", reference: later },
      ]);
    });

    it("answers the later mark's reference, though the earlier one's sorts first", async () => {
      const { sortsFirst, sortsLast } = twoReferencesInSortOrder();
      const store = createStore({
        proposeReference: proposing(sortsFirst, sortsLast),
      });
      const design = { id: aDesignIdOfItsOwn(), revision: "7" };
      await storeNotified(store, design);
      await sleep(LONGER_THAN_THE_CLOCK_TICK_MS);
      await storeNotified(store, design);

      const answer = await store.findSentReference({
        designId: design.id,
        revision: design.revision,
      });

      expect(answer).toEqual({ kind: "sent", reference: sortsLast });
    });

    it("answers a kind and a reference alone, and nothing personal", async () => {
      const store = createStore();
      const design = { id: aDesignIdOfItsOwn(), revision: "7" };
      await storeNotified(store, design);

      const answer = await store.findSentReference({
        designId: design.id,
        revision: design.revision,
      });

      expect(Object.keys(answer).sort()).toEqual(["kind", "reference"]);
    });

    it("stores nothing by asking", async () => {
      const store = createStore();
      const design = { id: aDesignIdOfItsOwn(), revision: "7" };
      const id = newClientRequestId();

      await store.findSentReference({ designId: design.id, revision: "7" });
      const recording = await store.record(aDesignSubmissionNaming(id, design));

      expectStored(recording);
      expect(recording.isNew).toBe(true);
    });

    it.each([
      ["a revision with a leading zero", "x", "07"],
      ["a revision that is not digits", "x", "1e3"],
      ["a revision wider than a bigint", "x", "9223372036854775808"],
      ["an empty design id", "", "7"],
    ])(
      "refuses %s with the check's own refusal, and not the store error",
      async (_name, designId, revision) => {
        const store = createStore();

        const failure = await rejectionOf(
          store.findSentReference({ designId, revision }),
        );

        expect(failure).toBeInstanceOf(Error);
        expect(failure).not.toBeInstanceOf(ContactSubmissionStoreError);
        expect((failure as Error).message).toMatch(
          /design (id|revision) must be/,
        );
      },
    );
  });
}
