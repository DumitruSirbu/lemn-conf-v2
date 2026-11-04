// Adversarial QA of the publish screens' fetching client: every status and body a route could send, well-formed or not, is
// sorted into a true outcome. A 401 ends the session whatever it carries, anything unexpected is a failure and never an
// allowance, and a request that could not be made or read never throws into the screen.
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FETCHING_PUBLISH_CLIENT } from "@/price-dashboard/fetching-publish-client";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";

const REVISION = "7";
const SEND = { expectedDraftRevision: REVISION };
const PUBLISH_REQUEST = {
  expectedDraftRevision: REVISION,
  expectedActiveSequence: 1,
  expectedAvailabilityRevision: "3",
  label: "Autumn",
  note: "",
};
const ANCHOR = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
} as const;
const DRAFT_BODY = { draftRevision: "8", changes: [] };

type Call = () => Promise<{ readonly kind: string } | undefined>;

const PUBLISH: Call = () => FETCHING_PUBLISH_CLIENT.publish(PUBLISH_REQUEST);
const RESTORE: Call = () => FETCHING_PUBLISH_CLIENT.restore("abc", SEND);
const DISCARD: Call = () =>
  FETCHING_PUBLISH_CLIENT.discardDraft({ ...SEND, scope: "all" });
const VERSIONS: Call = () => FETCHING_PUBLISH_CLIENT.readVersionPage(2);
const CHANGE: Call = () =>
  FETCHING_PUBLISH_CLIENT.change({
    ...SEND,
    change: { address: ANCHOR, value: 1 },
  });
const REVERT: Call = () =>
  FETCHING_PUBLISH_CLIENT.revert({
    ...SEND,
    target: { kind: "change", address: ANCHOR },
  });

const ALL_CALLS: Readonly<Record<string, Call>> = {
  publish: PUBLISH,
  restore: RESTORE,
  discard: DISCARD,
  change: CHANGE,
  revert: REVERT,
  versions: VERSIONS,
};

function answerWith(status: number, body: unknown): void {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(body === undefined ? "" : JSON.stringify(body), { status }),
    ),
  );
}

