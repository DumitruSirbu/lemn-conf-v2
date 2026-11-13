import type {
  DigestEligibleKitchen,
  KitchenChangeStore,
} from "@lemnaria/persistence";
import { beforeEach, describe, expect, it } from "vitest";

import {
  HTML_MAX_LENGTH,
  MAIL_ACCEPTED,
  MAIL_FAILURE_KINDS,
  isSendableMailMessage,
  type MailMessage,
  type MailOutcome,
  type MailSender,
} from "@/lib/server/mail/mail-sender";
import { staffChangeDigestCopy } from "@/lib/server/mail/staff-change-digest";
import type { PublicOrigin } from "@/lib/server/public-origin";
import {
  DIGEST_FAILURE_CODES,
  runStaffChangeDigest,
  type StaffChangeDigestOutcome,
  type StaffChangeDigestPorts,
} from "@/lib/server/staff/run-staff-change-digest";

import {
  DRIVER_FAILURE_MARKER,
  freshAccountWorld,
} from "../../../support/account-world";
import {
  currentSeenWorld,
  freshSeenWorld,
  plantSeenKitchen,
} from "../../../support/staff-seen-world";

// M10 K4, adversarial: the run's order of effects, its day key at the Europe/Chisinau boundaries, what a failed step
// loses, and what a poisoned row does to the day (ADR 0178 A-13 F6; plan K4-a, K4-b, K4-d).

const ORIGIN = "https://lemnaria.example" as PublicOrigin;
const FIRST_RUN = new Date("2026-10-20T05:00:00.000Z");
const NEXT_DAY_RUN = new Date("2026-10-21T05:00:00.000Z");

/** Records the very object it was handed, so a member the fake sender's copy would drop is still seen. */
interface RawSender extends MailSender {
  readonly sent: MailMessage[];
}

let events: string[];
let sender: RawSender;
let senderOutcome: () => Promise<MailOutcome>;
let runAt: Date;

beforeEach(() => {
  freshAccountWorld();
  freshSeenWorld();
  events = [];
  senderOutcome = () => Promise.resolve(MAIL_ACCEPTED);
  sender = {
    sent: [],
    send(message) {
      events.push("send");
      sender.sent.push(message);
      return senderOutcome();
    },
  };
  runAt = FIRST_RUN;
});

function tracedStore(
  inner: Partial<KitchenChangeStore> = {},
): KitchenChangeStore {
  const port = currentSeenWorld().port;
  return {
    ...port,
    claimDigestDay: (dayKey) => {
      events.push("claim");
      return (inner.claimDigestDay ?? port.claimDigestDay)(dayKey);
    },
    listDigestEligible: (now) => {
      events.push("list");
      return (inner.listDigestEligible ?? port.listDigestEligible)(now);
    },
    recordDigested: (roundId, entries) => {
      events.push("record");
      return (inner.recordDigested ?? port.recordDigested)(roundId, entries);
    },
  };
}

function portsOver(
  store: KitchenChangeStore,
  overrides: Partial<StaffChangeDigestPorts> = {},
): StaffChangeDigestPorts {
  return {
    openStore: () => store,
    now: () => runAt,
    createSender: () => ({ kind: "sender", sender }),
    readPublicOrigin: () => ({ status: "configured", origin: ORIGIN }),
    copy: staffChangeDigestCopy,
    ...overrides,
  };
}

function run(
  inner: Partial<KitchenChangeStore> = {},
  overrides: Partial<StaffChangeDigestPorts> = {},
): Promise<StaffChangeDigestOutcome> {
  return runStaffChangeDigest(portsOver(tracedStore(inner), overrides));
}

/** The message the sender was last handed; a sender that is asked before any send is a defect of the test. */
function lastSent(): MailMessage {
  const last = sender.sent.at(-1);
  if (last === undefined) throw new Error("nothing was handed to the sender");
  return last;
}

function plantChanged(fields: Parameters<typeof plantSeenKitchen>[0] = {}) {
  return plantSeenKitchen({
    revision: "6",
    customerName: "Ana Popescu",
    ...fields,
  });
}

function heldDayKeys(): string[] {
  return currentSeenWorld()
    .store.heldRounds()
    .map((round) => round.dayKey);
}

