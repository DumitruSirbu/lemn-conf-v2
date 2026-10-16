import { createHash } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  canonicalSerializeDesign,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type {
  SentKitchenViewRecording,
  SentKitchenViewRepository,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KITCHEN_LINK_DEADLINE_MS } from "@/lib/server/contact/sent-kitchen-link";
import { submitContact } from "@/lib/server/contact/submit-contact";
import type { MailMessage } from "@/lib/server/mail/mail-sender";
import {
  PUBLIC_ORIGIN_VARIABLE,
  readPublicOrigin,
  type PublicOriginOutcome,
} from "@/lib/server/public-origin";

import { ro } from "../../../support/romanian-content";
import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
  type ConsoleSpy,
} from "../mail/mail-test-support";
import { parseNotice } from "../mail/notice-html-dom-support";
import {
  aHarness,
  bodyOf,
  callbackBodyOf,
  EMAIL_MARKER,
  NAME_MARKER,
  PUBLIC_ORIGIN,
  REQUEST_ID,
  type Harness,
  type HarnessOptions,
} from "./submit-contact-harness";

const KITCHEN_HREF = /^https:\/\/lemnaria\.example\/ro\/s\/([0-9A-Za-z]{12})$/;
const KITCHEN_PATH = "/ro/s/";
const LINK_LABEL = "[sent-kitchen-link]";
const MARKER = "MARKER-KITCHEN-5170";
const UNAVAILABLE = ro.leadNotice.kitchen.unavailable;
const NOT_SENT = { ok: false, kind: "busy" } as const;
const BY_EMAIL = {
  name: NAME_MARKER,
  phone: "069 000 111",
  locality: "Fakeville",
  channel: "email",
  email: EMAIL_MARKER,
  consent: true,
  consentTextVersion: "placeholder",
};

let consoleSpies: readonly ConsoleSpy[];

