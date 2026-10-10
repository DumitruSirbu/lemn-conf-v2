import { describe, expect, it } from "vitest";

import {
  ContactSubmissionStoreError,
  isSubmissionReference,
} from "../../src/contact-submission-store.js";
import type {
  ContactSubmissionStore,
  RecordedSubmission,
  SubmissionRecording,
} from "../../src/contact-submission-store.js";
import { generateSubmissionReference } from "../../src/generate-submission-reference.js";
import { rejectionOf } from "./rejection-of.js";
import {
  DIGEST_A,
  DIGEST_B,
  aCallbackSubmission,
  aDesignSubmission,
} from "./contact-submission-fixtures.js";

export interface ContactSubmissionStoreOptions {
  /** Where each reference proposal comes from; a store that is given none draws its own. */
  readonly proposeReference?: () => string;
}

export interface ContactSubmissionStoreContractSubject {
  readonly createStore: (
    options?: ContactSubmissionStoreOptions,
  ) => ContactSubmissionStore;
  /** An id no earlier test used, so a test never meets another's row. Always of the domain's shape. */
  readonly newClientRequestId: () => string;
}

const UPPERCASE_DIGEST = "A".repeat(64);

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
}
