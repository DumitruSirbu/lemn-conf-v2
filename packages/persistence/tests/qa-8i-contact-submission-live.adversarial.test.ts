import { randomBytes } from "node:crypto";

import { fc } from "@fast-check/vitest";
import { NeonDbError, neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ContactSubmissionStoreError,
  requireValidSubmission,
} from "../src/contact-submission-store.js";
import type {
  ContactSubmissionStore,
  ContactSubmissionToRecord,
  SubmissionLookup,
  SubmissionRecording,
} from "../src/contact-submission-store.js";
import { FakeContactSubmissionStore } from "../src/fake-contact-submission-store.js";
import { generateSubmissionReference } from "../src/generate-submission-reference.js";
import { runMigrations } from "../src/migrate.js";
import { NeonContactSubmissionStore } from "../src/neon-contact-submission-store.js";
import {
  DIGEST_A,
  DIGEST_B,
  FAKE_DESIGN_ID,
  FAKE_DOCUMENT_MARKER,
  FAKE_EMAIL,
  FAKE_LOCALITY,
  FAKE_NAME,
  FAKE_PHONE,
  FAKE_SNAPSHOT,
  aCallbackSubmission,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";
import { columnsHolding, columnsOf } from "./support/column-privileges.js";
import { ALL_COLUMNS } from "./support/contact-submission-columns.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { loseTheFirstReply } from "./support/lose-the-first-reply.js";
import type { LossPoint, LostReply } from "./support/lose-the-first-reply.js";
import { cleanJsonObject } from "./support/qa-8i-json-arbitraries.js";
import { REAL_SNAPSHOTS } from "./support/qa-8i-real-snapshots.js";
import { rejectionOf } from "./support/rejection-of.js";
import {
  privilegesHeldOn,
  privilegesHeldWithGrantOption,
  tablePrivilegesTheServerKnows,
} from "./support/table-privileges.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file writes rows under ids only it makes and needs the schema intact while it does.
holdSharedTestSchemaLock();

/**
 * The Neon contact submission store under attack on the live test database, through the store and over the HTTP
 * driver: concurrent records, a record racing a mark, a lost first reply, real refusals fed through the store's
 * translation, the shared check against the table, and the fake beside the Neon store. Every row carries this file's
 * marker in its client request id and is deleted by that marker alone (ADR 0151).
 */
const SUITE_NAME =
  "NeonContactSubmissionStore under concurrent and hostile use (live test database)";

if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

/** Sixteen characters, so the marker alone is the shortest id the table admits. */
const TEST_ID_MARKER = "qa-8i-live-test-";
const RACE_TIMEOUT_MS = 300_000;
const CHECKS_REFUSAL = /^Refusing to use the contact submission store/;

const SAME_DIGEST_ROUNDS = 20;
const MIXED_DIGEST_ROUNDS = 20;
const RACING_CALLERS = 8;
/** The race's precondition, as a floor over the twenty rounds: a proof whose callers never overlapped must not pass,
 *  and one slow line must not fail it. Measured: every round of every run so far, twenty of twenty. */
const ROUNDS_THAT_MUST_RACE = 5;
const MARK_RACE_ROUNDS = 10;

type Held = Readonly<Record<string, unknown>>;

function newClientRequestId(): string {
  return `${TEST_ID_MARKER}${randomBytes(8).toString("hex")}`;
}

/** The whole row for an id, as the test database's owner reads it: the application role cannot. */
async function rowsHeldFor(clientRequestId: string): Promise<Held[]> {
  const rows = (await neon(liveTestDatabaseUrl)`
    select to_jsonb(submission) as held
    from contact_submissions as submission
    where client_request_id = ${clientRequestId}
  `) as { held: Held }[];
  return rows.map((row) => row.held);
}

async function removeRowsCarryingTheTestMarker(): Promise<number> {
  const removed = await neon(liveTestDatabaseUrl)`
    delete from contact_submissions
    where client_request_id like ${`${TEST_ID_MARKER}%`}
    returning client_request_id
  `;
  return removed.length;
}

/** A request whose every stored value names its caller, so a row made of two callers' values is seen. */
function submissionOfCaller(
  clientRequestId: string,
  caller: number,
  payloadDigest: string,
): ContactSubmissionToRecord {
  const tag = String(caller);
  return {
    clientRequestId,
    payloadDigest,
    contact: {
      name: `Fake Caller ${tag}`,
      phone: `+373 000 0${tag} 1`,
      phoneNormalForm: `+3730000${tag}2`,
      locality: `Fakeville ${tag}`,
      channel: "email",
      email: `caller-${tag}@example.invalid`,
      consentTextVersion: "placeholder",
    },
    locale: caller % 2 === 0 ? "ro" : "ru",
    target: {
      kind: "design",
      design: { id: `FakeDesign_caller_${tag}`, revision: String(caller + 1) },
    },
    snapshot: {
      document: JSON.stringify({ marker: `document-of-caller-${tag}` }),
      priced: {
        ...FAKE_SNAPSHOT.priced,
        pricingVersion: `book-of-caller-${tag}`,
      },
    },
  };
}

/** The columns a request fills, as `to_jsonb` shows them: every column but the reference and the two instants. */
function columnsFilledBy(submission: ContactSubmissionToRecord): Held {
  const { contact, target, snapshot } = submission;
  const isDesign = target.kind === "design";
  return {
    client_request_id: submission.clientRequestId,
    payload_digest: submission.payloadDigest,
    design_id: isDesign ? target.design.id : null,
    design_revision: isDesign ? Number(target.design.revision) : null,
    intent: isDesign ? null : target.intent,
    name: contact.name,
    phone: contact.phone,
    phone_normal_form: contact.phoneNormalForm,
    locality: contact.locality,
    channel: contact.channel,
    email: contact.email ?? null,
    consent_text_version: contact.consentTextVersion,
    locale: submission.locale,
    design_document:
      snapshot === undefined ? null : (JSON.parse(snapshot.document) as Held),
    priced:
      snapshot === undefined
        ? null
        : (JSON.parse(JSON.stringify(snapshot.priced)) as Held),
  };
}

/** The reference, which is a proposal's, and the two instants, which are the database's clock. */
const SERVERS_COLUMNS = ["reference", "created_at", "notified_at"];

function withoutTheServersColumns(held: Held | undefined): Held {
  return Object.fromEntries(
    Object.entries(held ?? {}).filter(
      ([column]) => !SERVERS_COLUMNS.includes(column),
    ),
  );
}

interface RacingCaller {
  readonly store: NeonContactSubmissionStore;
  readonly proposals: string[];
}

/** A store of its own for each caller, drawing its own proposals and keeping them for the test to read. */
function newRacingCaller(): RacingCaller {
  const proposals: string[] = [];
  const store = new NeonContactSubmissionStore(liveTestDatabaseUrl, {
    proposeReference: () => {
      const proposal = generateSubmissionReference();
      proposals.push(proposal);
      return proposal;
    },
  });
  return { store, proposals };
}

interface Timed<Outcome> {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly outcome: Outcome | Error;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resume) => setTimeout(resume, milliseconds));
}