beforeEach(() => {
  consoleSpies = spyOnEveryConsoleMethod();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function sha256Of(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function hrefsOf(message: MailMessage | undefined): string[] {
  const { document } = parseNotice(message?.html ?? "");
  return [...document.querySelectorAll("a")].map(
    (anchor) => anchor.getAttribute("href") ?? "",
  );
}

/** The kitchen link's token in the HTML part, and that the text part's first line names the same address. */
function kitchenTokenOf(message: MailMessage | undefined): string {
  const kitchenHrefs = hrefsOf(message).filter((href) =>
    href.includes(KITCHEN_PATH),
  );
  expect(kitchenHrefs).toHaveLength(1);
  const [href = ""] = kitchenHrefs;
  const token = KITCHEN_HREF.exec(href)?.[1];
  expect(token).toBeDefined();
  expect(message?.text.split("\n")[0]).toContain(href);
  return token ?? "";
}

function expectNoKitchenLink(message: MailMessage | undefined): void {
  expect(
    hrefsOf(message).filter((href) => href.includes(KITCHEN_PATH)),
  ).toEqual([]);
  expect(message?.html).toContain(UNAVAILABLE);
  expect(message?.html).not.toContain(ro.leadNotice.kitchen.button);
  expect(message?.text.split("\n")[0]).toBe(UNAVAILABLE);
  expect(message?.text).not.toContain(KITCHEN_PATH);
}

async function jsonOf(answer: Response): Promise<Record<string, unknown>> {
  return (await answer.clone().json()) as Record<string, unknown>;
}

function viewsAnswering(
  record: SentKitchenViewRepository["record"],
): NonNullable<HarnessOptions["views"]> {
  return (inner) => ({ record, load: (hash) => inner.load(hash) });
}

describe("the link a design's notice carries is the one minted and recorded for it", () => {
  it("carries in both parts a link whose token hashes to the view recorded for this request, holding the snapshot", async () => {
    const harness = aHarness();

    const answer = await harness.submit(bodyOf());

    const [held] = harness.store.heldSubmissions();
    const token = kitchenTokenOf(harness.sender.sent[0]);
    expect(answer.status).toBe(200);
    expect(harness.views.heldViews()).toEqual([
      {
        tokenHash: sha256Of(token),
        clientRequestId: REQUEST_ID,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        document: held?.submission.snapshot?.document,
        isRevoked: false,
      },
    ]);
  });

  it("opens, through the view it names, the kitchen as it was sent", async () => {
    const harness = aHarness();
    await harness.submit(bodyOf());

    const token = kitchenTokenOf(harness.sender.sent[0]);
    const loaded = await harness.views.load(sha256Of(token));

    expect(loaded.kind).toBe("found");
    expect(
      loaded.kind === "found" ? canonicalSerializeDesign(loaded.design) : "",
    ).toBe(canonicalSerializeDesign(KITCHEN_L_DESIGN));
  });

  it("reads the origin again for each attempt, so a retry's link is under the origin of its own moment", async () => {
    let origin: PublicOriginOutcome = {
      status: "configured",
      origin: "https://first.lemnaria.example",
    };
    const harness = aHarness({
      outcomes: [NOT_SENT],
      readPublicOrigin: () => origin,
    });
    await harness.submit(bodyOf());
    origin = { status: "configured", origin: PUBLIC_ORIGIN };

    await harness.submit(bodyOf());

    expect(hrefsOf(harness.sender.sent[0])).toContainEqual(
      expect.stringMatching(/^https:\/\/first\.lemnaria\.example\/ro\/s\//),
    );
    expect(kitchenTokenOf(harness.sender.sent[1])).toHaveLength(12);
  });
});

describe("a callback request has no kitchen", () => {
  it("records no view and carries neither a kitchen link nor the unavailable line", async () => {
    const harness = aHarness();

    const answer = await harness.submit(callbackBodyOf());

    const [message] = harness.sender.sent;
    expect(answer.status).toBe(200);
    expect(harness.calls).not.toContain("record-view");
    expect(harness.views.heldViews()).toEqual([]);
    expect(
      hrefsOf(message).filter((href) => href.includes(KITCHEN_PATH)),
    ).toEqual([]);
    expect(message?.text).not.toContain(KITCHEN_PATH);
    expect(message?.text).not.toContain(UNAVAILABLE);
    expect(message?.html).not.toContain(UNAVAILABLE);
  });
});

describe("a link that cannot be had never stops the notice", () => {
  /** The once-per-cause line lives as long as its module, so each case reads a module graph of its own. */
  async function freshGraph() {
    vi.resetModules();
    return {
      harness: await import("./submit-contact-harness"),
      persistence: await import("@lemnaria/persistence"),
    };
  }

  type Graph = Awaited<ReturnType<typeof freshGraph>>;

  const CASES: readonly (readonly [
    string,
    (graph: Graph) => HarnessOptions,
    string,
  ])[] = [
    [
      "the origin is unset",
      () => ({ readPublicOrigin: () => readPublicOrigin({}) }),
      "origin-unset",
    ],
    [
      "the origin is not a usable one",
      () => ({
        readPublicOrigin: () =>
          readPublicOrigin({
            [PUBLIC_ORIGIN_VARIABLE]: "http://lemnaria.example",
          }),
      }),
      "origin-unset",
    ],
    [
      "the record fails",
      ({ persistence }) => ({
        views: viewsAnswering(() =>
          Promise.reject(
            new persistence.SentKitchenViewRepositoryError(
              "record a sent kitchen view",
            ),
          ),
        ),
      }),
      "record-failed",
    ],
    [
      "the hash names another request's view",
      () => ({ views: viewsAnswering(() => Promise.resolve("taken")) }),
      "record-failed",
    ],
    [
      "the record throws something of its own",
      () => ({
        views: viewsAnswering(() => Promise.reject(new Error(MARKER))),
      }),
      "unexpected",
    ],
  ];

  it.each(CASES)(
    "sends one notice without a link, answers 200 with the reference and marks it, when %s",
    async (_label, optionsOf, cause) => {
      const graph = await freshGraph();
      const harness = graph.harness.aHarness(optionsOf(graph));

      const answer = await harness.submit(graph.harness.bodyOf());

      const [held] = harness.store.heldSubmissions();
      expect(answer.status).toBe(200);
      expect(await jsonOf(answer)).toEqual({
        status: "sent",
        reference: held?.reference,
      });
      expect(harness.sender.sent).toHaveLength(1);
      expectNoKitchenLink(harness.sender.sent[0]);
      expect(held?.notifiedAt).toBeDefined();
      expect(consoleCallsOf(consoleSpies)).toEqual([
        [
          LINK_LABEL,
          JSON.stringify({ event: "sent-kitchen-link-unavailable", cause }),
        ],
      ]);
    },
  );

  it("waits for the record up to the deadline and no longer, then sends without a link and answers 200", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const graph = await freshGraph();
    let recordStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      recordStarted = resolve;
    });
    const harness = graph.harness.aHarness({
      views: viewsAnswering(() => {
        recordStarted();
        return new Promise<SentKitchenViewRecording>(() => undefined);
      }),
    });

    const pending = harness.submit(graph.harness.bodyOf());
    await started;
    await vi.advanceTimersByTimeAsync(KITCHEN_LINK_DEADLINE_MS - 1);
    expect(harness.sender.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.sender.sent).toHaveLength(1);

    const answer = await pending;
    expect(answer.status).toBe(200);
    expectNoKitchenLink(harness.sender.sent[0]);
    expect(harness.store.heldSubmissions()[0]?.notifiedAt).toBeDefined();
    expect(consoleCallsOf(consoleSpies)).toEqual([
      [
        LINK_LABEL,
        JSON.stringify({
          event: "sent-kitchen-link-unavailable",
          cause: "deadline",
        }),
      ],
    ]);
  });

  it("never puts in a notice the link of a view recorded after the deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const graph = await freshGraph();
    const harness = graph.harness.aHarness({
      views: (inner) => ({
        record: (view) =>
          new Promise<SentKitchenViewRecording>((resolve) => {
            setTimeout(() => {
              resolve(inner.record(view));
            }, KITCHEN_LINK_DEADLINE_MS + 1);
          }),
        load: (hash) => inner.load(hash),
      }),
    });

    const pending = harness.submit(graph.harness.bodyOf());
    await vi.advanceTimersByTimeAsync(KITCHEN_LINK_DEADLINE_MS + 10);
    const answer = await pending;

    expect(answer.status).toBe(200);
    expect(harness.views.heldViews()).toHaveLength(1);
    expectNoKitchenLink(harness.sender.sent[0]);
  });
});

