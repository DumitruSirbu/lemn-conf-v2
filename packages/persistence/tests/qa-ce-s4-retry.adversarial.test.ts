// M7C wave CE slice S4, adversarial QA. The owner's rule under test: a retry never leaves a trace of
// the attempt it replaces, so a retried call ends in the same rows, and gives the same answer, as a
// clean run of the same calls in the same order. Each scenario runs once with the first reply lost and
// once clean, then compares the two. "Meanwhile" is another caller's write slipped in after the lost
// attempt and before the retry, which is the window the 500 ms backoff opens.
import { randomBytes } from "node:crypto";

import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { NeonDbError, neon, neonConfig } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { runMigrations } from "../src/migrate.js";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
  NeonConfigurationRepository,
} from "../src/neon-configuration-repository.js";
import type {
  AuthorizedSave,
  MintVisitor,
} from "../src/neon-configuration-repository.js";
import {
  isTransientFailure,
  retryOnTransientFailure,
} from "../src/retry-on-transient-failure.js";
import { NeonShareLinkRepository } from "../src/share-link-repository.js";
import type { ShareLinkCredentials } from "../src/share-link-repository.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

holdSharedTestSchemaLock();

const SUITE_NAME = "QA CE S4: a retry leaves no trace (live test database)";
const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

const EMPTY_REPLY_MESSAGE = "Unexpected end of JSON input";
const COLD_START_BODY = JSON.stringify({
  message: "Couldn't connect to compute node",
  "neon:retryable": true,
});

type LostReply = "empty-reply" | "cold-start-refusal";
const LOST_REPLIES: readonly LostReply[] = [
  "empty-reply",
  "cold-start-refusal",
];

interface Interception {
  readonly reply: LostReply;
  /** Whether each lost attempt reaches the database before its reply is replaced. */
  readonly doesLand: boolean;
  readonly lostRepliesInARow?: number;
  /** Another caller's work, run after the first lost attempt and before the retry. */
  readonly meanwhile?: (() => Promise<unknown>) | undefined;
}

function lostReply(reply: LostReply): Response {
  return reply === "empty-reply"
    ? new Response("", { status: 200 })
    : new Response(COLD_START_BODY, { status: 500 });
}

/**
 * Loses the replies to the call under test's first attempts. Requests made by `meanwhile` pass
 * through untouched and are not counted as the call's attempts.
 */
async function withInterception<T>(
  interception: Interception,
  call: () => Promise<T>,
): Promise<{ result: T | undefined; error: unknown; attempts: number }> {
  const previousFetchFunction: unknown = neonConfig.fetchFunction;
  const lostCount = interception.lostRepliesInARow ?? 1;
  let attempts = 0;
  let isInterleaving = false;
  neonConfig.fetchFunction = async (url: string, init: RequestInit) => {
    if (isInterleaving) return fetch(url, init);
    attempts += 1;
    if (attempts > lostCount) return fetch(url, init);
    if (interception.doesLand) await (await fetch(url, init)).text();
    if (attempts === 1 && interception.meanwhile) {
      isInterleaving = true;
      try {
        await interception.meanwhile();
      } finally {
        isInterleaving = false;
      }
    }
    return lostReply(interception.reply);
  };
  try {
    return { result: await call(), error: undefined, attempts };
  } catch (error) {
    return { result: undefined, error, attempts };
  } finally {
    neonConfig.fetchFunction = previousFetchFunction;
  }
}

/** A thrown error reduced to what a caller can tell apart, so two runs compare by kind. */
function answerOf<T>(run: { result: T | undefined; error: unknown }) {
  if (run.error instanceof DesignWriteConflictError)
    return { kind: "conflict" };
  if (run.error instanceof DesignWriteForbiddenError)
    return { kind: "forbidden" };
  if (run.error !== undefined)
    return {
      kind: "error",
      error: run.error instanceof Error ? run.error.message : typeof run.error,
    };
  return { kind: "answered", value: run.result };
}

function randomDigest(): string {
  return randomBytes(32).toString("hex");
}

interface DesignRow {
  document: Design;
  revision: string;
  visitor_hash: string;
}

interface ShareRow {
  token_hash: string;
  is_active: boolean;
}