function listedOnce(
  rows: (now: Date) => Promise<readonly DigestEligibleKitchen[]>,
): Partial<KitchenChangeStore> {
  return { listDigestEligible: rows };
}

describe("the order of the run's effects", () => {
  it("claims the day, lists, sends and only then records, once each", async () => {
    plantChanged();

    await run();

    expect(events).toEqual(["claim", "list", "send", "record"]);
  });

  it("claims and lists on an empty day, and neither sends nor records", async () => {
    const outcome = await run();

    expect(outcome).toEqual({ status: "nothing-to-send" });
    expect(events).toEqual(["claim", "list"]);
  });

  it("does not list, send or record for a day that is already claimed", async () => {
    plantChanged();
    await run();
    events.length = 0;

    const outcome = await run();

    expect(outcome).toEqual({ status: "already-claimed" });
    expect(events).toEqual(["claim"]);
  });

  it("does not open the store, claim or send when the mail is not configured", async () => {
    plantChanged();
    let isStoreOpened = false;

    const outcome = await runStaffChangeDigest(
      portsOver(tracedStore(), {
        createSender: () => ({ kind: "unavailable", variables: [] }),
        openStore: () => {
          isStoreOpened = true;
          return tracedStore();
        },
      }),
    );

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_MAIL_UNAVAILABLE",
    });
    expect(isStoreOpened).toBe(false);
    expect(events).toEqual([]);
  });

  it("writes no audit row and touches no seen mark", async () => {
    plantChanged();
    const world = currentSeenWorld();

    await run();

    expect(world.calls).toEqual([]);
  });
});

describe("the day key at the Europe/Chisinau boundaries", () => {
  it.each([
    [
      "summer: the last millisecond before local midnight",
      "2026-07-14T20:59:59.999Z",
      "2026-07-14",
    ],
    ["summer: local midnight", "2026-07-14T21:00:00.000Z", "2026-07-15"],
    [
      "winter: the last millisecond before local midnight",
      "2026-12-14T21:59:59.999Z",
      "2026-12-14",
    ],
    ["winter: local midnight", "2026-12-14T22:00:00.000Z", "2026-12-15"],
    [
      "spring forward: the day before the 23-hour day ends",
      "2026-03-28T21:59:59.999Z",
      "2026-03-28",
    ],
    [
      "spring forward: the 23-hour day begins",
      "2026-03-28T22:00:00.000Z",
      "2026-03-29",
    ],
    [
      "spring forward: the 23-hour day ends",
      "2026-03-29T20:59:59.999Z",
      "2026-03-29",
    ],
    [
      "spring forward: the day after begins",
      "2026-03-29T21:00:00.000Z",
      "2026-03-30",
    ],
    [
      "fall back: the 25-hour day begins (still summer time)",
      "2026-10-24T21:00:00.000Z",
      "2026-10-25",
    ],
    [
      "fall back: the day before ends",
      "2026-10-24T20:59:59.999Z",
      "2026-10-24",
    ],
    [
      "fall back: the 25-hour day ends (winter time)",
      "2026-10-25T21:59:59.999Z",
      "2026-10-25",
    ],
    [
      "fall back: the day after begins",
      "2026-10-25T22:00:00.000Z",
      "2026-10-26",
    ],
    [
      "new year in Chisinau, still the old year in UTC",
      "2026-12-31T22:00:00.000Z",
      "2027-01-01",
    ],
  ])("claims %s under the key %s", async (_name, instant, expectedKey) => {
    runAt = new Date(instant);
    const dayBefore = new Date(runAt.getTime() - 24 * 60 * 60 * 1000);
    plantChanged({ sentAt: dayBefore, updatedAt: dayBefore });

    await run();

    expect(heldDayKeys()).toEqual([expectedKey]);
    expect(sender.sent.map((message) => message.key)).toEqual([
      `staff-change-digest/${expectedKey}`,
    ]);
  });

  it("is already claimed for a second run in the same Chisinau day whichever UTC date it falls on", async () => {
    plantChanged();
    runAt = new Date("2026-10-24T21:30:00.000Z");
    const afterMidnight = await run();
    runAt = new Date("2026-10-25T05:00:00.000Z");
    const cronInstant = await run();
    runAt = new Date("2026-10-25T21:30:00.000Z");
    const lateEvening = await run();
    runAt = new Date("2026-10-25T22:00:00.000Z");
    const nextDay = await run();

    expect(afterMidnight).toEqual({ status: "sent", kitchenCount: 1 });
    expect(cronInstant).toEqual({ status: "already-claimed" });
    expect(lateEvening).toEqual({ status: "already-claimed" });
    expect(nextDay).toEqual({ status: "nothing-to-send" });
    expect(heldDayKeys()).toEqual(["2026-10-25", "2026-10-26"]);
    expect(sender.sent).toHaveLength(1);
  });

  it("names the day of the 05:00 UTC cron after its own date on every day of 2026 and 2027, DST changes included", async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const start = Date.parse("2026-01-01T05:00:00.000Z");
    const days = 730;

    for (let offset = 0; offset < days; offset += 1) {
      runAt = new Date(start + offset * dayMs);
      await run();
    }

    const expectedKeys = Array.from({ length: days }, (_unused, offset) =>
      new Date(start + offset * dayMs).toISOString().slice(0, 10),
    );
    expect(heldDayKeys()).toEqual(expectedKeys);
  });

  it("claims an empty day all the same, so a kitchen changed later that day waits for the next", async () => {
    const empty = await run();
    plantChanged();
    const sameDay = await run();
    runAt = NEXT_DAY_RUN;
    const nextDay = await run();

    expect(empty).toEqual({ status: "nothing-to-send" });
    expect(sameDay).toEqual({ status: "already-claimed" });
    expect(nextDay).toEqual({ status: "sent", kitchenCount: 1 });
  });

  it("reads the instant once, so a clock that moves across midnight mid-run cannot split one run over two days", async () => {
    plantChanged();
    const instants = [
      new Date("2026-07-14T20:59:59.999Z"),
      new Date("2026-07-14T21:00:00.001Z"),
    ];
    let reads = 0;

    await run(
      {},
      {
        now: () => {
          const instant = instants[Math.min(reads, instants.length - 1)];
          reads += 1;
          if (instant === undefined) throw new Error("no instant");
          return instant;
        },
      },
    );

    expect(reads).toBe(1);
    expect(sender.sent.map((message) => message.key)).toEqual([
      "staff-change-digest/2026-07-14",
    ]);
  });
});