/** Runs `call` after `delayMs` and keeps when it was sent and answered, and its rejection as a value. */
async function timed<Outcome>(
  delayMs: number,
  call: () => Promise<Outcome>,
): Promise<Timed<Outcome>> {
  await sleep(delayMs);
  const startedAt = performance.now();
  try {
    const outcome = await call();
    return { startedAt, endedAt: performance.now(), outcome };
  } catch (error) {
    return {
      startedAt,
      endedAt: performance.now(),
      outcome: error instanceof Error ? error : new Error("a non-error throw"),
    };
  }
}

/** True when every call was still unanswered when the last one was sent: all of them were in flight at once. */
function wereAllInFlightAtOnce(calls: readonly Timed<unknown>[]): boolean {
  const lastSent = Math.max(...calls.map((call) => call.startedAt));
  const firstAnswered = Math.min(...calls.map((call) => call.endedAt));
  return lastSent < firstAnswered;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
    const strays = await removeRowsCarryingTheTestMarker();
    console.info(
      `[qa-8i-live] removed ${String(strays)} stray test rows before the run`,
    );
  });

  afterAll(async () => {
    const removed = await removeRowsCarryingTheTestMarker();
    console.info(
      `[qa-8i-live] removed ${String(removed)} test rows after the run`,
    );
  });

  describe("N concurrent records of one id and one digest", () => {
    it(
      "store one row, answer N equal references and exactly one new, and the new one is the caller whose proposal is stored",
      async () => {
        const winners: number[] = [];
        let roundsAllInFlight = 0;

        for (let round = 0; round < SAME_DIGEST_ROUNDS; round += 1) {
          const id = newClientRequestId();
          const callers = Array.from(
            { length: RACING_CALLERS },
            newRacingCaller,
          );

          const calls = await Promise.all(
            callers.map(({ store }, caller) =>
              timed(0, () =>
                store.record(submissionOfCaller(id, caller, DIGEST_A)),
              ),
            ),
          );
          const rows = await rowsHeldFor(id);

          expect(rows).toHaveLength(1);
          const stored = rows[0]?.["reference"];
          const winner = callers.findIndex(({ proposals }) =>
            proposals.includes(String(stored)),
          );
          expect(calls.map((call) => call.outcome)).toEqual(
            callers.map((_caller, caller) => ({
              kind: "stored",
              reference: stored,
              isNew: caller === winner,
              isNotified: false,
            })),
          );
          expect(winner).toBeGreaterThanOrEqual(0);
          expect(callers.map(({ proposals }) => proposals.length)).toEqual(
            callers.map(() => 1),
          );
          expect(withoutTheServersColumns(rows[0])).toEqual(
            columnsFilledBy(submissionOfCaller(id, winner, DIGEST_A)),
          );
          if (wereAllInFlightAtOnce(calls)) roundsAllInFlight += 1;
          winners.push(winner);
        }

        console.info(
          `[qa-8i-live] one digest: ${String(SAME_DIGEST_ROUNDS)} rounds of ${String(RACING_CALLERS)} callers; ` +
            `the caller that stored, by round: ${winners.join(",")}; ` +
            `all callers in flight at once in ${String(roundsAllInFlight)} rounds`,
        );
        expect(roundsAllInFlight).toBeGreaterThanOrEqual(ROUNDS_THAT_MUST_RACE);
      },
      RACE_TIMEOUT_MS,
    );
  });

  describe("N concurrent records of one id with two digests mixed", () => {
    it(
      "store one row whole from one caller, answer a conflict to every caller holding the other digest, and leave the row unchanged by what follows",
      async () => {
        const winners: number[] = [];
        let roundsAllInFlight = 0;

        for (let round = 0; round < MIXED_DIGEST_ROUNDS; round += 1) {
          const id = newClientRequestId();
          const callers = Array.from(
            { length: RACING_CALLERS },
            newRacingCaller,
          );
          const digestOf = (caller: number): string =>
            (caller + round) % 2 === 0 ? DIGEST_A : DIGEST_B;

          const calls = await Promise.all(
            callers.map(({ store }, caller) =>
              timed(0, () =>
                store.record(submissionOfCaller(id, caller, digestOf(caller))),
              ),
            ),
          );
          const rows = await rowsHeldFor(id);

          expect(rows).toHaveLength(1);
          const stored = rows[0]?.["reference"];
          const winner = callers.findIndex(({ proposals }) =>
            proposals.includes(String(stored)),
          );
          expect(winner).toBeGreaterThanOrEqual(0);
          expect(withoutTheServersColumns(rows[0])).toEqual(
            columnsFilledBy(submissionOfCaller(id, winner, digestOf(winner))),
          );
          expect(calls.map((call) => call.outcome)).toEqual(
            callers.map((_caller, caller) =>
              digestOf(caller) === digestOf(winner)
                ? {
                    kind: "stored",
                    reference: stored,
                    isNew: caller === winner,
                    isNotified: false,
                  }
                : { kind: "conflict" },
            ),
          );
          if (wereAllInFlightAtOnce(calls)) roundsAllInFlight += 1;

          const afterwards = await Promise.all(
            callers.map(({ store }, caller) =>
              store.record(submissionOfCaller(id, caller, digestOf(caller))),
            ),
          );

          expect(afterwards.map((answer) => answer.kind)).toEqual(
            callers.map((_caller, caller) =>
              digestOf(caller) === digestOf(winner) ? "stored" : "conflict",
            ),
          );
          expect(await rowsHeldFor(id)).toEqual(rows);
          winners.push(winner);
        }

        console.info(
          `[qa-8i-live] two digests: ${String(MIXED_DIGEST_ROUNDS)} rounds of ${String(RACING_CALLERS)} callers, ` +
            `digests alternating; the caller that stored, by round: ${winners.join(",")}; ` +
            `all callers in flight at once in ${String(roundsAllInFlight)} rounds`,
        );
        expect(roundsAllInFlight).toBeGreaterThanOrEqual(ROUNDS_THAT_MUST_RACE);
      },
      RACE_TIMEOUT_MS,
    );
  });

  describe("record racing markNotified", () => {
    const RECORD_DELAYS_MS = [0, 30, 60, 90, 120, 180, 240];
    const MARK_DELAYS_MS = [20, 70, 130];
    /** Sent with the first record and just after it, so some marks reach the table before the row does. */
    const EARLY_MARK_DELAYS_MS = [0, 0, 5, 15, 90];
    const LOOKUP_DELAYS_MS = [0, 50, 100, 150, 200, 250, 300];
    const OWNER_READ_DELAYS_MS = [40, 110, 170, 260, 330];

    /** What one call said of the mark: `undefined` when it said nothing (no row yet, or a mark that was refused). */
    interface Saying {
      readonly call: string;
      readonly startedAt: number;
      readonly endedAt: number;
      readonly saysNotified: boolean | undefined;
      readonly instant?: unknown;
    }

    function sayingOfAnswer(
      call: string,
      {
        startedAt,
        endedAt,
        outcome,
      }: Timed<SubmissionRecording | SubmissionLookup>,
    ): Saying {
      if (outcome instanceof Error) throw outcome;
      return {
        call,
        startedAt,
        endedAt,
        saysNotified:
          outcome.kind === "stored" ? outcome.isNotified : undefined,
      };
    }

    function sayingOfMark({
      startedAt,
      endedAt,
      outcome,
    }: Timed<void>): Saying {
      if (outcome instanceof Error) {
        expect(outcome).toBeInstanceOf(ContactSubmissionStoreError);
        expect((outcome as ContactSubmissionStoreError).operation).toBe(
          "mark a request notified",
        );
      }
      return {
        call: "mark",
        startedAt,
        endedAt,
        saysNotified: outcome instanceof Error ? undefined : true,
      };
    }

    function sayingOfOwnerRead({
      startedAt,
      endedAt,
      outcome,
    }: Timed<Held[]>): Saying {
      if (outcome instanceof Error) throw outcome;
      const instant = outcome[0]?.["notified_at"];
      return {
        call: "owner read",
        startedAt,
        endedAt,
        saysNotified: outcome.length === 0 ? undefined : instant !== null,
        instant,
      };
    }

    async function raceOnce(
      id: string,
      markDelaysMs: readonly number[] = MARK_DELAYS_MS,
    ): Promise<Saying[]> {
      const store = (): ContactSubmissionStore =>
        new NeonContactSubmissionStore(liveTestDatabaseUrl);
      const request = { clientRequestId: id, payloadDigest: DIGEST_A };
      const [records, marks, lookups, ownerReads] = await Promise.all([
        Promise.all(
          RECORD_DELAYS_MS.map((delay) =>
            timed(delay, () => store().record(aDesignSubmission(id))),
          ),
        ),
        Promise.all(
          markDelaysMs.map((delay) =>
            timed(delay, () => store().markNotified(id)),
          ),
        ),
        Promise.all(
          LOOKUP_DELAYS_MS.map((delay) =>
            timed(delay, () => store().lookUp(request)),
          ),
        ),
        Promise.all(
          OWNER_READ_DELAYS_MS.map((delay) =>
            timed(delay, () => rowsHeldFor(id)),
          ),
        ),
      ]);
      return [
        ...records.map((answer) => sayingOfAnswer("record", answer)),
        ...marks.map(sayingOfMark),
        ...lookups.map((answer) => sayingOfAnswer("lookUp", answer)),
        ...ownerReads.map(sayingOfOwnerRead),
      ];
    }

    /** Pairs where one call had said notified before another was sent, and the later one said it was not. */
    function contradictionsIn(sayings: readonly Saying[]): string[] {
      const notified = sayings.filter((saying) => saying.saysNotified === true);
      return sayings
        .filter((later) => later.saysNotified === false)
        .flatMap((later) =>
          notified
            .filter((earlier) => earlier.endedAt < later.startedAt)
            .map((earlier) => `${earlier.call} then ${later.call}`),
        );
    }

    function instantsSeenIn(sayings: readonly Saying[]): unknown[] {
      return [
        ...new Set(
          sayings
            .map((saying) => saying.instant)
            .filter((instant) => instant !== undefined && instant !== null),
        ),
      ];
    }

    async function expectTheMarkNeverGoesBack(
      id: string,
      sayings: readonly Saying[],
    ): Promise<void> {
      const isMarked = sayings.some(
        (saying) => saying.call === "mark" && saying.saysNotified === true,
      );
      const replay = await new NeonContactSubmissionStore(
        liveTestDatabaseUrl,
      ).record(aDesignSubmission(id));
      const [finalRow, ...others] = await rowsHeldFor(id);

      expect(contradictionsIn(sayings)).toEqual([]);
      expect(others).toEqual([]);
      expect(replay).toMatchObject({ kind: "stored", isNotified: isMarked });
      expect(finalRow?.["notified_at"] !== null).toBe(isMarked);
      expect(
        instantsSeenIn([
          ...sayings,
          { ...NO_SAYING, instant: finalRow?.["notified_at"] },
        ]).length,
      ).toBeLessThanOrEqual(1);
    }

    const NO_SAYING: Saying = {
      call: "final owner read",
      startedAt: 0,
      endedAt: 0,
      saysNotified: undefined,
    };

    function hasBothSayings(sayings: readonly Saying[]): boolean {
      return (
        sayings.some((saying) => saying.saysNotified === false) &&
        sayings.some(
          (saying) => saying.call !== "mark" && saying.saysNotified === true,
        )
      );
    }

    it(
      "never says unnotified after any answer said notified, and never changes the stored instant, on a row already stored",
      async () => {
        let roundsTheMarkLandedAmongAnswers = 0;

        for (let round = 0; round < MARK_RACE_ROUNDS; round += 1) {
          const id = newClientRequestId();
          await new NeonContactSubmissionStore(liveTestDatabaseUrl).record(
            aDesignSubmission(id),
          );

          const sayings = await raceOnce(id);

          await expectTheMarkNeverGoesBack(id, sayings);
          expect(
            sayings
              .filter((saying) => saying.call === "mark")
              .map((saying) => saying.saysNotified),
          ).toEqual(MARK_DELAYS_MS.map(() => true));
          if (hasBothSayings(sayings)) roundsTheMarkLandedAmongAnswers += 1;
        }

        console.info(
          `[qa-8i-live] mark race, stored row: ${String(MARK_RACE_ROUNDS)} rounds; in ` +
            `${String(roundsTheMarkLandedAmongAnswers)} some answers said unnotified and others notified`,
        );
        expect(roundsTheMarkLandedAmongAnswers).toBeGreaterThan(0);
      },
      RACE_TIMEOUT_MS,
    );

    it(
      "holds the same when the first record itself races the marks, some of which find no row yet",
      async () => {
        let marksRefused = 0;
        let marksMade = 0;

        for (let round = 0; round < MARK_RACE_ROUNDS; round += 1) {
          const id = newClientRequestId();

          const sayings = await raceOnce(id, EARLY_MARK_DELAYS_MS);

          await expectTheMarkNeverGoesBack(id, sayings);
          const marks = sayings.filter((saying) => saying.call === "mark");
          marksMade += marks.filter(
            (mark) => mark.saysNotified === true,
          ).length;
          marksRefused += marks.filter(
            (mark) => mark.saysNotified === undefined,
          ).length;
        }

        console.info(
          `[qa-8i-live] mark race, new row: ${String(MARK_RACE_ROUNDS)} rounds; ${String(marksMade)} marks made, ` +
            `${String(marksRefused)} refused because the row was not stored yet`,
        );
        expect(marksMade).toBeGreaterThan(0);
      },
      RACE_TIMEOUT_MS,
    );
  });

  describe("the first reply lost", () => {
    const LOSSES: readonly (readonly [LostReply, LossPoint])[] = [
      ["empty-reply", "after-the-write-lands"],
      ["cold-start-refusal", "after-the-write-lands"],
      ["empty-reply", "before-the-write-lands"],
      ["cold-start-refusal", "before-the-write-lands"],
    ];

    async function cleanRunOf(
      submissionFor: (id: string) => ContactSubmissionToRecord,
    ): Promise<Held> {
      const id = newClientRequestId();
      await new NeonContactSubmissionStore(liveTestDatabaseUrl).record(
        submissionFor(id),
      );
      return comparable((await rowsHeldFor(id))[0]);
    }

    /** A row with its id taken out, so two runs under two ids compare. */
    function comparable(held: Held | undefined): Held {
      return { ...withoutTheServersColumns(held), client_request_id: "<id>" };
    }

    it.each(LOSSES)(
      "record after %s %s: the repeat answers new, and the row equals a clean run's",
      async (reply, point) => {
        const id = newClientRequestId();
        const cleanRow = await cleanRunOf((cleanId) =>
          submissionOfCaller(cleanId, 3, DIGEST_A),
        );
        let rowsBetween: Held[] | undefined;
        const loss = loseTheFirstReply(reply, point, async () => {
          rowsBetween = await rowsHeldFor(id);
        });

        const answer = await new NeonContactSubmissionStore(liveTestDatabaseUrl)
          .record(submissionOfCaller(id, 3, DIGEST_A))
          .finally(loss.restore);
        const rows = await rowsHeldFor(id);

        expect(loss.requestsSent()).toBe(2);
        expect(rows).toHaveLength(1);
        expect(answer).toEqual({
          kind: "stored",
          reference: rows[0]?.["reference"],
          isNew: true,
          isNotified: false,
        });
        expect(rowsBetween).toEqual(
          point === "after-the-write-lands" ? rows : [],
        );
        expect(comparable(rows[0])).toEqual(cleanRow);
      },
      RACE_TIMEOUT_MS,
    );

    it.each(LOSSES)(
      "markNotified after %s %s: the repeat keeps the first instant, and the row equals a clean run's but for the instant",
      async (reply, point) => {
        const id = newClientRequestId();
        const cleanId = newClientRequestId();
        const store = new NeonContactSubmissionStore(liveTestDatabaseUrl);
        await store.record(aDesignSubmission(id));
        await store.record(aDesignSubmission(cleanId));
        await store.markNotified(cleanId);
        let rowsBetween: Held[] = [];
        const loss = loseTheFirstReply(reply, point, async () => {
          rowsBetween = await rowsHeldFor(id);
        });

        await store.markNotified(id).finally(loss.restore);
        const rows = await rowsHeldFor(id);
        const [cleanRow] = await rowsHeldFor(cleanId);

        expect(loss.requestsSent()).toBe(2);
        expect(rows).toHaveLength(1);
        expect(typeof rows[0]?.["notified_at"]).toBe("string");
        expect(typeof cleanRow?.["notified_at"]).toBe("string");
        expect(rowsBetween[0]?.["notified_at"]).toBe(
          point === "after-the-write-lands" ? rows[0]?.["notified_at"] : null,
        );
        expect(comparable(rows[0])).toEqual(comparable(cleanRow));
        expect(
          await store.lookUp({ clientRequestId: id, payloadDigest: DIGEST_A }),
        ).toMatchObject({ kind: "stored", isNotified: true });
      },
      RACE_TIMEOUT_MS,
    );

    it(
      "record whose write landed, marked by another caller before the repeat: the repeat answers new and notified, and the instant stays",
      async () => {
        const id = newClientRequestId();
        let rowsBetween: Held[] = [];
        const loss = loseTheFirstReply(
          "empty-reply",
          "after-the-write-lands",
          async () => {
            await new NeonContactSubmissionStore(
              liveTestDatabaseUrl,
            ).markNotified(id);
            rowsBetween = await rowsHeldFor(id);
          },
        );

        const answer = await new NeonContactSubmissionStore(liveTestDatabaseUrl)
          .record(aDesignSubmission(id))
          .finally(loss.restore);
        const rows = await rowsHeldFor(id);

        expect(answer).toMatchObject({
          kind: "stored",
          isNew: true,
          isNotified: true,
        });
        expect(typeof rows[0]?.["notified_at"]).toBe("string");
        expect(rows).toEqual(rowsBetween);
      },
      RACE_TIMEOUT_MS,
    );

    it(
      "record whose write did not land, overtaken by a twin before the repeat: the repeat is a replay of the twin's row, or a conflict with it",
      async () => {
        const [sameId, otherId] = [newClientRequestId(), newClientRequestId()];
        const overtakenBy = async (
          id: string,
          twinDigest: string,
        ): Promise<SubmissionRecording> => {
          const loss = loseTheFirstReply(
            "cold-start-refusal",
            "before-the-write-lands",
            () =>
              new NeonContactSubmissionStore(liveTestDatabaseUrl).record(
                submissionOfCaller(id, 5, twinDigest),
              ),
          );
          return new NeonContactSubmissionStore(liveTestDatabaseUrl)
            .record(submissionOfCaller(id, 6, DIGEST_A))
            .finally(loss.restore);
        };

        const replay = await overtakenBy(sameId, DIGEST_A);
        const conflict = await overtakenBy(otherId, DIGEST_B);
        const [sameRow] = await rowsHeldFor(sameId);
        const [otherRow] = await rowsHeldFor(otherId);

        expect(replay).toEqual({
          kind: "stored",
          reference: sameRow?.["reference"],
          isNew: false,
          isNotified: false,
        });
        expect(conflict).toEqual({ kind: "conflict" });
        expect(withoutTheServersColumns(sameRow)).toEqual(
          columnsFilledBy(submissionOfCaller(sameId, 5, DIGEST_A)),
        );
        expect(withoutTheServersColumns(otherRow)).toEqual(
          columnsFilledBy(submissionOfCaller(otherId, 5, DIGEST_B)),
        );
      },
      RACE_TIMEOUT_MS,
    );
  });

  describe("a real refusal of the test database, fed through the store's translation", () => {
    const REVISION_PAST_BIGINT = "9223372036854775808";
    const NOT_A_DIGEST = "NOT-A-DIGEST-qa-8i-fake";

    interface OwnerInsert {
      readonly clientRequestId: string;
      readonly reference: string;
      readonly digest: string;
      readonly name: string | null;
      readonly revision: string;
    }

    function ownerInsertOf(changes: Partial<OwnerInsert>): OwnerInsert {
      return {
        clientRequestId: newClientRequestId(),
        reference: generateSubmissionReference(),
        digest: DIGEST_A,
        name: FAKE_NAME,
        revision: "7",
        ...changes,
      };
    }

    /** A plain insert as the owner, with a recognisable fake in every stored field. It names no conflict target, so
     *  the database refuses what the store's own statement would have answered. */
    function insertAsOwner(row: OwnerInsert): Promise<unknown> {
      return neon(liveTestDatabaseUrl)`
        insert into contact_submissions (
          client_request_id, reference, design_id, design_revision, payload_digest,
          name, phone, phone_normal_form, locality, channel, email, consent_text_version, locale,
          design_document, priced
        ) values (
          ${row.clientRequestId}, ${row.reference}, ${FAKE_DESIGN_ID}, ${row.revision}::bigint, ${row.digest},
          ${row.name}, ${FAKE_PHONE}, ${FAKE_PHONE}, ${FAKE_LOCALITY}, 'email', ${FAKE_EMAIL}, 'placeholder', 'ro',
          ${FAKE_SNAPSHOT.document}::jsonb, ${JSON.stringify(FAKE_SNAPSHOT.priced)}::jsonb
        )
      `;
    }

    interface RealRefusal {
      readonly code: string;
      readonly raise: () => Promise<unknown>;
      /** The fakes this refusal is known to hold, so the control below cannot pass on an error that holds none. */
      readonly held: readonly string[];
    }

    const takenId = newClientRequestId();
    const REAL_REFUSALS: readonly (readonly [string, RealRefusal])[] = [
      [
        "a check violation, 23514",
        {
          code: "23514",
          raise: () => insertAsOwner(ownerInsertOf({ digest: NOT_A_DIGEST })),
          held: [
            FAKE_NAME,
            FAKE_PHONE,
            FAKE_EMAIL,
            FAKE_LOCALITY,
            FAKE_DOCUMENT_MARKER,
            FAKE_DESIGN_ID,
            NOT_A_DIGEST,
          ],
        },
      ],
      [
        "a not-null violation, 23502",
        {
          code: "23502",
          raise: () => insertAsOwner(ownerInsertOf({ name: null })),
          held: [FAKE_PHONE, FAKE_EMAIL, FAKE_LOCALITY, FAKE_DOCUMENT_MARKER],
        },
      ],
      [
        "a unique violation of the primary key, 23505",
        {
          code: "23505",
          raise: async () => {
            await insertAsOwner(ownerInsertOf({ clientRequestId: takenId }));
            await insertAsOwner(ownerInsertOf({ clientRequestId: takenId }));
          },
          held: [takenId],
        },
      ],
      [
        "a revision past bigint, 22003",
        {
          code: "22003",
          raise: () =>
            insertAsOwner(ownerInsertOf({ revision: REVISION_PAST_BIGINT })),
          held: [REVISION_PAST_BIGINT],
        },
      ],
    ];

    const ALL_FAKES = [
      FAKE_NAME,
      FAKE_PHONE,
      FAKE_EMAIL,
      FAKE_LOCALITY,
      FAKE_DOCUMENT_MARKER,
      FAKE_DESIGN_ID,
      NOT_A_DIGEST,
      REVISION_PAST_BIGINT,
      TEST_ID_MARKER,
      DIGEST_A,
    ];

    /** The store with its connection replaced by one that raises `refusal`, so the store's own translation runs. */
    function storeWhoseDriverRaises(
      refusal: unknown,
    ): NeonContactSubmissionStore {
      const store = new NeonContactSubmissionStore(liveTestDatabaseUrl);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the driver's own error, as captured.
      Object.assign(store, { sql: () => Promise.reject(refusal) });
      return store;
    }

    const OPERATIONS: readonly (readonly [
      string,
      (store: NeonContactSubmissionStore, id: string) => Promise<unknown>,
    ])[] = [
      ["record", (store, id) => store.record(aDesignSubmission(id))],
      [
        "lookUp",
        (store, id) =>
          store.lookUp({ clientRequestId: id, payloadDigest: DIGEST_A }),
      ],
      ["markNotified", (store, id) => store.markNotified(id)],
    ];

    it.each(REAL_REFUSALS)(
      "%s: the driver's error holds the fakes, and the store's error holds none of them",
      async (_name, { code, raise, held }) => {
        const refusal = await rejectionOf(raise());
        const placesHoldingAFake = [
          ...new Set(
            markersFoundOn(refusal, ALL_FAKES).map((found) =>
              found.slice(0, found.indexOf(":")),
            ),
          ),
        ];
        console.info(
          `[qa-8i-live] a real ${code} holds a fake in: ${placesHoldingAFake.join(", ")}; ` +
            `own properties: ${Object.getOwnPropertyNames(refusal).join(", ")}`,
        );

        expect(refusal).toBeInstanceOf(NeonDbError);
        expect((refusal as NeonDbError).code).toBe(code);
        for (const fake of held) {
          expect(markersFoundOn(refusal, [fake])).not.toEqual([]);
        }

        for (const [, run] of OPERATIONS) {
          const failure = await rejectionOf(
            run(storeWhoseDriverRaises(refusal), newClientRequestId()),
          );

          expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
          expect(markersFoundOn(failure, ALL_FAKES)).toEqual([]);
          expect((failure as Error).cause).toEqual({
            name: "NeonDbError",
            code,
          });
        }
      },
      RACE_TIMEOUT_MS,
    );

    // The shared check refuses in code everything a check, not-null or range constraint would, so the one refusal the
    // store's own statement still meets on the server is the reference's uniqueness.
    it("three real 23505s on the reference's constraint, raised by the store's own statement over the driver, leave as the store error holding no fake, and store nothing", async () => {
      const [holder, refused] = [newClientRequestId(), newClientRequestId()];
      const taken = generateSubmissionReference();
      let draws = 0;
      const store = new NeonContactSubmissionStore(liveTestDatabaseUrl, {
        proposeReference: () => {
          draws += 1;
          return taken;
        },
      });
      await store.record(aCallbackSubmission(holder));
      const holdersRow = await rowsHeldFor(holder);

      const failure = await rejectionOf(
        store.record(aDesignSubmission(refused)),
      );

      expect(draws).toBe(4);
      expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
      expect((failure as Error).cause).toBeUndefined();
      expect(
        markersFoundOn(failure, [...ALL_FAKES, refused, holder, taken]),
      ).toEqual([]);
      expect(await rowsHeldFor(refused)).toEqual([]);
      expect(await rowsHeldFor(holder)).toEqual(holdersRow);
    });
  });

  describe("the shared check against the table", () => {
    const LARGEST_REVISION = "9223372036854775807";
    const NUL = "\u0000";
    const ONE_MEGABYTE = 1_048_576;

    type Change = (
      submission: ContactSubmissionToRecord,
    ) => ContactSubmissionToRecord;

    const withContact =
      (changes: Partial<ContactSubmissionToRecord["contact"]>): Change =>
      (submission) => ({
        ...submission,
        contact: { ...submission.contact, ...changes },
      });

    const withDesign =
      (id: string, revision: string): Change =>
      (submission) => ({
        ...submission,
        target: { kind: "design", design: { id, revision } },
      });

    const withDocument =
      (document: string): Change =>
      (submission) => ({
        ...submission,
        snapshot: { document, priced: FAKE_SNAPSHOT.priced },
      });

    const withPriced =
      (priced: unknown): Change =>
      (submission) => ({
        ...submission,
        snapshot: {
          document: FAKE_SNAPSHOT.document,
          priced: priced as typeof FAKE_SNAPSHOT.priced,
        },
      });

    function isAcceptedByTheCheck(
      submission: ContactSubmissionToRecord,
    ): boolean {
      try {
        requireValidSubmission(submission);
        return true;
      } catch {
        return false;
      }
    }

    const AT_THE_EDGES: readonly (readonly [string, Change])[] = [
      ["a revision of 1", withDesign(FAKE_DESIGN_ID, "1")],
      ["the widest revision", withDesign(FAKE_DESIGN_ID, LARGEST_REVISION)],
      ["a design id of one character", withDesign("x", "7")],
      ["an empty locality", withContact({ locality: "" })],
      [
        "an empty name, phone and normal form",
        withContact({ name: "", phone: "", phoneNormalForm: "" }),
      ],
      [
        "the whatsapp channel with no e-mail",
        withContact({ channel: "whatsapp", email: undefined }),
      ],
      [
        "a name of emoji and diacritics",
        withContact({ name: "Zoë Fäkeperson 👩‍🍳 «ñ»" }),
      ],
      ["an empty document object", withDocument("{}")],
      ["an empty priced object", withPriced({})],
      [
        "a document of one megabyte",
        withDocument(JSON.stringify({ marker: "m".repeat(ONE_MEGABYTE) })),
      ],
    ];

    it.each(AT_THE_EDGES)(
      "stores what the check accepts at the table's edge: %s",
      async (_name, change) => {
        const id = newClientRequestId();
        const submission = change(aDesignSubmission(id));

        const recording = await new NeonContactSubmissionStore(
          liveTestDatabaseUrl,
        ).record(submission);

        expect(isAcceptedByTheCheck(submission)).toBe(true);
        expect(recording).toMatchObject({ kind: "stored", isNew: true });
        expect(withoutTheServersColumns((await rowsHeldFor(id))[0])).toEqual(
          columnsFilledBy(submission),
        );
      },
      RACE_TIMEOUT_MS,
    );

    it("stores an id of sixteen characters and one of sixty-four, and a reference of six and of thirty-two", async () => {
      const shortest = TEST_ID_MARKER;
      const longest = `${TEST_ID_MARKER}${randomBytes(24).toString("hex")}`;
      const sixCharacters = generateSubmissionReference().slice(3, 9);
      const thirtyTwoCharacters = `TEST-R${randomBytes(13).toString("hex").toUpperCase()}`;
      const proposals = [sixCharacters, thirtyTwoCharacters];
      const store = new NeonContactSubmissionStore(liveTestDatabaseUrl, {
        proposeReference: () =>
          proposals.shift() ?? generateSubmissionReference(),
      });

      const answers = [
        await store.record(aCallbackSubmission(shortest)),
        await store.record(aCallbackSubmission(longest)),
      ];

      expect([shortest.length, longest.length]).toEqual([16, 64]);
      expect([sixCharacters.length, thirtyTwoCharacters.length]).toEqual([
        6, 32,
      ]);
      expect(answers).toEqual([
        {
          kind: "stored",
          reference: sixCharacters,
          isNew: true,
          isNotified: false,
        },
        {
          kind: "stored",
          reference: thirtyTwoCharacters,
          isNew: true,
          isNotified: false,
        },
      ]);
    });

    const REFUSED_BY_THE_SERVER: readonly (readonly [string, Change])[] = [
      [
        "a name holding a NUL character",
        withContact({ name: `Zorba${NUL}Fakeperson` }),
      ],
      [
        "a locality holding a NUL character",
        withContact({ locality: `Fake${NUL}ville` }),
      ],
      [
        "a locale holding a NUL character",
        (submission) => ({ ...submission, locale: `ro${NUL}` }),
      ],
      [
        "a design id holding a NUL character",
        withDesign(`Fake${NUL}Design`, "7"),
      ],
      [
        "a document whose text value holds an escaped NUL",
        withDocument(JSON.stringify({ marker: `a${NUL}b` })),
      ],
      [
        "a document whose key holds an escaped NUL",
        withDocument(JSON.stringify({ [`a${NUL}b`]: 1 })),
      ],
      [
        "a priced design whose book version holds a NUL",
        withPriced({ ...FAKE_SNAPSHOT.priced, pricingVersion: `book${NUL}` }),
      ],
      [
        "a priced design that encodes to JSON text, a Date",
        withPriced(new Date(0)),
      ],
      [
        "a name holding half a surrogate pair",
        withContact({ name: "Zorba \ud800 Fakeperson" }),
      ],
      [
        "a document whose text value is an escaped half surrogate",
        withDocument('{"marker":"\\ud800"}'),
      ],
      [
        "a document holding a number wider than numeric",
        withDocument(`{"marker":1e${"9".repeat(7)}}`),
      ],
    ];

    it.each(REFUSED_BY_THE_SERVER)(
      "refuses in code, with no statement stored, what the server would refuse: %s",
      async (_name, change) => {
        const id = newClientRequestId();
        const submission = change(aDesignSubmission(id));

        const refusal = await rejectionOf(
          new NeonContactSubmissionStore(liveTestDatabaseUrl).record(
            submission,
          ),
        );

        expect(isAcceptedByTheCheck(submission)).toBe(false);
        expect(refusal).not.toBeInstanceOf(ContactSubmissionStoreError);
        expect((refusal as Error).message).toMatch(CHECKS_REFUSAL);
        expect(await rowsHeldFor(id)).toEqual([]);
      },
    );
  });

  describe("what the check accepts, the test database stores as it was handed", () => {
    /** The bound of the live property: this many generated snapshots, one statement and one read each. */
    const LIVE_PROPERTY_RUNS = 25;
    const LIVE_PROPERTY_SEED = 8_109;

    interface Kept {
      readonly is_document_kept: boolean;
      readonly is_priced_kept: boolean;
    }

    /** Whether each stored snapshot is, as `jsonb`, what the handed text is as `jsonb`: nothing was rewritten on
     *  the way. */
    async function keptAsHanded(
      id: string,
      handed: { readonly document: string; readonly priced: string },
    ): Promise<Kept | undefined> {
      const rows = (await neon(liveTestDatabaseUrl)`
        select
          (design_document = ${handed.document}::jsonb) as is_document_kept,
          (priced = ${handed.priced}::jsonb) as is_priced_kept
        from contact_submissions
        where client_request_id = ${id}
      `) as Kept[];
      return rows[0];
    }

    async function recordAndCompare(
      document: string,
      priced: unknown,
    ): Promise<unknown> {
      const id = newClientRequestId();
      const recording = await new NeonContactSubmissionStore(
        liveTestDatabaseUrl,
      )
        .record({
          ...aDesignSubmission(id),
          snapshot: {
            document,
            priced: priced as typeof FAKE_SNAPSHOT.priced,
          },
        })
        .catch((error: unknown) =>
          error instanceof Error ? error.message : "a non-error throw",
        );
      const kept = await keptAsHanded(id, {
        document,
        priced: JSON.stringify(priced),
      });
      return {
        recording: typeof recording === "string" ? recording : recording.kind,
        kept,
      };
    }

    const STORED_AS_HANDED = {
      recording: "stored",
      kept: { is_document_kept: true, is_priced_kept: true },
    };

    it(
      "stores every one of a bounded run of generated snapshots, each equal as jsonb to the text handed in",
      async () => {
        const snapshots = fc.sample(
          fc.tuple(cleanJsonObject, cleanJsonObject),
          { numRuns: LIVE_PROPERTY_RUNS, seed: LIVE_PROPERTY_SEED },
        );

        const outcomes = [];
        for (const [document, priced] of snapshots) {
          outcomes.push(
            await recordAndCompare(JSON.stringify(document), priced),
          );
        }

        expect(outcomes).toEqual(snapshots.map(() => STORED_AS_HANDED));
      },
      RACE_TIMEOUT_MS,
    );

    it.each([
      [
        "keys named __proto__ and constructor",
        '{"__proto__":{"a":1},"constructor":{"prototype":"p"}}',
      ],
      [
        "the widest and the narrowest double as JavaScript writes them",
        '{"a":1.7976931348623157e+308,"b":5e-324,"c":-1.7976931348623157e+308}',
      ],
      ["the fixture's own document", FAKE_SNAPSHOT.document],
      [
        "sixty-four levels, the deepest the check admits",
        `{"deep":${"[".repeat(63)}${"]".repeat(63)}}`,
      ],
    ])(
      "stores a document of %s equal as jsonb to the text handed in",
      async (_name, document) => {
        expect(await recordAndCompare(document, FAKE_SNAPSHOT.priced)).toEqual(
          STORED_AS_HANDED,
        );
      },
    );

    // A document that is not its own encoding, or is deeper than 64 levels, is refused in
    // code and never rewritten, so nothing of it is stored.
    it.each([
      ["padding around it", ' \n\t{ "marker" : 1 }\r\n '],
      ["a key written twice", '{"a":1,"a":{"b":2},"a":3}'],
      [
        "numbers written with a scale and an exponent",
        '{"a":1.50,"b":1E2,"c":-0,"d":0.1e-5}',
      ],
      [
        "the widest double written without its sign of the exponent",
        '{"a":1.7976931348623157e308}',
      ],
      [
        "needless escapes of storable text",
        '{"a":"\\u0041\\ud83d\\ude00\\n\\u2028","\\u0062":1}',
      ],
      [
        "five thousand lists, one inside the other",
        `{"deep":${"[".repeat(5_000)}${"]".repeat(5_000)}}`,
      ],
      ["a whole number past a double's reach", '{"n":9007199254740993}'],
      [
        "a decimal of more digits than a double keeps",
        '{"n":0.1000000000000000055511151231257827}',
      ],
      [
        "sixty-five levels, one past the bound",
        `{"deep":${"[".repeat(64)}${"]".repeat(64)}}`,
      ],
    ])(
      "refuses in code a document of %s, and stores nothing",
      async (_name, document) => {
        const outcome = (await recordAndCompare(
          document,
          FAKE_SNAPSHOT.priced,
        )) as { recording: string; kept: Kept | undefined };

        expect(outcome.recording).toMatch(CHECKS_REFUSAL);
        expect(outcome.kept).toBeUndefined();
      },
    );

    it.each(REAL_SNAPSHOTS)(
      "stores the real snapshot of $name equal as jsonb to the document and the priced design handed in",
      async ({ snapshot }) => {
        expect(
          await recordAndCompare(snapshot.document, snapshot.priced),
        ).toEqual(STORED_AS_HANDED);
      },
    );
  });

  describe("the questions the grant test asks, put to a connection that holds everything", () => {
    const CONTACT_SUBMISSIONS = "public.contact_submissions";

    it("answer every privilege and every column for the table's owner, so a wider grant is not read as the narrow one", async () => {
      const sql = neon(liveTestDatabaseUrl);
      const everyColumn = [...ALL_COLUMNS].sort();

      const known = await tablePrivilegesTheServerKnows(sql);

      expect(await privilegesHeldOn(sql, CONTACT_SUBMISSIONS, known)).toEqual(
        known,
      );
      expect(await columnsOf(sql, CONTACT_SUBMISSIONS)).toEqual(everyColumn);
      for (const privilege of ["SELECT", "UPDATE", "REFERENCES"]) {
        expect(
          await columnsHolding(sql, CONTACT_SUBMISSIONS, privilege),
        ).toEqual(everyColumn);
      }
    });

    it("answer every privilege and every column as held with grant option for the table's owner, so the grant test's empty lists are not what any connection gets", async () => {
      const sql = neon(liveTestDatabaseUrl);
      const everyColumn = [...ALL_COLUMNS].sort();

      const known = await tablePrivilegesTheServerKnows(sql);

      expect(
        await privilegesHeldWithGrantOption(sql, CONTACT_SUBMISSIONS, known),
      ).toEqual(known);
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
        expect(
          await columnsHolding(
            sql,
            CONTACT_SUBMISSIONS,
            `${privilege} WITH GRANT OPTION`,
          ),
        ).toEqual(everyColumn);
      }
    });
  });

  describe("the fake and the Neon store, where the contract suite does not look", () => {
    const STORES: readonly (readonly [
      string,
      (proposeReference?: () => string) => ContactSubmissionStore,
    ])[] = [
      [
        "the fake",
        (proposeReference) =>
          new FakeContactSubmissionStore(
            proposeReference === undefined ? {} : { proposeReference },
          ),
      ],
      [
        "the Neon store",
        (proposeReference) =>
          new NeonContactSubmissionStore(
            liveTestDatabaseUrl,
            proposeReference === undefined ? {} : { proposeReference },
          ),
      ],
    ];

    /** Hands out the given references in order and then fresh ones, and counts how many were asked for. */
    function countingProposer(...references: string[]): {
      readonly propose: () => string;
      readonly draws: () => number;
    } {
      let draws = 0;
      return {
        propose: () => {
          draws += 1;
          return references.shift() ?? generateSubmissionReference();
        },
        draws: () => draws,
      };
    }

    it.each(STORES)(
      "%s answers not new to a replay under fresh proposals, and draws once for each record",
      async (_name, createStore) => {
        const first = generateSubmissionReference();
        const proposer = countingProposer(first);
        const store = createStore(proposer.propose);
        const id = newClientRequestId();

        const answers = [
          await store.record(aDesignSubmission(id)),
          await store.record(aDesignSubmission(id)),
          await store.record(aDesignSubmission(id)),
        ];

        expect(answers).toEqual([
          { kind: "stored", reference: first, isNew: true, isNotified: false },
          { kind: "stored", reference: first, isNew: false, isNotified: false },
          { kind: "stored", reference: first, isNew: false, isNotified: false },
        ]);
        expect(proposer.draws()).toBe(3);
      },
    );

    /** One for each of the five records, and one more for the collision. */
    const DRAWS_OF_THE_SCRIPT = 6;

    it("the fake and the Neon store answer alike, and draw alike, under a proposer that repeats itself and then collides", async () => {
      const script = async (
        createStore: (proposeReference: () => string) => ContactSubmissionStore,
      ): Promise<unknown[]> => {
        const [repeated, free] = [
          generateSubmissionReference(),
          generateSubmissionReference(),
        ];
        const proposer = countingProposer(
          repeated,
          repeated,
          repeated,
          repeated,
          free,
        );
        const store = createStore(proposer.propose);
        const [first, second] = [newClientRequestId(), newClientRequestId()];
        const answers = [
          await store.record(aDesignSubmission(first)),
          await store.record(aDesignSubmission(first)),
          await store.record(aDesignSubmission(first, DIGEST_B)),
          await store.record(aDesignSubmission(second)),
          await store.record(aDesignSubmission(second)),
        ];
        return [
          ...answers.map((answer) =>
            answer.kind === "stored"
              ? {
                  ...answer,
                  reference:
                    answer.reference === repeated ? "repeated" : "free",
                }
              : answer,
          ),
          proposer.draws(),
        ];
      };
      const [, createFake] = STORES[0] ?? [];
      const [, createNeon] = STORES[1] ?? [];
      if (createFake === undefined || createNeon === undefined) {
        throw new Error("both stores are needed");
      }

      const fromTheFake = await script(createFake);
      const fromNeon = await script(createNeon);

      expect(fromTheFake).toEqual(fromNeon);
      expect(fromNeon).toEqual([
        {
          kind: "stored",
          reference: "repeated",
          isNew: true,
          isNotified: false,
        },
        {
          kind: "stored",
          reference: "repeated",
          isNew: true,
          isNotified: false,
        },
        { kind: "conflict" },
        { kind: "stored", reference: "free", isNew: true, isNotified: false },
        { kind: "stored", reference: "free", isNew: false, isNotified: false },
        DRAWS_OF_THE_SCRIPT,
      ]);
    });

    it.each(STORES)(
      "%s fails a mark of an id never stored with the same error: its operation, its message and no cause",
      async (_name, createStore) => {
        const failure = await rejectionOf(
          createStore().markNotified(newClientRequestId()),
        );

        expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
        expect({
          operation: (failure as ContactSubmissionStoreError).operation,
          message: (failure as Error).message,
          cause: (failure as Error).cause,
        }).toEqual({
          operation: "mark a request notified",
          message:
            "The contact submission store could not mark a request notified: the database gave no trustworthy answer.",
          cause: undefined,
        });
      },
    );

    it.each(STORES)(
      "%s answers a conflict that holds its kind alone, to a record and to a lookup, marked or not",
      async (_name, createStore) => {
        const store = createStore();
        const id = newClientRequestId();
        await store.record(aCallbackSubmission(id, DIGEST_A));
        const other = { clientRequestId: id, payloadDigest: DIGEST_B };

        const before = [
          await store.record(aCallbackSubmission(id, DIGEST_B)),
          await store.lookUp(other),
        ];
        await store.markNotified(id);
        const after = [
          await store.record(aDesignSubmission(id, DIGEST_B)),
          await store.lookUp(other),
        ];

        for (const answer of [...before, ...after]) {
          expect(answer).toStrictEqual({ kind: "conflict" });
        }
      },
    );

    it.each(STORES)(
      "%s keeps a marked request marked through any order of replays, conflicts and marks",
      async (_name, createStore) => {
        const store = createStore();
        const id = newClientRequestId();
        const request = { clientRequestId: id, payloadDigest: DIGEST_A };
        await store.record(aDesignSubmission(id));
        await store.markNotified(id);

        await store.record(aDesignSubmission(id, DIGEST_B));
        await store.markNotified(id);
        const replay = await store.record(aDesignSubmission(id));
        await store.record(aCallbackSubmission(id));

        expect(replay).toMatchObject({ isNew: false, isNotified: true });
        expect(await store.lookUp(request)).toMatchObject({
          kind: "stored",
          isNotified: true,
        });
      },
    );
  });
});