describe.skipIf(!hasLiveDatabase)(SUITE_NAME, () => {
  const mintedIds: DesignId[] = [];
  const visitorHashes: string[] = [];

  const configurations = () => new NeonConfigurationRepository(testDatabaseUrl);
  const shareLinks = () => new NeonShareLinkRepository(testDatabaseUrl);

  function newVisitorHash(): string {
    const visitorHash = randomDigest();
    visitorHashes.push(visitorHash);
    return visitorHash;
  }

  async function mint(visitor: MintVisitor, design: Design = KITCHEN_L_DESIGN) {
    const writeTokenHash = randomDigest();
    const minted = await configurations().mint({
      design,
      writeTokenHash,
      visitor,
    });
    mintedIds.push(minted.id);
    return { id: minted.id, writeTokenHash };
  }

  async function freshDesign(): Promise<ShareLinkCredentials> {
    const visitorHash = newVisitorHash();
    const { id, writeTokenHash } = await mint({ kind: "fresh", visitorHash });
    return { designId: id, writeTokenHash, visitorHash };
  }

  function saveOf(
    credentials: ShareLinkCredentials,
    design: Design,
    expectedRevision: string,
  ): AuthorizedSave {
    return {
      id: credentials.designId,
      design,
      writeTokenHash: credentials.writeTokenHash,
      expectedRevision,
      requestVisitor: { kind: "present", visitorHash: credentials.visitorHash },
    };
  }

  async function designRow(id: DesignId) {
    const rows = (await neon(testDatabaseUrl)`
      select document, revision::text as revision, visitor_hash from designs where id = ${id}
    `) as DesignRow[];
    return rows.map((row) => ({
      document: row.document,
      revision: row.revision,
    }));
  }

  async function shareRows(designId: DesignId, roles: Record<string, string>) {
    const rows = (await neon(testDatabaseUrl)`
      select token_hash, revoked_at is null as is_active
      from design_share_links where design_id = ${designId}
    `) as ShareRow[];
    return rows
      .map((row) => ({
        role: roles[row.token_hash] ?? "unexpected",
        isActive: row.is_active,
      }))
      .sort((a, b) => a.role.localeCompare(b.role));
  }

  async function saveAnswer(save: AuthorizedSave) {
    const saved = await configurations().saveAuthorized(save);
    return { revision: saved.revision, ownsVisitor: saved.ownsVisitor };
  }

  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
  });

  afterEach(async () => {
    const ids = mintedIds.splice(0, mintedIds.length);
    const visitors = visitorHashes.splice(0, visitorHashes.length);
    await neon(testDatabaseUrl)`
      delete from designs where id = any(${ids}) or visitor_hash = any(${visitors})
    `;
  });

  describe("save: the retry-only landed arm", () => {
    const documentA: Design = { ...KITCHEN_L_DESIGN, presetId: "qa-s4-a" };
    const documentC: Design = { ...KITCHEN_L_DESIGN, presetId: "qa-s4-c" };

    it.each(LOST_REPLIES)(
      "lands a document whose key order, numbers and escapes jsonb normalises (%s), as a clean save does",
      async (reply) => {
        const awkward = {
          zeta: 1,
          a: 1e21,
          mid: 0.30000000000000004,
          négatif: -0,
          text: 'quote " backslash \\ tab \t é 😀',
          ...KITCHEN_L_DESIGN,
          presetId: "qa-s4-awkward",
        } as unknown as Design;
        async function scenario(reply: LostReply | undefined) {
          const credentials = await freshDesign();
          const run = await withInterception(
            {
              reply: reply ?? "empty-reply",
              doesLand: true,
              lostRepliesInARow: reply ? 1 : 0,
            },
            () => saveAnswer(saveOf(credentials, awkward, "1")),
          );
          return {
            answer: answerOf(run),
            row: await designRow(credentials.designId),
          };
        }

        const clean = await scenario(undefined);
        const retried = await scenario(reply);

        expect(clean.answer).toEqual({
          kind: "answered",
          value: { revision: "2", ownsVisitor: true },
        });
        expect(retried).toEqual(clean);
      },
    );

    it.each(LOST_REPLIES)(
      "lands once and answers as a clean save after two lost replies in a row (%s)",
      async (reply) => {
        const credentials = await freshDesign();

        const run = await withInterception(
          { reply, doesLand: true, lostRepliesInARow: 2 },
          () => saveAnswer(saveOf(credentials, documentA, "1")),
        );

        expect(run.attempts).toBe(3);
        expect(answerOf(run)).toEqual({
          kind: "answered",
          value: { revision: "2", ownsVisitor: true },
        });
        expect(await designRow(credentials.designId)).toEqual([
          { document: documentA, revision: "2" },
        ]);
      },
    );

    it.each(LOST_REPLIES)(
      "answers the same ownership as a clean save when the caller sends no visitor or another one (%s)",
      async (reply) => {
        async function scenario(
          reply: LostReply | undefined,
          visitorHash: string | undefined,
        ) {
          const credentials = await freshDesign();
          const save: AuthorizedSave = {
            ...saveOf(credentials, documentA, "1"),
            requestVisitor:
              visitorHash === undefined
                ? { kind: "absent" }
                : { kind: "present", visitorHash },
          };
          const run = await withInterception(
            {
              reply: reply ?? "empty-reply",
              doesLand: true,
              lostRepliesInARow: reply ? 1 : 0,
            },
            () => saveAnswer(save),
          );
          return answerOf(run);
        }
        const otherVisitor = randomDigest();

        expect(await scenario(reply, undefined)).toEqual(
          await scenario(undefined, undefined),
        );
        expect(await scenario(reply, otherVisitor)).toEqual(
          await scenario(undefined, otherVisitor),
        );
      },
    );

    it.each(LOST_REPLIES)(
      "a retry whose first attempt never reached the database saves once, as a clean save does (%s)",
      async (reply) => {
        const credentials = await freshDesign();

        const run = await withInterception({ reply, doesLand: false }, () =>
          saveAnswer(saveOf(credentials, documentA, "1")),
        );

        expect(answerOf(run)).toEqual({
          kind: "answered",
          value: { revision: "2", ownsVisitor: true },
        });
        expect(await designRow(credentials.designId)).toEqual([
          { document: documentA, revision: "2" },
        ]);
      },
    );

    it.each(LOST_REPLIES)(
      "a retry under another write token never takes the landed arm, even over an identical document (%s)",
      async (reply) => {
        const credentials = await freshDesign();
        await configurations().saveAuthorized(
          saveOf(credentials, documentA, "1"),
        );

        const run = await withInterception({ reply, doesLand: false }, () =>
          saveAnswer({
            ...saveOf(credentials, documentA, "1"),
            writeTokenHash: randomDigest(),
          }),
        );

        expect(answerOf(run)).toEqual({ kind: "forbidden" });
        expect(await designRow(credentials.designId)).toEqual([
          { document: documentA, revision: "2" },
        ]);
      },
    );

    it.each(LOST_REPLIES)(
      "a retry against another design id holding the same document at the next revision is forbidden (%s)",
      async (reply) => {
        const owner = await freshDesign();
        const other = await freshDesign();
        await configurations().saveAuthorized(saveOf(other, documentA, "1"));

        const run = await withInterception({ reply, doesLand: false }, () =>
          saveAnswer({ ...saveOf(owner, documentA, "1"), id: other.designId }),
        );

        expect(answerOf(run)).toEqual({ kind: "forbidden" });
      },
    );

    // Disclosed by the implementer and pinned as observed: rows match the clean run (A then C), but
    // the clean run answered A with revision 2 and the retry answers a conflict. Owner ruling needed.
    it.each(LOST_REPLIES)(
      "a third writer between landing and retry: same rows as a clean run, but the retry answers a conflict (%s)",
      async (reply) => {
        async function scenario(reply: LostReply | undefined) {
          const credentials = await freshDesign();
          const thirdWriter = () =>
            configurations().saveAuthorized(
              saveOf(credentials, documentC, "2"),
            );
          const run = await withInterception(
            {
              reply: reply ?? "empty-reply",
              doesLand: true,
              lostRepliesInARow: reply ? 1 : 0,
              meanwhile: reply ? thirdWriter : undefined,
            },
            () => saveAnswer(saveOf(credentials, documentA, "1")),
          );
          if (!reply) await thirdWriter();
          return {
            answer: answerOf(run),
            row: await designRow(credentials.designId),
          };
        }

        const clean = await scenario(undefined);
        const retried = await scenario(reply);

        expect(retried.row).toEqual(clean.row);
        expect(clean.answer).toEqual({
          kind: "answered",
          value: { revision: "2", ownsVisitor: true },
        });
        expect(retried.answer).toEqual({ kind: "conflict" });
      },
    );

    // Pinned as observed: a second tab saving the identical document while the first attempt was lost
    // in transit. A clean run (tab B, then tab A) answers A with a conflict; the retry adopts B's row.
    it.each(LOST_REPLIES)(
      "a second tab's identical save before an unlanded attempt: the retry adopts that row as its own (%s)",
      async (reply) => {
        const credentials = await freshDesign();
        const otherTab = () =>
          configurations().saveAuthorized(saveOf(credentials, documentA, "1"));

        const run = await withInterception(
          { reply, doesLand: false, meanwhile: otherTab },
          () => saveAnswer(saveOf(credentials, documentA, "1")),
        );

        expect(answerOf(run)).toEqual({
          kind: "answered",
          value: { revision: "2", ownsVisitor: true },
        });
        expect(await designRow(credentials.designId)).toEqual([
          { document: documentA, revision: "2" },
        ]);
      },
    );
  });

  describe("share-link issue: interleavings between the lost attempt and its retry", () => {
    it.each(LOST_REPLIES)(
      "an issue retried after the owner revoked from another tab answers issued, as a clean run does (%s)",
      async (reply) => {
        async function scenario(reply: LostReply | undefined) {
          const credentials = await freshDesign();
          const token = randomDigest();
          const revokeFromOtherTab = () => shareLinks().revoke(credentials);
          const run = await withInterception(
            {
              reply: reply ?? "empty-reply",
              doesLand: true,
              lostRepliesInARow: reply ? 1 : 0,
              meanwhile: reply ? revokeFromOtherTab : undefined,
            },
            () => shareLinks().issue({ ...credentials, tokenHash: token }),
          );
          if (!reply) await revokeFromOtherTab();
          return {
            answer: answerOf(run),
            links: await shareRows(credentials.designId, { [token]: "issued" }),
          };
        }

        const clean = await scenario(undefined);
        const retried = await scenario(reply);

        expect(clean).toEqual({
          answer: { kind: "answered", value: "issued" },
          links: [{ role: "issued", isActive: false }],
        });
        expect(retried).toEqual(clean);
      },
    );

    it.each(LOST_REPLIES)(
      "an issue retried after the owner issued again from another tab leaves that tab's link active, as a clean run does (%s)",
      async (reply) => {
        async function scenario(reply: LostReply | undefined) {
          const credentials = await freshDesign();
          const firstTabToken = randomDigest();
          const otherTabToken = randomDigest();
          const issueFromOtherTab = () =>
            shareLinks().issue({ ...credentials, tokenHash: otherTabToken });
          const run = await withInterception(
            {
              reply: reply ?? "empty-reply",
              doesLand: true,
              lostRepliesInARow: reply ? 1 : 0,
              meanwhile: reply ? issueFromOtherTab : undefined,
            },
            () =>
              shareLinks().issue({ ...credentials, tokenHash: firstTabToken }),
          );
          if (!reply) await issueFromOtherTab();
          return {
            answer: answerOf(run),
            links: await shareRows(credentials.designId, {
              [firstTabToken]: "first tab",
              [otherTabToken]: "other tab",
            }),
            otherTabOpens: (await shareLinks().loadShared(otherTabToken)).kind,
          };
        }

        const clean = await scenario(undefined);
        const retried = await scenario(reply);

        expect(clean.links).toEqual([
          { role: "first tab", isActive: false },
          { role: "other tab", isActive: true },
        ]);
        expect(retried).toEqual(clean);
      },
    );

    it.each(LOST_REPLIES)(
      "after any lost-reply issue there is exactly one active link (%s)",
      async (reply) => {
        const credentials = await freshDesign();
        const [tokenA, tokenB, tokenC] = [
          randomDigest(),
          randomDigest(),
          randomDigest(),
        ];
        await shareLinks().issue({ ...credentials, tokenHash: tokenA });

        await withInterception({ reply, doesLand: true }, () =>
          shareLinks().issue({ ...credentials, tokenHash: tokenB }),
        );
        await withInterception({ reply, doesLand: false }, () =>
          shareLinks().issue({ ...credentials, tokenHash: tokenC }),
        );

        const links = await shareRows(credentials.designId, {
          [tokenA]: "a",
          [tokenB]: "b",
          [tokenC]: "c",
        });
        expect(links).toEqual([
          { role: "a", isActive: false },
          { role: "b", isActive: false },
          { role: "c", isActive: true },
        ]);
      },
    );

    it("an issue refused because its token already belongs to another design changes nothing", async () => {
      const owner = await freshDesign();
      const other = await freshDesign();
      const ownersLink = randomDigest();
      const takenToken = randomDigest();
      await shareLinks().issue({ ...owner, tokenHash: ownersLink });
      await shareLinks().issue({ ...other, tokenHash: takenToken });

      const outcome = await shareLinks().issue({
        ...owner,
        tokenHash: takenToken,
      });

      expect(outcome).toBe("refused");
      expect(
        await shareRows(owner.designId, { [ownersLink]: "owner's link" }),
      ).toEqual([{ role: "owner's link", isActive: true }]);
    });
  });

  describe("mint: rotation under a lost reply", () => {
    it.each(LOST_REPLIES)(
      "a rotation whose first attempt never landed moves each earlier design once (%s)",
      async (reply) => {
        const fromVisitorHash = newVisitorHash();
        const toVisitorHash = newVisitorHash();
        const earlier = [
          await mint({ kind: "fresh", visitorHash: fromVisitorHash }),
          await mint({ kind: "fresh", visitorHash: fromVisitorHash }),
        ];

        const run = await withInterception({ reply, doesLand: false }, () =>
          mint({ kind: "rotate", visitorHash: toVisitorHash, fromVisitorHash }),
        );

        expect(run.error).toBeUndefined();
        const owned = (await neon(testDatabaseUrl)`
          select id from designs where visitor_hash = ${toVisitorHash} order by id
        `) as { id: string }[];
        expect(owned.map((row) => row.id).sort()).toEqual(
          [...earlier.map((design) => design.id), run.result?.id].sort(),
        );
      },
    );

    it.each(LOST_REPLIES)(
      "a fresh mint losing two replies in a row still inserts one row (%s)",
      async (reply) => {
        const visitorHash = newVisitorHash();

        const run = await withInterception(
          { reply, doesLand: true, lostRepliesInARow: 2 },
          () => mint({ kind: "fresh", visitorHash }),
        );

        expect(run.attempts).toBe(3);
        const rows = (await neon(testDatabaseUrl)`
          select id from designs where visitor_hash = ${visitorHash}
        `) as { id: string }[];
        expect(rows).toEqual([{ id: run.result?.id }]);
      },
    );
  });
});