describe("a send that does not happen", () => {
  it.each(MAIL_FAILURE_KINDS)(
    "loses the day on a %s refusal, records nothing, tries once, and lists the same kitchen next day",
    async (kind) => {
      senderOutcome = () => Promise.resolve({ ok: false, kind });
      const kitchen = plantChanged();

      const lostDay = await run();
      senderOutcome = () => Promise.resolve(MAIL_ACCEPTED);
      runAt = NEXT_DAY_RUN;
      const nextDay = await run();

      expect(lostDay).toEqual({
        status: "failed",
        errorCode: "DIGEST_SEND_FAILED",
        mailFailure: kind,
      });
      expect(events.slice(0, 3)).toEqual(["claim", "list", "send"]);
      expect(nextDay).toEqual({ status: "sent", kitchenCount: 1 });
      expect(currentSeenWorld().store.heldDigestEntries()).toEqual([
        { designId: kitchen.designId, revision: "6" },
      ]);
      expect(heldDayKeys()).toEqual(["2026-10-20", "2026-10-21"]);
    },
  );

  it("records nothing and answers a code without a mail failure when the sender itself rejects", async () => {
    plantChanged();
    senderOutcome = () => Promise.reject(new Error(DRIVER_FAILURE_MARKER));

    const outcome = await run();

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_SEND_FAILED",
    });
    expect(JSON.stringify(outcome)).not.toContain(DRIVER_FAILURE_MARKER);
    expect(events).not.toContain("record");
    expect(currentSeenWorld().store.heldDigestEntries()).toEqual([]);
  });

  it("records nothing when the sender throws synchronously", async () => {
    plantChanged();
    const throwing: MailSender = {
      send: () => {
        throw new Error(DRIVER_FAILURE_MARKER);
      },
    };

    const outcome = await run(
      {},
      {
        createSender: () => ({ kind: "sender", sender: throwing }),
      },
    );

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_SEND_FAILED",
    });
    expect(currentSeenWorld().store.heldDigestEntries()).toEqual([]);
  });

  it("never sends the same day twice, even after every kind of failure", async () => {
    plantChanged();
    senderOutcome = () => Promise.resolve({ ok: false, kind: "busy" });

    const failed = await run();
    senderOutcome = () => Promise.resolve(MAIL_ACCEPTED);
    const retried = await run();

    expect(failed.status).toBe("failed");
    expect(retried).toEqual({ status: "already-claimed" });
    expect(sender.sent).toHaveLength(1);
  });
});