describe("the notice is proved buildable in both forms before anything is stored", () => {
  function contentWhoseKitchenLeafThrows(leaf: "button" | "unavailable") {
    const kitchen = Object.defineProperty({ ...ro.leadNotice.kitchen }, leaf, {
      get: () => {
        throw new Error(MARKER);
      },
    });
    return { ...ro, leadNotice: { ...ro.leadNotice, kitchen } };
  }

  it.each(["button", "unavailable"] as const)(
    "answers unavailable and stores, records and sends nothing when the kitchen's %s leaf cannot be read",
    async (leaf) => {
      const harness = aHarness({
        noticeContent: contentWhoseKitchenLeafThrows(leaf),
      });

      const answer = await harness.submit(bodyOf());

      expect(answer.status).toBe(503);
      expect(harness.store.heldSubmissions()).toHaveLength(0);
      expect(harness.views.heldViews()).toHaveLength(0);
      expect(harness.sender.sent).toHaveLength(0);
    },
  );
});

describe("a retried request mints a link of its own for each attempt and none for an attempt that sends nothing", () => {
  it("records two views for a notice sent twice, each notice's token naming its own, both holding the one kitchen", async () => {
    const harness = aHarness({ outcomes: [NOT_SENT] });
    await harness.submit(bodyOf());

    const retried = await harness.submit(bodyOf());

    const tokens = harness.sender.sent.map(kitchenTokenOf);
    const views = harness.views.heldViews();
    expect(retried.status).toBe(200);
    expect(new Set(tokens).size).toBe(2);
    expect(views.map((view) => view.tokenHash)).toEqual(tokens.map(sha256Of));
    expect(new Set(views.map((view) => view.clientRequestId))).toEqual(
      new Set([REQUEST_ID]),
    );
    expect(new Set(views.map((view) => view.document)).size).toBe(1);
  });

  it("records no view for a repeat of a notified request, for a conflict, or for a stored request refused for its design", async () => {
    const notified = aHarness();
    await notified.submit(bodyOf());
    await notified.submit(bodyOf());
    await notified.submit(bodyOf({ locale: "ru" }));
    const refused = aHarness({ outcomes: [NOT_SENT] });
    await refused.submit(bodyOf());
    const retry = aHarness({
      store: () => refused.store,
      views: () => refused.views,
      loadOwned: () =>
        Promise.resolve({
          kind: "found",
          design: KITCHEN_L_DESIGN,
          revision: "2",
        }),
    });

    const answer = await retry.submit(bodyOf());

    expect(notified.views.heldViews()).toHaveLength(1);
    expect(answer.status).toBe(409);
    expect(refused.views.heldViews()).toHaveLength(1);
  });
});