describe("isTransientFailure: what counts as an empty reply", () => {
  function namedError(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  it.each([
    [
      "the driver's own empty-reply SyntaxError",
      new SyntaxError(EMPTY_REPLY_MESSAGE),
    ],
  ])("retries %s", (_label, error) => {
    expect(isTransientFailure(error)).toBe(true);
  });

  it.each([
    [
      "a SyntaxError for a non-JSON gateway page",
      new SyntaxError(`Unexpected token '<', "<html>" is not valid JSON`),
    ],
    [
      "a SyntaxError for a body cut mid-string",
      new SyntaxError(
        "Unterminated string in JSON at position 9 (line 1 column 10)",
      ),
    ],
    [
      "the empty-reply message with surrounding text",
      new SyntaxError(`${EMPTY_REPLY_MESSAGE} at JSON.parse`),
    ],
    [
      "the empty-reply message in another case",
      new SyntaxError(EMPTY_REPLY_MESSAGE.toLowerCase()),
    ],
    [
      "the empty-reply message on a plain Error",
      new Error(EMPTY_REPLY_MESSAGE),
    ],
    [
      "the empty-reply message on a TypeError",
      new TypeError(EMPTY_REPLY_MESSAGE),
    ],
    [
      "the empty-reply message on a NeonDbError",
      new NeonDbError(EMPTY_REPLY_MESSAGE),
    ],
    [
      "the empty-reply message wrapped as a cause",
      new Error("save failed", { cause: new SyntaxError(EMPTY_REPLY_MESSAGE) }),
    ],
    ["a string carrying the message", EMPTY_REPLY_MESSAGE],
    [
      "an object shaped like the error but not an Error",
      { name: "SyntaxError", message: EMPTY_REPLY_MESSAGE },
    ],
    [
      "a dropped pooled connection",
      new Error("Connection terminated unexpectedly"),
    ],
    ["undefined", undefined],
    ["null", null],
  ])("does not retry %s", (_label, error) => {
    expect(isTransientFailure(error)).toBe(false);
  });

  it("treats any Error named SyntaxError with the exact message as an empty reply, whatever realm built it", () => {
    expect(
      isTransientFailure(namedError("SyntaxError", EMPTY_REPLY_MESSAGE)),
    ).toBe(true);
  });

  it("propagates a non-transient error unchanged, the same object, after exactly one attempt", async () => {
    const original = new SyntaxError(
      "Unexpected token 'x', \"x\" is not valid JSON",
    );
    const query = vi.fn(() => Promise.reject(original));

    await expect(retryOnTransientFailure(query)).rejects.toBe(original);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("tells the first attempt it is not a retry and every later attempt that it is", async () => {
    vi.useFakeTimers();
    try {
      const seen: boolean[] = [];
      const query = vi.fn(({ isRetry }: { isRetry: boolean }) => {
        seen.push(isRetry);
        return seen.length < 3
          ? Promise.reject(new SyntaxError(EMPTY_REPLY_MESSAGE))
          : Promise.resolve("done");
      });

      const result = retryOnTransientFailure(query);
      await vi.runAllTimersAsync();

      await expect(result).resolves.toBe("done");
      expect(seen).toEqual([false, true, true]);
    } finally {
      vi.useRealTimers();
    }
  });
});