describe("a step that throws", () => {
  const rejecting = () => Promise.reject(new Error(DRIVER_FAILURE_MARKER));

  it("answers DIGEST_STORE_UNAVAILABLE when the store cannot be made, before any other effect", async () => {
    plantChanged();

    const outcome = await runStaffChangeDigest(
      portsOver(tracedStore(), {
        openStore: () => {
          throw new Error(DRIVER_FAILURE_MARKER);
        },
      }),
    );

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_STORE_UNAVAILABLE",
    });
    expect(events).toEqual([]);
  });

  it("answers DIGEST_LIST_FAILED, sends nothing, and the claimed day stands", async () => {
    plantChanged();

    const outcome = await run({ listDigestEligible: rejecting });
    const rerun = await run();

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_LIST_FAILED",
    });
    expect(rerun).toEqual({ status: "already-claimed" });
    expect(sender.sent).toHaveLength(0);
  });

  it("answers DIGEST_CLAIM_FAILED without listing or sending", async () => {
    plantChanged();

    const outcome = await run({ claimDigestDay: rejecting });

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_CLAIM_FAILED",
    });
    expect(events).toEqual(["claim"]);
  });

  it("answers DIGEST_RECORD_FAILED after the mail went, with the day still claimed", async () => {
    plantChanged();

    const outcome = await run({ recordDigested: rejecting });

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_RECORD_FAILED",
    });
    expect(sender.sent).toHaveLength(1);
    expect(heldDayKeys()).toEqual(["2026-10-20"]);
  });

  it("answers DIGEST_COMPOSE_FAILED, not a throw, when the copy cannot be resolved", async () => {
    plantChanged();

    const outcome = await run(
      {},
      {
        copy: () => {
          throw new Error(DRIVER_FAILURE_MARKER);
        },
      },
    );

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_COMPOSE_FAILED",
    });
    expect(sender.sent).toHaveLength(0);
  });

  it("answers only a code of the stable list, whatever the cause", async () => {
    plantChanged();
    const causes: unknown[] = [
      new Error(DRIVER_FAILURE_MARKER),
      DRIVER_FAILURE_MARKER,
      { message: DRIVER_FAILURE_MARKER },
      undefined,
      null,
    ];

    for (const cause of causes) {
      freshSeenWorld();
      plantChanged();
      runAt = new Date(runAt.getTime() + 24 * 60 * 60 * 1000);
      const outcome = await run({
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a cause that is no Error is the case
        claimDigestDay: () => Promise.reject(cause),
      });

      expect(outcome.status).toBe("failed");
      if (outcome.status === "failed") {
        expect(DIGEST_FAILURE_CODES).toContain(outcome.errorCode);
      }
      expect(JSON.stringify(outcome)).not.toContain(DRIVER_FAILURE_MARKER);
    }
  });

  // Plan K4-b and the run's own comment promise a failure with a code and never an unhandled throw. The sender's
  // factory and the origin reader are called outside `attempt`, so a throw in either rejects the run (the route would
  // then answer an uncoded 500 and the platform would log the exception).
  it("answers a code, not a rejection, when the sender's factory throws", async () => {
    plantChanged();

    const outcome = await run(
      {},
      {
        createSender: () => {
          throw new Error(DRIVER_FAILURE_MARKER);
        },
      },
    ).catch((cause: unknown) => cause);

    expect(outcome).toMatchObject({ status: "failed" });
  });

  it("answers a code, not a rejection, when the origin reader throws", async () => {
    plantChanged();

    const outcome = await run(
      {},
      {
        readPublicOrigin: () => {
          throw new Error(DRIVER_FAILURE_MARKER);
        },
      },
    ).catch((cause: unknown) => cause);

    expect(outcome).toMatchObject({ status: "failed" });
  });
});

