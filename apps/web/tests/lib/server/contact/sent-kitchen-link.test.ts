import { createHash } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import type {
  SentKitchenViewRecording,
  SentKitchenViewRepository,
  SentKitchenViewToRecord,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as SentKitchenLinkModule from "@/lib/server/contact/sent-kitchen-link";
import type { PublicOriginOutcome } from "@/lib/server/public-origin";

import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
  type ConsoleSpy,
} from "../mail/mail-test-support";

const ORIGIN = "https://lemnaria.example";
const CONFIGURED: PublicOriginOutcome = {
  status: "configured",
  origin: ORIGIN,
};
const UNSET: PublicOriginOutcome = {
  status: "unavailable",
  variable: "LEMNARIA_PUBLIC_ORIGIN",
};

const CLIENT_REQUEST_ID = "req_7Hq2Lw9Zp4Xc8Vb3";
const OTHER_CLIENT_REQUEST_ID = "req_Nn5Kd1Tg6Ys0Rf2M";
const KITCHEN = {
  clientRequestId: CLIENT_REQUEST_ID,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  document: canonicalSerializeDesign(KITCHEN_L_DESIGN),
} as const;

/** Bytes 0 to 31 in order: every one is accepted, so the token is the alphabet's first twelve characters. */
const FIXED_TOKEN = "0123456789AB";
const FIXED_TOKEN_HASH = createHash("sha256").update(FIXED_TOKEN).digest("hex");
const TOKEN_SHAPE = /^[0-9A-Za-z]{12}$/;
const LOG_LABEL = "[sent-kitchen-link]";

function fixedBytes(size: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_unused, index) => index);
}

/** The once-per-cause memo lives as long as its module, so each test reads a graph of its own, persistence included,
 *  so that the error class the fake throws is the one the module tests for. */
async function freshModules(): Promise<{
  link: typeof SentKitchenLinkModule;
  persistence: typeof import("@lemnaria/persistence");
}> {
  vi.resetModules();
  return {
    link: await import("@/lib/server/contact/sent-kitchen-link"),
    persistence: await import("@lemnaria/persistence"),
  };
}

