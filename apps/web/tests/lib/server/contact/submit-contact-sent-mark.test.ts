import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import {
  FakeSentMarkStore,
  type SentMarkStore,
  type SubmissionRecording,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
  type ConsoleSpy,
} from "../mail/mail-test-support";
import {
  DESIGN_ID,
  aHarness,
  bodyOf,
  callbackBodyOf,
  type Harness,
  type HarnessOptions,
} from "./submit-contact-harness";

/**
 * The sent mark (M8B Lot 2, S5; plan section 12.1): once a design's request is stored, `designs.sent_at` is set, before
 * the shop's notice, without ever failing the customer's answer, within one second, and again on a retry that finds the
 * design. Every case drives `submitContact` over the harness's fakes; the mark is the persistence package's own
 * `FakeSentMarkStore`, wrapped only to log when it was asked and to misbehave when a test says so.
 */

const OWNER_ACCOUNT_ID = "o".repeat(21);
const SENT_MARK_DEADLINE_MS = 1000;
const NOT_NOTIFIED = { ok: false, kind: "busy" } as const;

let consoleSpies: readonly ConsoleSpy[];

beforeEach(() => {
  consoleSpies = spyOnEveryConsoleMethod();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type MarkBehaviour = (
  real: SentMarkStore,
  designId: string,
  attempt: number,
) => Promise<void>;

interface MarkLog {
  readonly designIds: string[];
}

/** A sent-mark port that logs `mark-sent` in the harness's call log, remembers which ids it was asked for, and
 *  behaves as told. */
function markingWith(
  behaviour: MarkBehaviour,
  log: MarkLog,
): NonNullable<HarnessOptions["sentMarks"]> {
  return (kitchens, calls) => {
    const real = new FakeSentMarkStore(kitchens);
    return {
      markSent: (designId) => {
        calls.push("mark-sent");
        log.designIds.push(designId);
        return behaviour(real, designId, log.designIds.length);
      },
    };
  };
}

const PASS_THROUGH: MarkBehaviour = (real, designId) => real.markSent(designId);
const FAILS: MarkBehaviour = () =>
  Promise.reject(new Error("MARK-DRIVER-FAILURE-MARKER"));
const NEVER_ANSWERS: MarkBehaviour = () => new Promise(() => undefined);
const FAILS_ONCE: MarkBehaviour = (real, designId, attempt) =>
  attempt === 1 ? FAILS(real, designId, attempt) : real.markSent(designId);

function harnessWith(
  behaviour: MarkBehaviour,
  options: Omit<HarnessOptions, "sentMarks"> = {},
): { harness: Harness; log: MarkLog } {
  const log: MarkLog = { designIds: [] };
  const harness = aHarness({
    ...options,
    sentMarks: markingWith(behaviour, log),
  });
  seedUnsentDesign(harness);
  return { harness, log };
}

function seedUnsentDesign(harness: Harness): void {
  harness.kitchens.seed({
    id: DESIGN_ID,
    accountId: OWNER_ACCOUNT_ID,
    design: KITCHEN_L_DESIGN,
  });
}

function sentAtOf(harness: Harness): Date | undefined {
  return harness.kitchens.held(DESIGN_ID)?.sentAt;
}

function linesOfEvent(event: string): unknown[] {
  return consoleCallsOf(consoleSpies)
    .flat()
    .filter(
      (argument) =>
        typeof argument === "object" &&
        argument !== null &&
        (argument as { event?: unknown }).event === event,
    );
}

describe("a design's request, stored", () => {
  it("sets sent_at after the record and before the notice, once", async () => {
    const { harness, log } = harnessWith(PASS_THROUGH);

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(harness.calls).toEqual([
      "judge:every",
      "lookUp",
      "load",
      "judge:new",
      "record",
      "mark-sent",
      "record-view",
      "send",
      "mark",
    ]);
    expect(log.designIds).toEqual([DESIGN_ID]);
    expect(sentAtOf(harness)).toBeInstanceOf(Date);
  });

  it("marks the design the owned load found and no id the request named", async () => {
    const { harness, log } = harnessWith(PASS_THROUGH, {
      loadOwned: () =>
        Promise.resolve({
          kind: "found",
          design: KITCHEN_L_DESIGN,
          revision: "1",
        }),
    });

    await harness.submit(bodyOf());

    expect(log.designIds).toEqual([DESIGN_ID]);
  });

  it("marks the design before the notice goes out, and the mark is there even when the notice fails", async () => {
    const { harness } = harnessWith(PASS_THROUGH, { outcomes: [NOT_NOTIFIED] });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(502);
    expect(harness.calls.indexOf("mark-sent")).toBeLessThan(
      harness.calls.indexOf("send"),
    );
    expect(harness.calls).not.toContain("mark");
    expect(sentAtOf(harness)).toBeInstanceOf(Date);
  });

  it("marks a design whose twin request already stored and notified it: the row keeps its first instant", async () => {
    const { harness } = harnessWith(PASS_THROUGH);
    await harness.submit(bodyOf());
    const first = sentAtOf(harness);

    await harness.submit(bodyOf({ clientRequestId: "req_another0123456789" }));

    expect(sentAtOf(harness)).toEqual(first);
  });

  it("asks for no mark of a callback, which has no design", async () => {
    const { harness, log } = harnessWith(PASS_THROUGH);

    const answer = await harness.submit(callbackBodyOf());

    expect(answer.status).toBe(200);
    expect(log.designIds).toEqual([]);
    expect(harness.calls).not.toContain("mark-sent");
    expect(sentAtOf(harness)).toBeUndefined();
    expect(linesOfEvent("contact-sent-mark-failed")).toEqual([]);
  });
});

describe("nothing is marked for a request that stored nothing", () => {
  it("does not mark when the record answers a conflict", async () => {
    const { harness, log } = harnessWith(PASS_THROUGH, {
      store: (inner) => ({
        lookUp: (request) => inner.lookUp(request),
        record: () =>
          Promise.resolve({ kind: "conflict" } as SubmissionRecording),
        markNotified: (id) => inner.markNotified(id),
      }),
    });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(log.designIds).toEqual([]);
    expect(sentAtOf(harness)).toBeUndefined();
    expect(harness.calls).not.toContain("send");
  });

  it("does not mark when the record itself fails", async () => {
    const { harness, log } = harnessWith(PASS_THROUGH, {
      store: (inner) => ({
        lookUp: (request) => inner.lookUp(request),
        record: () => Promise.reject(new Error("store down")),
        markNotified: (id) => inner.markNotified(id),
      }),
    });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(503);
    expect(log.designIds).toEqual([]);
  });

  it("does not mark when the honeypot or the time refuses the request", async () => {
    const { harness, log } = harnessWith(PASS_THROUGH);

    await harness.submit(bodyOf({ honeypot: "http://spam.example" }));
    await harness.submit(bodyOf({ elapsedMs: 10 }));

    expect(log.designIds).toEqual([]);
    expect(sentAtOf(harness)).toBeUndefined();
  });

  it("does not mark when the design is not the visitor's to send", async () => {
    const { harness, log } = harnessWith(PASS_THROUGH, {
      loadOwned: () =>
        Promise.resolve({ kind: "refused", reason: "unavailable" }),
    });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(log.designIds).toEqual([]);
    expect(sentAtOf(harness)).toBeUndefined();
  });
});

describe("a mark that fails is never the customer's failure", () => {
  it("answers the stored request as sent, writes one line with the reference, and still sends the notice", async () => {
    const { harness } = harnessWith(FAILS);

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    const body = (await answer.json()) as { status: string; reference: string };
    expect(body).toMatchObject({ status: "sent" });
    expect(harness.sender.sent).toHaveLength(1);
    expect(sentAtOf(harness)).toBeUndefined();
    const lines = linesOfEvent("contact-sent-mark-failed");
    expect(lines).toEqual([
      { event: "contact-sent-mark-failed", reference: body.reference },
    ]);
  });

  it("writes nothing the failure said", async () => {
    const { harness } = harnessWith(FAILS);

    await harness.submit(bodyOf());

    expect(JSON.stringify(consoleCallsOf(consoleSpies))).not.toContain(
      "MARK-DRIVER-FAILURE-MARKER",
    );
  });

  it("answers as sent even when the mark throws before it returns a promise", async () => {
    const { harness } = harnessWith(() => {
      throw new Error("synchronous failure");
    });

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(200);
  });
});

describe("a mark that hangs is bounded at one second", () => {
  it("holds the answer for the deadline and no longer, then answers as sent with the failure written down", async () => {
    vi.useFakeTimers();
    const { harness } = harnessWith(NEVER_ANSWERS);
    let answered: Response | undefined;
    const pending = harness.submit(bodyOf()).then((answer) => {
      answered = answer;
    });

    await vi.advanceTimersByTimeAsync(SENT_MARK_DEADLINE_MS - 1);
    expect(answered).toBeUndefined();
    expect(harness.calls).toContain("mark-sent");
    expect(harness.calls).not.toContain("send");

    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(answered?.status).toBe(200);
    expect(harness.sender.sent).toHaveLength(1);
    expect(linesOfEvent("contact-sent-mark-failed")).toHaveLength(1);
    expect(sentAtOf(harness)).toBeUndefined();
  });

  it("answers at once when the mark is quick: no timer is waited out", async () => {
    vi.useFakeTimers();
    const { harness } = harnessWith(PASS_THROUGH);

    const answer = await harness.submit(bodyOf());

    expect(answer.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("a retry of a stored request whose notice is still owed", () => {
  it("repairs a mark that was lost the first time, and sends the notice", async () => {
    const { harness, log } = harnessWith(FAILS_ONCE, {
      outcomes: [NOT_NOTIFIED],
    });
    const first = await harness.submit(bodyOf());
    expect(first.status).toBe(502);
    expect(sentAtOf(harness)).toBeUndefined();
    harness.calls.length = 0;

    const retried = await harness.submit(bodyOf());

    expect(retried.status).toBe(200);
    expect(log.designIds).toEqual([DESIGN_ID, DESIGN_ID]);
    expect(harness.calls).toEqual([
      "judge:every",
      "lookUp",
      "judge:tries",
      "load",
      "mark-sent",
      "record-view",
      "send",
      "mark",
    ]);
    expect(sentAtOf(harness)).toBeInstanceOf(Date);
  });

  it("marks again without moving an instant that was kept the first time", async () => {
    const { harness } = harnessWith(PASS_THROUGH, { outcomes: [NOT_NOTIFIED] });
    await harness.submit(bodyOf());
    const first = sentAtOf(harness);

    await harness.submit(bodyOf());

    expect(sentAtOf(harness)).toEqual(first);
  });

  it("does not mark on a retry whose design can no longer be read", async () => {
    let reads = 0;
    const { harness, log } = harnessWith(PASS_THROUGH, {
      outcomes: [NOT_NOTIFIED],
      loadOwned: () =>
        ++reads === 1
          ? Promise.resolve({
              kind: "found",
              design: KITCHEN_L_DESIGN,
              revision: "1",
            })
          : Promise.resolve({ kind: "refused", reason: "unavailable" }),
    });
    await harness.submit(bodyOf());
    log.designIds.length = 0;

    const retried = await harness.submit(bodyOf());

    expect(retried.status).toBeGreaterThanOrEqual(400);
    expect(log.designIds).toEqual([]);
  });
});

describe("a stored request whose notice already went out (a documented residual)", () => {
  it("is answered from the lookup without reading the design again, so a mark lost the first time is not repaired", async () => {
    const { harness, log } = harnessWith(FAILS_ONCE);
    const first = await harness.submit(bodyOf());
    expect(first.status).toBe(200);
    expect(sentAtOf(harness)).toBeUndefined();
    harness.calls.length = 0;

    const again = await harness.submit(bodyOf());

    expect(again.status).toBe(200);
    expect(log.designIds).toEqual([DESIGN_ID]);
    expect(harness.calls).not.toContain("load");
    expect(harness.calls).not.toContain("mark-sent");
    expect(sentAtOf(harness)).toBeUndefined();
  });
});
