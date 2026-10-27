import { describe, expect, it } from "vitest";

import { aHarness, bodyOf } from "./submit-contact-harness";

// Adversarial QA for M10 wave R1, ruling R1-Q2 (2026-10-27) on criterion R-a: a publish between two sends does not make a
// fresh send fail. A fresh request is priced at the current book and stores that version; only a retry of the same request
// id across a change of book is `CONTACT_REQUEST_CONFLICT` (ADR 0157 decision 2). No "seen version" travels on the wire.

const FIRST_VERSION_ID = "version-id-1";
const NEXT_VERSION_ID = "version-id-2";
const FRESH_REQUEST_ID = "req_fedcba9876543210";

async function codeOf(answer: Response): Promise<unknown> {
  return ((await answer.json()) as { code?: unknown }).code;
}

describe("a publish between two sends", () => {
  it("is priced at the current book, stored and notified, for a request that is new", async () => {
    const afterThePublish = aHarness({ bookVersionId: NEXT_VERSION_ID });

    const answer = await afterThePublish.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(afterThePublish.store.heldSubmissions()).toHaveLength(1);
    expect(afterThePublish.sender.sent).toHaveLength(1);
  });

  it("is a conflict for a retry of the same request id, which sends nothing", async () => {
    const before = aHarness({
      outcomes: [{ ok: false, kind: "busy" }],
      bookVersionId: FIRST_VERSION_ID,
    });
    await before.submit(bodyOf());
    const after = aHarness({
      bookVersionId: NEXT_VERSION_ID,
      store: () => before.store,
    });

    const retried = await after.submit(bodyOf());

    expect(retried.status).toBe(409);
    expect(await codeOf(retried)).toBe("CONTACT_REQUEST_CONFLICT");
    expect(after.sender.sent).toHaveLength(0);
  });

  it("is sent as a new request when the customer sends again under a new id, the first staying un-notified", async () => {
    const before = aHarness({
      outcomes: [{ ok: false, kind: "busy" }],
      bookVersionId: FIRST_VERSION_ID,
    });
    await before.submit(bodyOf());
    const after = aHarness({
      bookVersionId: NEXT_VERSION_ID,
      store: () => before.store,
    });

    const sentAgain = await after.submit(
      bodyOf({ clientRequestId: FRESH_REQUEST_ID }),
    );

    expect(sentAgain.status).toBe(200);
    expect(after.sender.sent).toHaveLength(1);
    expect(before.store.heldSubmissions()).toHaveLength(2);
  });
});