function sha256Of(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tokenOf(url: string): string {
  return url.slice(`${ORIGIN}/ro/s/`.length);
}

let consoleSpies: readonly ConsoleSpy[];

beforeEach(() => {
  consoleSpies = spyOnEveryConsoleMethod();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("mintSentKitchenLink: a recorded link", () => {
  it("answers the origin, the notice's locale and the token, and records the token's hash with the kitchen", async () => {
    const { link, persistence } = await freshModules();
    const repository = new persistence.FakeSentKitchenViewRepository();

    const answer = await link.mintSentKitchenLink(KITCHEN, {
      origin: CONFIGURED,
      repository,
      drawBytes: fixedBytes,
    });

    expect(answer).toEqual({
      kind: "link",
      url: `${ORIGIN}/ro/s/${FIXED_TOKEN}`,
    });
    expect(repository.heldViews()).toEqual([
      { ...KITCHEN, tokenHash: FIXED_TOKEN_HASH, isRevoked: false },
    ]);
  });

  it("stores the hash, never the token, so the token appears nowhere in the row", async () => {
    const { link, persistence } = await freshModules();
    const repository = new persistence.FakeSentKitchenViewRepository();

    await link.mintSentKitchenLink(KITCHEN, {
      origin: CONFIGURED,
      repository,
      drawBytes: fixedBytes,
    });

    expect(JSON.stringify(repository.heldViews())).not.toContain(FIXED_TOKEN);
  });

  it("mints a fresh token at each call, each well-formed and each loading the kitchen as sent", async () => {
    const { link, persistence } = await freshModules();
    const repository = new persistence.FakeSentKitchenViewRepository();
    const ports = { origin: CONFIGURED, repository };

    const first = await link.mintSentKitchenLink(KITCHEN, ports);
    const second = await link.mintSentKitchenLink(KITCHEN, ports);

    if (first.kind !== "link" || second.kind !== "link")
      throw new Error("expected two links");
    const tokens = [tokenOf(first.url), tokenOf(second.url)];
    expect(tokens[0]).not.toBe(tokens[1]);
    for (const token of tokens) {
      expect(token).toMatch(TOKEN_SHAPE);
      await expect(repository.load(sha256Of(token))).resolves.toEqual({
        kind: "found",
        design: KITCHEN_L_DESIGN,
      });
    }
  });

  it("writes nothing to the console when the link is recorded", async () => {
    const { link, persistence } = await freshModules();

    await link.mintSentKitchenLink(KITCHEN, {
      origin: CONFIGURED,
      repository: new persistence.FakeSentKitchenViewRepository(),
    });

    expect(consoleCallsOf(consoleSpies)).toEqual([]);
  });
});

describe("mintSentKitchenLink: no link, and the cause", () => {
  it("answers origin-unset and records nothing when the origin is unavailable", async () => {
    const { link, persistence } = await freshModules();
    const repository = new persistence.FakeSentKitchenViewRepository();
    const record = vi.spyOn(repository, "record");

    const answer = await link.mintSentKitchenLink(KITCHEN, {
      origin: UNSET,
      repository,
    });

    expect(answer).toEqual({ kind: "unavailable", cause: "origin-unset" });
    expect(record).not.toHaveBeenCalled();
  });

  it("answers record-failed when the repository gives no trustworthy answer", async () => {
    const { link, persistence } = await freshModules();
    const repository = new persistence.FakeSentKitchenViewRepository({
      isRequestStored: () => false,
    });

    await expect(
      link.mintSentKitchenLink(KITCHEN, { origin: CONFIGURED, repository }),
    ).resolves.toEqual({ kind: "unavailable", cause: "record-failed" });
  });

  it("answers record-failed, never a link, when the hash is already another request's", async () => {
    const { link, persistence } = await freshModules();
    const repository = new persistence.FakeSentKitchenViewRepository();
    await repository.record({
      ...KITCHEN,
      clientRequestId: OTHER_CLIENT_REQUEST_ID,
      tokenHash: FIXED_TOKEN_HASH,
    });

    const answer = await link.mintSentKitchenLink(KITCHEN, {
      origin: CONFIGURED,
      repository,
      drawBytes: fixedBytes,
    });

    expect(answer).toEqual({ kind: "unavailable", cause: "record-failed" });
  });

  it("answers unexpected when the repository refuses the view before any statement", async () => {
    const { link, persistence } = await freshModules();

    const answer = await link.mintSentKitchenLink(
      { ...KITCHEN, document: "not the JSON text of an object" },
      {
        origin: CONFIGURED,
        repository: new persistence.FakeSentKitchenViewRepository(),
      },
    );

    expect(answer).toEqual({ kind: "unavailable", cause: "unexpected" });
  });

  it("answers unexpected, without throwing, when record throws before it returns a promise", async () => {
    const { link } = await freshModules();
    const repository: SentKitchenViewRepository = {
      record: () => {
        throw new TypeError("not a promise");
      },
      load: () => Promise.resolve({ kind: "none" }),
    };

    await expect(
      link.mintSentKitchenLink(KITCHEN, { origin: CONFIGURED, repository }),
    ).resolves.toEqual({ kind: "unavailable", cause: "unexpected" });
  });

  it("answers unexpected, without throwing, when the token cannot be drawn", async () => {
    const { link, persistence } = await freshModules();

    await expect(
      link.mintSentKitchenLink(KITCHEN, {
        origin: CONFIGURED,
        repository: new persistence.FakeSentKitchenViewRepository(),
        drawBytes: () => {
          throw new Error("no entropy");
        },
      }),
    ).resolves.toEqual({ kind: "unavailable", cause: "unexpected" });
  });

  it("still answers when the console itself throws", async () => {
    const { link } = await freshModules();
    for (const spy of consoleSpies) {
      spy.mockImplementation(() => {
        throw new Error("the console is closed");
      });
    }

    await expect(
      link.mintSentKitchenLink(KITCHEN, {
        origin: UNSET,
        repository: {} as SentKitchenViewRepository,
      }),
    ).resolves.toEqual({ kind: "unavailable", cause: "origin-unset" });
  });
});

/** A repository whose `record` answers through the fake after `delayMs` of fake time. */
function recordingAfter(
  delayMs: number,
  inner: SentKitchenViewRepository,
): SentKitchenViewRepository {
  return {
    record: (view: SentKitchenViewToRecord) =>
      new Promise<SentKitchenViewRecording>((resolve, reject) => {
        setTimeout(() => {
          inner.record(view).then(resolve, reject);
        }, delayMs);
      }),
    load: (tokenHash) => inner.load(tokenHash),
  };
}

describe("mintSentKitchenLink: the deadline", () => {
  it("waits two seconds by default", async () => {
    const { link } = await freshModules();

    expect(link.KITCHEN_LINK_DEADLINE_MS).toBe(2000);
  });

  it("answers deadline at the deadline when the record has not answered, and the late row links nothing", async () => {
    vi.useFakeTimers();
    const { link, persistence } = await freshModules();
    const inner = new persistence.FakeSentKitchenViewRepository();
    let settled: unknown;

    void link
      .mintSentKitchenLink(KITCHEN, {
        origin: CONFIGURED,
        repository: recordingAfter(link.KITCHEN_LINK_DEADLINE_MS + 1, inner),
        drawBytes: fixedBytes,
      })
      .then((answer) => {
        settled = answer;
      });
    await vi.advanceTimersByTimeAsync(link.KITCHEN_LINK_DEADLINE_MS);

    expect(settled).toEqual({ kind: "unavailable", cause: "deadline" });
    await vi.advanceTimersByTimeAsync(1);
    expect(inner.heldViews().map(({ tokenHash }) => tokenHash)).toEqual([
      FIXED_TOKEN_HASH,
    ]);
    expect(settled).toEqual({ kind: "unavailable", cause: "deadline" });
  });

  it("answers the link when the record answers one millisecond before the deadline", async () => {
    vi.useFakeTimers();
    const { link, persistence } = await freshModules();
    let settled: unknown;

    void link
      .mintSentKitchenLink(KITCHEN, {
        origin: CONFIGURED,
        repository: recordingAfter(
          link.KITCHEN_LINK_DEADLINE_MS - 1,
          new persistence.FakeSentKitchenViewRepository(),
        ),
        drawBytes: fixedBytes,
      })
      .then((answer) => {
        settled = answer;
      });
    await vi.advanceTimersByTimeAsync(link.KITCHEN_LINK_DEADLINE_MS - 1);

    expect(settled).toEqual({
      kind: "link",
      url: `${ORIGIN}/ro/s/${FIXED_TOKEN}`,
    });
  });

  it("honours a deadline handed in", async () => {
    vi.useFakeTimers();
    const { link, persistence } = await freshModules();
    const deadlineMs = 50;
    let settled: unknown;

    void link
      .mintSentKitchenLink(KITCHEN, {
        origin: CONFIGURED,
        repository: recordingAfter(
          deadlineMs + 1,
          new persistence.FakeSentKitchenViewRepository(),
        ),
        deadlineMs,
      })
      .then((answer) => {
        settled = answer;
      });
    await vi.advanceTimersByTimeAsync(deadlineMs);

    expect(settled).toEqual({ kind: "unavailable", cause: "deadline" });
  });
});

describe("mintSentKitchenLink: the log line", () => {
  it("lists exactly the four causes the plan names", async () => {
    const { link } = await freshModules();

    expect([...link.KITCHEN_LINK_CAUSES]).toEqual([
      "origin-unset",
      "record-failed",
      "deadline",
      "unexpected",
    ]);
  });

  it("writes one line on console.error: the label, then the event and the cause and nothing else", async () => {
    const { link, persistence } = await freshModules();

    await link.mintSentKitchenLink(KITCHEN, {
      origin: CONFIGURED,
      repository: new persistence.FakeSentKitchenViewRepository({
        isRequestStored: () => false,
      }),
    });

    expect(consoleCallsOf(consoleSpies)).toEqual([
      [
        LOG_LABEL,
        JSON.stringify({
          event: "sent-kitchen-link-unavailable",
          cause: "record-failed",
        }),
      ],
    ]);
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
  });

  it("writes one line per cause for a process, and none for a cause already written", async () => {
    const { link, persistence } = await freshModules();
    const refusing = new persistence.FakeSentKitchenViewRepository({
      isRequestStored: () => false,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await link.mintSentKitchenLink(KITCHEN, {
        origin: UNSET,
        repository: refusing,
      });
      await link.mintSentKitchenLink(KITCHEN, {
        origin: CONFIGURED,
        repository: refusing,
      });
    }

    expect(
      consoleCallsOf(consoleSpies).map(([, line]) => String(line)),
    ).toEqual([
      JSON.stringify({
        event: "sent-kitchen-link-unavailable",
        cause: "origin-unset",
      }),
      JSON.stringify({
        event: "sent-kitchen-link-unavailable",
        cause: "record-failed",
      }),
    ]);
  });

  it("logs no token, hash, request id, origin or document on any cause", async () => {
    vi.useFakeTimers();
    const { link, persistence } = await freshModules();
    const ports = { origin: CONFIGURED, drawBytes: fixedBytes };
    const taken = new persistence.FakeSentKitchenViewRepository();
    await taken.record({
      ...KITCHEN,
      clientRequestId: OTHER_CLIENT_REQUEST_ID,
      tokenHash: FIXED_TOKEN_HASH,
    });

    await link.mintSentKitchenLink(KITCHEN, { ...ports, repository: taken });
    await link.mintSentKitchenLink(
      { ...KITCHEN, document: "[]" },
      {
        ...ports,
        repository: new persistence.FakeSentKitchenViewRepository(),
      },
    );
    const late = link.mintSentKitchenLink(KITCHEN, {
      ...ports,
      repository: recordingAfter(
        link.KITCHEN_LINK_DEADLINE_MS + 1,
        new persistence.FakeSentKitchenViewRepository(),
      ),
    });
    await vi.advanceTimersByTimeAsync(link.KITCHEN_LINK_DEADLINE_MS + 1);
    await late;

    const written = JSON.stringify(consoleCallsOf(consoleSpies));
    expect(consoleCallsOf(consoleSpies)).toHaveLength(3);
    for (const value of [
      FIXED_TOKEN,
      FIXED_TOKEN_HASH,
      CLIENT_REQUEST_ID,
      OTHER_CLIENT_REQUEST_ID,
      ORIGIN,
      "lemnaria.example",
      KITCHEN.document.slice(0, 24),
    ]) {
      expect(written).not.toContain(value);
    }
  });
});