describe("what the digest lists", () => {
  it("lists one design once, whatever its position, when the store repeats it under one revision", async () => {
    const first = plantChanged();
    plantChanged({ revision: "9" });
    const store = currentSeenWorld().port;

    const outcome = await run(
      listedOnce(async (now) => {
        const rows = await store.listDigestEligible(now);
        return [...rows, ...rows, ...[...rows].reverse()];
      }),
    );

    expect(outcome).toEqual({ status: "sent", kitchenCount: 2 });
    const text = sender.sent[0]?.text ?? "";
    expect(text.split(first.designId)).toHaveLength(2);
    expect(currentSeenWorld().store.heldDigestEntries()).toHaveLength(2);
  });

  it("refuses the whole digest when any one design comes back under two revisions, healthy kitchens included", async () => {
    plantChanged();
    plantChanged({ revision: "9" });
    const store = currentSeenWorld().port;

    const outcome = await run(
      listedOnce(async (now) => {
        const rows = await store.listDigestEligible(now);
        const [row] = rows;
        if (row === undefined) throw new Error("no row");
        return [...rows, { ...row, revision: "7" }];
      }),
    );

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_COMPOSE_FAILED",
    });
    expect(sender.sent).toHaveLength(0);
    expect(currentSeenWorld().store.heldDigestEntries()).toEqual([]);
  });

  it("records each design at its own revision as the store returned it, however the revisions compare as text", async () => {
    const revisions = ["6", "12", "100", "9007199254740993"];
    const kitchens = revisions.map((revision) => plantChanged({ revision }));

    const outcome = await run();

    expect(outcome).toEqual({ status: "sent", kitchenCount: 4 });
    const held = currentSeenWorld().store.heldDigestEntries();
    for (const [index, kitchen] of kitchens.entries()) {
      expect(held).toContainEqual({
        designId: kitchen.designId,
        revision: revisions[index],
      });
    }
    expect(held).toHaveLength(4);
  });

  it("records exactly the rows of the message it sent: one entry per link in the text", async () => {
    for (let count = 0; count < 5; count += 1) plantChanged();

    await run();

    const message = sender.sent[0];
    const links = message?.text.match(/https:\/\/\S+/g) ?? [];
    const entries = currentSeenWorld().store.heldDigestEntries();
    expect(links).toHaveLength(5);
    expect(entries.map((entry) => entry.designId).sort()).toEqual(
      links.map((link) => link.split("/").pop() ?? "").sort(),
    );
  });

  it("builds a message the mail port would accept, with exactly four members and no recipient", async () => {
    plantChanged();

    await run();

    const message = sender.sent[0];
    if (message === undefined) throw new Error("nothing was sent");
    expect(isSendableMailMessage(message)).toBe(true);
    expect(Object.keys(message).sort()).toEqual([
      "html",
      "key",
      "subject",
      "text",
    ]);
  });

  it("lets no store row or its text choose the recipient: an e-mail-looking name stays text", async () => {
    plantChanged({
      kitchenName: "to: victim@evil.example",
      customerName: "bcc: victim@evil.example",
    });

    await run();

    const message = sender.sent[0];
    expect(Object.hasOwn(message ?? {}, "recipient")).toBe(false);
    expect(message?.subject).not.toContain("evil");
  });

  it("leaves out designs the store did not list: a kitchen deleted by its client and one already seen", async () => {
    plantChanged({ isDeletedByClient: true });
    plantSeenKitchen({ revision: "5" });

    expect(await run()).toEqual({ status: "nothing-to-send" });
  });
});