beforeEach(() => {
  resetStaffSessionExpiryForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonValue = fc.jsonValue();
const status = fc.oneof(
  fc.constantFrom(
    200,
    201,
    204,
    301,
    400,
    401,
    403,
    404,
    405,
    409,
    413,
    415,
    429,
    500,
    502,
    503,
    504,
  ),
  fc.integer({ min: 200, max: 599 }),
);
const CONFLICT_WORDS = fc.constantFrom(
  "changed-meanwhile",
  "availability-changed-meanwhile",
  "nothing-to-publish",
  "nothing-differs",
  "candidate-refused",
  "item-in-use",
  "item-is-default",
  "item-is-fixed-default",
  "no-active-version",
  "draft-unreadable",
  "version-not-found",
  "__proto__",
  "constructor",
  "toString",
);
const wordedBody = fc.record(
  {
    status: fc.oneof(CONFLICT_WORDS, jsonValue),
    draftRevision: fc.oneof(fc.string(), jsonValue),
    items: jsonValue,
    item: jsonValue,
    refusals: jsonValue,
    issues: jsonValue,
  },
  { requiredKeys: [] },
);
const body = fc.oneof(jsonValue, wordedBody, fc.constant(undefined));

describe("an answer the client has no word for", () => {
  for (const [name, call] of Object.entries(ALL_CALLS)) {
    it(`${name}: is a failure for any status the route does not give for it, whatever the body says`, async () => {
      await fc.assert(
        fc.asyncProperty(
          status.filter((code) => ![200, 400, 401, 404, 409].includes(code)),
          body,
          async (code, sent) => {
            answerWith(code, sent);

            expect(await call()).toEqual({ kind: "failed" });
          },
        ),
        { numRuns: 60 },
      );
    });
  }

  for (const [name, call] of Object.entries(ALL_CALLS)) {
    it(`${name}: raises nothing into the screen, and names one of its own outcomes for any status and body`, async () => {
      await fc.assert(
        fc.asyncProperty(status, body, async (code, sent) => {
          answerWith(code, sent);

          const outcome = await call();

          expect(typeof outcome?.kind).toBe("string");
        }),
        { numRuns: 120 },
      );
    });
  }
});

describe("a session that has ended", () => {
  for (const [name, call] of Object.entries(ALL_CALLS)) {
    it(`${name}: is session-ended on a 401 whatever the body carries`, async () => {
      await fc.assert(
        fc.asyncProperty(body, async (sent) => {
          answerWith(401, sent);

          expect(await call()).toEqual({ kind: "session-ended" });
        }),
        { numRuns: 40 },
      );
    });
  }

  it("raises the staff frame's sheet when the state read is a 401, keeping what was typed", async () => {
    answerWith(401, { status: "unauthorised" });

    expect(await FETCHING_PUBLISH_CLIENT.readState()).toBeUndefined();

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
  });

  it("raises nothing on a state read that is not a 401", async () => {
    for (const code of [403, 409, 500, 503]) {
      answerWith(code, { status: "draft-unreadable", draftRevision: "5" });

      expect(await FETCHING_PUBLISH_CLIENT.readState()).toBeUndefined();
    }

    expect(getStaffSessionExpiry()).toBeUndefined();
  });
});

describe("a request that cannot be made or read", () => {
  for (const [name, call] of Object.entries(ALL_CALLS)) {
    it(`${name}: is a failure when the network fails, and when the answer is not JSON`, async () => {
      vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
      expect(await call()).toEqual({ kind: "failed" });

      for (const code of [200, 400, 409, 500]) {
        vi.stubGlobal("fetch", () =>
          Promise.resolve(
            new Response("<html>gateway</html>", { status: code }),
          ),
        );
        expect(await call()).toEqual(
          name === "publish" && code === 200
            ? { kind: "answer-unreadable" }
            : { kind: "failed" },
        );
      }
    });
  }

  it("reads the state as nothing when the network fails or the body is not a state", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
    expect(await FETCHING_PUBLISH_CLIENT.readState()).toBeUndefined();

    await fc.assert(
      fc.asyncProperty(jsonValue, async (sent) => {
        answerWith(200, sent);

        expect(await FETCHING_PUBLISH_CLIENT.readState()).toBeUndefined();
      }),
      { numRuns: 40 },
    );
  });
});

describe("the words a route does give", () => {
  const conflictOf = (call: Call, word: unknown, extra = {}) => {
    answerWith(409, { status: word, ...extra });
    return call();
  };

  it("publish: a moved draft, a moved availability and an emptied draft are conflicts and nothing else is", async () => {
    for (const word of [
      "changed-meanwhile",
      "availability-changed-meanwhile",
      "nothing-to-publish",
    ]) {
      expect(await conflictOf(PUBLISH, word)).toEqual({
        kind: "conflict",
      });
    }
    for (const word of [
      "nothing-differs",
      "version-not-found",
      "last-active-option",
      "item-unavailable",
      "displayed-revision-ahead",
      "item-not-in-active-book",
      "__proto__",
      "constructor",
      undefined,
      42,
    ]) {
      expect(await conflictOf(PUBLISH, word)).toEqual({
        kind: "failed",
      });
    }
  });

  it("publish: an unreadable draft is told only with the revision that gives it up, and a body without one is a failure", async () => {
    expect(
      await conflictOf(PUBLISH, "draft-unreadable", {
        draftRevision: "12",
      }),
    ).toEqual({ kind: "draft-unreadable", draftRevision: "12" });
    for (const draftRevision of [undefined, 12, null, {}, ["12"]]) {
      expect(
        await conflictOf(PUBLISH, "draft-unreadable", {
          draftRevision,
        }),
      ).toEqual({ kind: "failed" });
    }
  });

  it("publish: a body that names a block names it only with an item, and a refusal list keeps nothing nested", async () => {
    expect(await conflictOf(PUBLISH, "item-in-use", { items: [] })).toEqual({
      kind: "failed",
    });
    expect(
      await conflictOf(PUBLISH, "item-in-use", {
        items: [{ kind: "hardware" }, "x", null],
      }),
    ).toEqual({ kind: "failed" });
    expect(await conflictOf(PUBLISH, "item-is-default", { item: {} })).toEqual({
      kind: "failed",
    });
    expect(
      await conflictOf(PUBLISH, "item-is-default", {
        item: { kind: "hardware", tierId: "hardware.soft-close" },
      }),
    ).toEqual({
      kind: "blocked",
      block: {
        kind: "is-default",
        item: { kind: "hardware", tierId: "hardware.soft-close" },
      },
    });
    const refused = await conflictOf(PUBLISH, "candidate-refused", {
      refusals: [
        { source: "catalogue", code: "X", nested: { deep: 1 }, list: [1] },
        { source: "changes", index: -1, code: "NOT_A_CODE" },
        null,
        7,
        { source: "pricing" },
      ],
    });
    expect(refused).toEqual({
      kind: "candidate-refused",
      refusals: [{ source: "catalogue", code: "X" }],
    });
  });

  it("publish: a 200 that is not a published version is an answer nobody can read, whatever else it carries", async () => {
    for (const sent of [
      {},
      { versionId: "a", sequenceNumber: "2", availabilityRevision: "3" },
      { versionId: "a", sequenceNumber: 2 },
      { versionId: 1, sequenceNumber: 2, availabilityRevision: "3" },
      null,
      [],
    ]) {
      answerWith(200, sent);

      expect(await PUBLISH()).toEqual({ kind: "answer-unreadable" });
    }
  });

  it("publish: a 400 is invalid only for a text the person can correct", async () => {
    for (const code of [
      "TEXT_EMPTY",
      "TEXT_TOO_LONG",
      "TEXT_FORBIDDEN_CHARACTER",
    ]) {
      answerWith(400, {
        status: "invalid-input",
        issues: [{ field: "label", code }],
      });

      expect(await PUBLISH()).toEqual({ kind: "invalid", code });
    }
    for (const sent of [
      { issues: [{ field: "expectedDraftRevision", code: "MISSING_VALUE" }] },
      { issues: [] },
      { issues: "TEXT_EMPTY" },
      { issues: [{ code: "toString" }] },
      {},
    ]) {
      answerWith(400, sent);

      expect(await PUBLISH()).toEqual({ kind: "failed" });
    }
  });

  it("restore: a 404 is a missing version, a moved draft a conflict, and a refused book is told apart from both", async () => {
    answerWith(404, { status: "version-not-found" });
    expect(await RESTORE()).toEqual({ kind: "version-not-found" });
    expect(await conflictOf(RESTORE, "changed-meanwhile")).toEqual({
      kind: "conflict",
    });
    expect(await conflictOf(RESTORE, "nothing-differs")).toEqual({
      kind: "nothing-differs",
    });
    expect(await conflictOf(RESTORE, "candidate-refused")).toEqual({
      kind: "candidate-refused",
    });
    expect(await conflictOf(RESTORE, "nothing-to-publish")).toEqual({
      kind: "failed",
    });
    expect(
      await conflictOf(RESTORE, "draft-unreadable", {
        draftRevision: "4",
      }),
    ).toEqual({ kind: "draft-unreadable", draftRevision: "4" });
    expect(await conflictOf(RESTORE, "no-active-version")).toEqual({
      kind: "no-active-version",
    });
  });

  it("discard: only a moved draft is a conflict, and an unreadable draft is not something a discard is told", async () => {
    expect(await conflictOf(DISCARD, "changed-meanwhile")).toEqual({
      kind: "conflict",
    });
    for (const word of [
      "no-active-version",
      "candidate-refused",
      "nothing-to-publish",
    ]) {
      expect(await conflictOf(DISCARD, word)).toEqual({
        kind: "failed",
      });
    }
    answerWith(200, DRAFT_BODY);
    expect(await DISCARD()).toEqual({
      kind: "changed",
      draft: DRAFT_BODY,
    });
    answerWith(200, { draftRevision: 8, changes: [] });
    expect(await DISCARD()).toEqual({ kind: "failed" });
  });

  it("a draft write: an unreadable draft and a missing version are told, a moved draft is a conflict, a 404 is a failure", async () => {
    for (const call of [CHANGE, REVERT]) {
      expect(
        await conflictOf(call, "draft-unreadable", { draftRevision: "6" }),
      ).toEqual({ kind: "draft-unreadable", draftRevision: "6" });
      expect(await conflictOf(call, "no-active-version")).toEqual({
        kind: "no-active-version",
      });
      expect(await conflictOf(call, "changed-meanwhile")).toEqual({
        kind: "conflict",
      });
      expect(await conflictOf(call, "draft-unreadable")).toEqual({
        kind: "failed",
      });
      answerWith(404, { status: "version-not-found" });
      expect(await call()).toEqual({ kind: "failed" });
    }
  });

  it("the history: a page is listed only when every member of it is read, and one bad entry fails the page", async () => {
    const entry = {
      versionId: "a",
      sequenceNumber: 2,
      label: "Autumn",
      state: "archived",
      publishedAt: "2026-01-01T00:00:00.000Z",
      changeCount: 3,
    };
    const page = { total: 1, page: 1, pageSize: 20, versions: [entry] };
    answerWith(200, page);
    expect(await VERSIONS()).toEqual({ kind: "listed", list: page });
    for (const bad of [
      { ...entry, state: "pending" },
      { ...entry, changeCount: "3" },
      { ...entry, publishedAt: 3 },
      null,
    ]) {
      answerWith(200, { ...page, versions: [entry, bad] });

      expect(await VERSIONS()).toEqual({ kind: "failed" });
    }
  });
});