describe("the notice is never priced again", () => {
  /** The same version, so a retry would not be refused as a conflict, and no cabinet priced. */
  const ANOTHER_BOOK: PriceBook = { ...SAMPLE_PRICE_BOOK, cabinetRules: [] };
  const TOKEN = /(?<=\/ro\/s\/)[0-9A-Za-z]{12}/g;
  /** Each harness's store draws its own reference, so it is set aside with the token. */
  const REFERENCE = /LM-[0-9A-Z]+/g;

  async function noticeWhenTheBookIsSwappedAfterTheRecord(
    isSwapped: boolean,
  ): Promise<string> {
    let isRecorded = false;
    const harness = aHarness({
      store: (inner) => ({
        lookUp: (request) => inner.lookUp(request),
        record: async (submission) => {
          const recording = await inner.record(submission);
          isRecorded = true;
          return recording;
        },
        markNotified: (id) => inner.markNotified(id),
      }),
    });
    const ports = {
      ...harness.ports,
      get book() {
        return isSwapped && isRecorded ? ANOTHER_BOOK : SAMPLE_PRICE_BOOK;
      },
    };

    const answer = await submitContact(
      { text: bodyOf(), visitorHash: undefined },
      ports,
    );

    expect(answer.status).toBe(200);
    return JSON.stringify(harness.sender.sent)
      .replace(TOKEN, "")
      .replace(REFERENCE, "");
  }

  it("sends the same notice whatever book the server holds between the record and the send", async () => {
    const control = await noticeWhenTheBookIsSwappedAfterTheRecord(false);

    const swapped = await noticeWhenTheBookIsSwappedAfterTheRecord(true);

    expect(swapped).toBe(control);
  });
});

describe("nothing of the link reaches the console", () => {
  /** Each path on a network block of its own, so no limit of new requests refuses one before it reaches its notice. */
  let networks = 0;
  function harnessOnNetwork(options: HarnessOptions): Harness {
    networks += 1;
    return aHarness({
      ...options,
      headers: new Headers({
        "x-forwarded-for": `198.51.${String(networks)}.7`,
      }),
    });
  }

  async function everyPath(): Promise<readonly Harness[]> {
    const harnesses = [
      harnessOnNetwork({}),
      harnessOnNetwork({}),
      harnessOnNetwork({ outcomes: [NOT_SENT] }),
      harnessOnNetwork({
        outcomes: [{ ok: false, kind: "refused", status: 422 }],
      }),
      harnessOnNetwork({ readPublicOrigin: () => readPublicOrigin({}) }),
      harnessOnNetwork({
        readPublicOrigin: () =>
          readPublicOrigin({ [PUBLIC_ORIGIN_VARIABLE]: `${PUBLIC_ORIGIN}/` }),
      }),
      harnessOnNetwork({
        views: viewsAnswering(() =>
          Promise.reject(
            new Error(
              `${MARKER} ${canonicalSerializeDesign(KITCHEN_L_DESIGN)}`,
            ),
          ),
        ),
      }),
      harnessOnNetwork({
        views: viewsAnswering(() => Promise.resolve("taken")),
      }),
      harnessOnNetwork({
        createSender: () => ({
          kind: "sender",
          sender: { send: () => Promise.reject(new Error(MARKER)) },
        }),
      }),
    ];
    const [plain, byEmail, retried, ...rest] = harnesses;
    await plain?.submit(bodyOf());
    await byEmail?.submit(bodyOf({ contact: BY_EMAIL }));
    await byEmail?.submit(
      callbackBodyOf({ clientRequestId: "req_cccccccccccccccc" }),
    );
    await retried?.submit(bodyOf());
    await retried?.submit(bodyOf());
    for (const harness of rest) await harness.submit(bodyOf());
    return harnesses;
  }

  it("holds no token, hash, origin, request id or document on any path, the failing ones included", async () => {
    const harnesses = await everyPath();

    const tokens = harnesses.flatMap((harness) =>
      harness.sender.sent.flatMap((message) =>
        [...(message.html ?? "").matchAll(/\/ro\/s\/([0-9A-Za-z]{12})/g)].map(
          (match) => match[1] ?? "",
        ),
      ),
    );
    const hashes = harnesses.flatMap((harness) =>
      harness.views.heldViews().map((view) => view.tokenHash),
    );
    const written = JSON.stringify(consoleCallsOf(consoleSpies));
    expect(tokens.length).toBeGreaterThanOrEqual(4);
    expect(hashes.length).toBeGreaterThanOrEqual(4);
    for (const secret of [...tokens, ...hashes]) {
      expect(written).not.toContain(secret);
    }
    for (const value of [
      "lemnaria.example",
      REQUEST_ID,
      MARKER,
      canonicalSerializeDesign(KITCHEN_L_DESIGN).slice(0, 40),
    ]) {
      expect(written).not.toContain(value);
    }
    expect(written).not.toMatch(/[0-9a-f]{64}/);
  });
});
