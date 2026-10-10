import {
  KITCHEN_L_DESIGN,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { SubmissionRecording } from "@lemnaria/persistence";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";
import {
  CONTACT_NEW_BY_ADDRESS_POLICY,
  CONTACT_NEW_PER_BLOCK_HOUR_FIGURE,
  CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";

import {
  aHarness,
  bodyOf,
  callbackBodyOf,
  EMAIL_MARKER,
  NAME_MARKER,
  PLACEHOLDER_REFERENCE,
  REQUEST_ID,
  VISITOR_HASH,
  wireOf,
} from "./submit-contact-harness";

afterEach(() => {
  vi.restoreAllMocks();
});

async function jsonOf(answer: Response): Promise<Record<string, unknown>> {
  return (await answer.json()) as Record<string, unknown>;
}

describe("a new request, stored and passed on", () => {
  it("stores a callback and answers a reference and a status, sending one notice, in order", async () => {
    const harness = aHarness();

    const answer = await harness.submit(callbackBodyOf());

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({
      status: "sent",
      reference: harness.store.heldSubmissions()[0]?.reference,
    });
    expect(harness.sender.sent).toHaveLength(1);
    expect(harness.calls).toEqual([
      "judge:every",
      "lookUp",
      "judge:new",
      "record",
      "send",
      "mark",
    ]);
  });

  it("stores a design's request with its snapshot, the design read once", async () => {
    const harness = aHarness();

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(harness.calls).toEqual([
      "judge:every",
      "lookUp",
      "load",
      "judge:new",
      "record",
      "send",
      "mark",
    ]);
    expect(harness.calls.filter((call) => call === "load")).toHaveLength(1);
    expect(
      harness.store.heldSubmissions()[0]?.submission.snapshot,
    ).toBeDefined();
  });

  it("hands the sender the stored reference and never the placeholder", async () => {
    const harness = aHarness();

    await harness.submit(bodyOf());

    const reference = harness.store.heldSubmissions()[0]?.reference ?? "";
    const [message] = harness.sender.sent;
    expect(message?.subject).toContain(reference);
    expect(message?.text).toContain(reference);
    expect(JSON.stringify(harness.sender.sent)).not.toContain(
      PLACEHOLDER_REFERENCE,
    );
  });

  it("writes the notice in its own language whatever the request's, keyed by the request's id", async () => {
    const harness = aHarness();

    await harness.submit(bodyOf({ locale: "ru" }));

    expect(harness.sender.sent[0]?.key).toBe(`lead-notification/${REQUEST_ID}`);
    expect(harness.sender.sent[0]?.text).toContain("ru");
    expect(harness.sender.sent[0]?.subject).not.toMatch(/[Ѐ-ӿ]/);
  });

  it("marks the request notified after an accepted send, so a second call sends nothing", async () => {
    const harness = aHarness();
    const first = await harness.submit(bodyOf());
    const second = await harness.submit(bodyOf());

    expect(await jsonOf(second)).toEqual(await jsonOf(first));
    expect(harness.sender.sent).toHaveLength(1);
    expect(harness.store.heldSubmissions()).toHaveLength(1);
  });
});

describe("nothing is counted, looked up, stored or sent before its check", () => {
  it("parses nothing and asks no other judgement when every request's judgement refuses", async () => {
    const harness = aHarness();
    harness.recorded.mockResolvedValue([1_000_000]);
    const parse = vi.spyOn(JSON, "parse");

    const answer = await harness.submit("not json at all {");

    expect(answer.status).toBe(429);
    expect(parse).not.toHaveBeenCalled();
    expect(harness.calls).toEqual(["judge:every"]);
  });

  it.each([
    ["a body that does not parse", "{ not json"],
    ["a body that is not an object", "[1, 2]"],
    ["a request the schema refuses", JSON.stringify({ contact: {} })],
  ])(
    "answers %s with the one 400 after every request's bucket alone",
    async (_label, text) => {
      const harness = aHarness();

      const answer = await harness.submit(text);

      expect(answer.status).toBe(400);
      expect((await jsonOf(answer)).code).toBe("CONTACT_INVALID");
      expect(harness.calls).toEqual(["judge:every"]);
      expect(harness.recorded).toHaveBeenCalledTimes(1);
    },
  );

  it("lists each issue's field and code and holds no submitted value", async () => {
    const harness = aHarness();

    const answer = await harness.submit(
      bodyOf({ contact: { name: "", phone: "SECRET-VALUE-MARKER" } }),
    );

    const text = JSON.stringify(await jsonOf(answer));
    expect(text).toContain("contact.phone");
    expect(text).not.toContain("MARKER");
  });

  it("answers a filled honeypot and a form sent too fast alike, and stores nothing", async () => {
    const harness = aHarness();

    const filled = await harness.submit(bodyOf({ honeypot: "http://spam" }));
    const fast = await harness.submit(bodyOf({ elapsedMs: 1999 }));

    expect(filled.status).toBe(400);
    expect(await wireOf(fast)).toBe(await wireOf(filled));
    expect((await jsonOf(fast)).code).toBe("CONTACT_REJECTED");
    expect(harness.calls).toEqual(["judge:every", "judge:every"]);
    expect(harness.store.heldSubmissions()).toHaveLength(0);
  });

  it("takes a form that was open for the least time, and not one a millisecond short", async () => {
    const harness = aHarness();

    expect((await harness.submit(bodyOf({ elapsedMs: 2000 }))).status).toBe(
      200,
    );
    expect(
      (
        await harness.submit(
          bodyOf({ elapsedMs: 1999, clientRequestId: "req_0123456789abcdee" }),
        )
      ).status,
    ).toBe(400);
  });

  it("answers unavailable and looks nothing up when no sender is usable", async () => {
    const harness = aHarness({
      createSender: () => ({ kind: "unavailable", variables: [] }),
    });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(503);
    expect(harness.calls).toEqual(["judge:every"]);
    expect(harness.store.heldSubmissions()).toHaveLength(0);
  });

  it("makes the sender once, before the lookup, and uses that one, so no factory runs after the record", async () => {
    const calls: string[] = [];
    const sender = createFakeMailSender();
    const harness = aHarness({
      createSender: () => {
        calls.push("createSender");
        return { kind: "sender", sender };
      },
    });
    const { calls: portCalls } = harness;

    await harness.submit(bodyOf());

    expect(calls).toEqual(["createSender"]);
    expect(portCalls.indexOf("lookUp")).toBeGreaterThanOrEqual(0);
    expect(sender.sent).toHaveLength(1);
  });

  it("answers unavailable and looks nothing up when the digest has no secret", async () => {
    const harness = aHarness({
      digester: { status: "unavailable", variable: "DIGEST_SECRET" },
    });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(503);
    expect(harness.calls).toEqual(["judge:every"]);
  });
});

describe("the four refusals of the owned load are one answer, and none counts a new request's bucket", () => {
  const REFUSED = [
    [
      "a design the cookie does not own",
      { kind: "refused", reason: "unavailable" },
    ],
    ["a stored row the load refuses", { kind: "refused", reason: "invalid" }],
  ] as const;

  it.each(REFUSED)(
    "answers %s with CONTACT_DESIGN_NOT_CURRENT",
    async (_label, load) => {
      const harness = aHarness({ loadOwned: () => Promise.resolve(load) });

      const answer = await harness.submit(bodyOf());

      expect(answer.status).toBe(409);
      expect((await jsonOf(answer)).code).toBe("CONTACT_DESIGN_NOT_CURRENT");
      expect(harness.calls).toEqual(["judge:every", "lookUp"]);
      expect(harness.recorded).toHaveBeenCalledTimes(1);
    },
  );

  it("is equal in body and headers for a stale revision, an unknown design and a missing cookie", async () => {
    const stale = aHarness({
      loadOwned: () =>
        Promise.resolve({
          kind: "found",
          design: NARROWED_ROOM_OVERFLOWING_DESIGN,
          revision: "9",
        }),
    });
    const unknown = aHarness({
      loadOwned: () =>
        Promise.resolve({ kind: "refused", reason: "unavailable" }),
    });
    const answers = [
      await stale.submit(bodyOf()),
      await unknown.submit(bodyOf()),
      await aHarness({
        loadOwned: () =>
          Promise.resolve({ kind: "refused", reason: "invalid" }),
      }).submit(bodyOf()),
    ];

    const wires = await Promise.all(answers.map((answer) => wireOf(answer)));
    expect(new Set(wires).size).toBe(1);
  });

  it("compares the revision as text: another revision is not this one, however it reads as a number", async () => {
    const harness = aHarness({
      loadOwned: () =>
        Promise.resolve({
          kind: "found",
          design: KITCHEN_L_DESIGN,
          revision: "01",
        }),
    });

    const answer = await harness.submit(bodyOf());

    expect((await jsonOf(answer)).code).toBe("CONTACT_DESIGN_NOT_CURRENT");
  });

  it("answers a kitchen past its wall with its bodies' ids and stores nothing", async () => {
    const harness = aHarness({
      loadOwned: () =>
        Promise.resolve({
          kind: "found",
          design: NARROWED_ROOM_OVERFLOWING_DESIGN,
          revision: "1",
        }),
    });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(422);
    const body = await jsonOf(answer);
    expect(body.code).toBe("CONTACT_DESIGN_DOES_NOT_FIT");
    expect((body.placementIds as string[]).length).toBeGreaterThan(0);
    expect(harness.store.heldSubmissions()).toHaveLength(0);
    expect(harness.recorded).toHaveBeenCalledTimes(1);
  });
});

describe("a request whose notice cannot be made stores nothing", () => {
  it("answers unavailable, counts no bucket of a new request and stores no row", async () => {
    const harness = aHarness({
      noticeContent: { leadNotice: null } as never,
    });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(503);
    expect(harness.store.heldSubmissions()).toHaveLength(0);
    expect(harness.calls).not.toContain("judge:new");
    expect(harness.calls).not.toContain("record");
    expect(harness.sender.sent).toHaveLength(0);
  });
});

describe("a new request's buckets, each asked only when the one before allowed, and the subjects handed", () => {
  it("counts the four for a request with a browser and an address, and the two of the network without", async () => {
    const harness = aHarness();
    const withBoth = bodyOf({
      contact: {
        name: NAME_MARKER,
        phone: "069 000 111",
        locality: "",
        channel: "email",
        email: EMAIL_MARKER,
        consent: true,
        consentTextVersion: "placeholder",
      },
    });

    await harness.submit(withBoth, VISITOR_HASH);
    const afterTheFirst = harness.recorded.mock.calls.length;
    await harness.submit(bodyOf({ clientRequestId: "req_aaaaaaaaaaaaaaaa" }));

    expect(afterTheFirst - 1).toBe(4);
    expect(harness.recorded.mock.calls.length - afterTheFirst - 1).toBe(2);
  });

  it("counts the address in its counted form: the same address in another case is the same bucket", async () => {
    const harness = aHarness();
    const email = (address: string, id: string) =>
      bodyOf({
        clientRequestId: id,
        contact: {
          name: NAME_MARKER,
          phone: "069 000 111",
          locality: "",
          channel: "email",
          email: address,
          consent: true,
          consentTextVersion: "placeholder",
        },
      });

    await harness.submit(email("ana@example.invalid", "req_aaaaaaaaaaaaaaaa"));
    await harness.submit(email("ANA@Example.INVALID", "req_bbbbbbbbbbbbbbbb"));

    const addressKeys = harness.recorded.mock.calls
      .map(([buckets]) => buckets[0]?.key)
      .filter((_key, index) => index % 4 === 3);
    expect(addressKeys).toHaveLength(2);
    expect(addressKeys[0]).toBe(addressKeys[1]);
  });

  it("stores nothing for a request a bucket refuses, after the network's allowed", async () => {
    const harness = aHarness();
    for (
      let request = 0;
      request < CONTACT_NEW_PER_BLOCK_HOUR_FIGURE;
      request += 1
    ) {
      await harness.submit(
        callbackBodyOf({
          clientRequestId: `req_00000000000000${String(request).padStart(2, "0")}`,
        }),
      );
    }

    const refused = await harness.submit(
      callbackBodyOf({ clientRequestId: "req_ffffffffffffffff" }),
    );

    expect(refused.status).toBe(429);
    expect(harness.store.heldSubmissions()).toHaveLength(
      CONTACT_NEW_PER_BLOCK_HOUR_FIGURE,
    );
  });

  it("is the address's policy that is named when the address's bucket refuses", () => {
    expect(CONTACT_NEW_BY_ADDRESS_POLICY.figure).toBe(3);
  });
});

describe("a stored request: its tries, never a new request's buckets", () => {
  async function storedButNotNotified() {
    const harness = aHarness({ outcomes: [{ ok: false, kind: "busy" }] });
    const first = await harness.submit(bodyOf());
    return { harness, first };
  }

  it("answers a call whose notice the mail did not accept as a retry may follow, with no reference", async () => {
    const { first } = await storedButNotNotified();

    expect(first.status).toBe(502);
    const body = await jsonOf(first);
    expect(body.code).toBe("CONTACT_NOTICE_NOT_SENT_RETRY");
    expect(JSON.stringify(body)).not.toContain("LM-");
  });

  it("counts the tries' bucket and none of a new request's, and sends the same notice bytes", async () => {
    const { harness } = await storedButNotNotified();
    const countedBefore = harness.recorded.mock.calls.length;
    harness.calls.length = 0;

    const retried = await harness.submit(bodyOf());

    expect(retried.status).toBe(200);
    expect(harness.recorded.mock.calls.length - countedBefore).toBe(2);
    expect(harness.calls).toEqual([
      "judge:every",
      "lookUp",
      "judge:tries",
      "load",
      "send",
      "mark",
    ]);
    expect(harness.calls).not.toContain("judge:new");
    expect(harness.calls).not.toContain("record");
    expect(harness.sender.sent).toHaveLength(2);
    expect(harness.sender.sent[1]).toEqual(harness.sender.sent[0]);
  });

  it("answers a stored and notified request with its reference and sends nothing", async () => {
    const harness = aHarness();
    await harness.submit(bodyOf());
    harness.calls.length = 0;

    const again = await harness.submit(bodyOf());

    expect(again.status).toBe(200);
    expect(harness.calls).toEqual(["judge:every", "lookUp", "judge:tries"]);
  });

  it("answers an id stored with another payload as the one conflict, after the tries' bucket", async () => {
    const harness = aHarness();
    await harness.submit(bodyOf());
    harness.calls.length = 0;

    const conflict = await harness.submit(
      bodyOf({
        contact: {
          name: "Other Name",
          phone: "069 000 111",
          locality: "",
          channel: "phone",
          consent: true,
          consentTextVersion: "placeholder",
        },
      }),
    );

    expect(conflict.status).toBe(409);
    expect(await jsonOf(conflict)).toEqual({
      error: "This request was already sent with other contents.",
      code: "CONTACT_REQUEST_CONFLICT",
    });
    expect(harness.calls).toEqual(["judge:every", "lookUp", "judge:tries"]);
  });

  it("refuses the tries past the figure, as the one limit, and never counts them against new requests", async () => {
    const harness = aHarness();
    await harness.submit(bodyOf());
    let last = await harness.submit(bodyOf());
    for (
      let attempt = 0;
      attempt <= CONTACT_TRIES_PER_REQUEST_HOUR_FIGURE;
      attempt += 1
    ) {
      last = await harness.submit(bodyOf());
    }

    expect(last.status).toBe(429);
    expect((await jsonOf(last)).code).toBe("CONTACT_LIMIT_REACHED");
  });

  it("is a conflict, not a retry, once the book's version has changed between the two attempts", async () => {
    const harness = aHarness({ outcomes: [{ ok: false, kind: "busy" }] });
    await harness.submit(bodyOf());
    const nextBook: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      version: "another-version",
    };
    const afterTheChange = aHarness({
      book: nextBook,
      store: () => harness.store,
    });

    const retried = await afterTheChange.submit(bodyOf());

    expect(retried.status).toBe(409);
    expect((await jsonOf(retried)).code).toBe("CONTACT_REQUEST_CONFLICT");
    expect(afterTheChange.sender.sent).toHaveLength(0);
  });
});

describe("whether to send is decided on notified, never on new", () => {
  function recordingAs(
    recording: Partial<Extract<SubmissionRecording, { kind: "stored" }>>,
  ) {
    return aHarness({
      store: (inner) => ({
        lookUp: (request) => inner.lookUp(request),
        record: async (submission) => {
          const real = await inner.record(submission);
          if (real.kind !== "stored") return real;
          return { ...real, ...recording };
        },
        markNotified: (id) => inner.markNotified(id),
      }),
    });
  }

  it("sends for a request that is stored, not new and not notified: a twin landed first and has not sent", async () => {
    const harness = recordingAs({ isNew: false, isNotified: false });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(harness.sender.sent).toHaveLength(1);
  });

  it("sends nothing for a request that is new and already notified", async () => {
    const harness = recordingAs({ isNew: true, isNotified: true });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(harness.sender.sent).toHaveLength(0);
  });

  it("answers a conflict the record itself finds as the one conflict code", async () => {
    const harness = aHarness({
      store: (inner) => ({
        lookUp: (request) => inner.lookUp(request),
        record: () => Promise.resolve({ kind: "conflict" }),
        markNotified: (id) => inner.markNotified(id),
      }),
    });

    const answer = await harness.submit(bodyOf());

    expect((await jsonOf(answer)).code).toBe("CONTACT_REQUEST_CONFLICT");
    expect(harness.sender.sent).toHaveLength(0);
  });
});