describe("a row with nothing to name the customer by", () => {
  // Flipped in wave K4's fix round: a row the domain cannot describe is left out (it stays eligible and is not
  // recorded), and a day of nothing but such rows answers DIGEST_ROWS_MALFORMED with the day claimed.
  it("answers DIGEST_ROWS_MALFORMED and sends nothing when the only listed row has neither a name nor a reference", async () => {
    plantChanged();
    const store = currentSeenWorld().port;

    const outcome = await run(
      listedOnce(async (now) => {
        const [row] = await store.listDigestEligible(now);
        if (row === undefined) throw new Error("no row");
        const rest: Record<string, unknown> = { ...row };
        delete rest.customerName;
        delete rest.reference;
        return [rest as unknown as DigestEligibleKitchen];
      }),
    );

    expect(outcome).toEqual({
      status: "failed",
      errorCode: "DIGEST_ROWS_MALFORMED",
    });
    expect(sender.sent).toHaveLength(0);
    expect(heldDayKeys()).toEqual(["2026-10-20"]);
  });

  // Backlog 290's consequence, fixed: the store keeps a name `btrim` does not strip (tab, no-break space), so the row
  // reaches the run with a customer name the domain calls blank and no reference. It is left out, recorded nowhere and
  // eligible again tomorrow, and the healthy kitchens are sent.
  it.each([
    ["a tab", "\t"],
    ["a no-break space", "\u00A0"],
    ["a mix of tabs and no-break spaces", "\t\u00A0\t"],
  ])(
    "sends the healthy kitchens and leaves out an account name of only %s, which stays eligible (backlog 290)",
    async (_name, blankName) => {
      const malformed = plantChanged({ customerName: blankName });
      const healthy = plantChanged({ customerName: "Ioana" });

      const firstDay = await run();
      runAt = NEXT_DAY_RUN;
      const secondDay = await run();

      expect(firstDay).toEqual({
        status: "sent",
        kitchenCount: 1,
        skippedCount: 1,
      });
      expect(sender.sent[0]?.text).toContain("Ioana");
      expect(
        currentSeenWorld()
          .store.heldDigestEntries()
          .map((entry) => entry.designId),
      ).toEqual([healthy.designId]);
      expect(secondDay).toEqual({
        status: "failed",
        errorCode: "DIGEST_ROWS_MALFORMED",
      });
      expect(malformed.designId).not.toBe(healthy.designId);
    },
  );

  it("falls back to the reference for an account name of only spaces, which the store does strip", async () => {
    plantChanged({ customerName: "   ", reference: "LM-SPACES" });

    const outcome = await run();

    expect(outcome).toEqual({ status: "sent", kitchenCount: 1 });
    expect(sender.sent[0]?.text).toContain("LM-SPACES");
  });
});

describe("a large backlog", () => {
  const WORST_KITCHEN_NAME = '"'.repeat(120);
  const WORST_ACCOUNT_NAME = '"'.repeat(100);

  function plantBacklog(size: number): void {
    for (let count = 0; count < size; count += 1) {
      plantChanged({
        kitchenName: WORST_KITCHEN_NAME,
        customerName: WORST_ACCOUNT_NAME,
      });
    }
  }

  it("sends a backlog of 100 kitchens with the longest names in one accepted message", async () => {
    plantBacklog(100);

    const outcome = await run();

    expect(outcome).toEqual({ status: "sent", kitchenCount: 100 });
    expect(sender.sent[0]?.html?.length).toBeLessThanOrEqual(HTML_MAX_LENGTH);
  });

  // Flipped in wave K4's fix round: the message lists as many kitchens as fit under DIGEST_HTML_BUDGET and says how
  // many wait; entries are recorded only for the listed ones, so the rest are sent in the following days' e-mails.
  it("sends what fits of a backlog the mail port would refuse whole, records only those rows, and sends the rest on the following days", async () => {
    plantBacklog(1000);
    senderOutcome = () =>
      Promise.resolve(
        isSendableMailMessage(lastSent())
          ? MAIL_ACCEPTED
          : { ok: false, kind: "refused" },
      );

    const firstDay = await run();
    const recordedFirstDay =
      currentSeenWorld().store.heldDigestEntries().length;
    runAt = NEXT_DAY_RUN;
    const secondDay = await run();

    expect(firstDay.status).toBe("sent");
    if (firstDay.status !== "sent") throw new Error("not sent");
    expect(firstDay.kitchenCount).toBe(recordedFirstDay);
    expect(firstDay.kitchenCount).toBeGreaterThan(100);
    expect(firstDay.kitchenCount).toBeLessThan(1000);
    expect(firstDay.waitingCount).toBe(1000 - firstDay.kitchenCount);
    expect(sender.sent[0]?.html?.length).toBeLessThanOrEqual(HTML_MAX_LENGTH);
    expect(secondDay.status).toBe("sent");
    expect(currentSeenWorld().store.heldDigestEntries().length).toBeGreaterThan(
      recordedFirstDay,
    );
    expect(
      new Set(
        currentSeenWorld()
          .store.heldDigestEntries()
          .map((entry) => entry.designId),
      ).size,
    ).toBe(currentSeenWorld().store.heldDigestEntries().length);
  });
});
