// @vitest-environment happy-dom
//
// M10 wave Q3c, adversarial QA of the notice hook and C1 banner. The implementer's DOM tests answer every request at once;
// these hold requests open, so "in flight" is a state a test can stand in, and they call the hook's `acknowledge` directly
// (the way the Q3d sheet and Q4 will), because the banner's absence is not the same as the callback refusing.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveContent, resolvePriceNoticeCopy } from "@/i18n/content";
import { PriceBookProvider } from "@/price/price-book-provider";
import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";
import { PriceNoticeBanner } from "@/price/price-notice-banner";
import { usePriceNotice } from "@/price/use-price-notice";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const DESIGN_ID = "abcdefghijklmnopqrstu";
const OTHER_DESIGN_ID = "ZYXWVUTSRQPONMLKJIHGF";
const SHARE_VIEW_SENTINEL = "shared-view";
const PAGE_ROOT: PriceBookRoot = {
  ...SAMPLE_PRICE_ROOT,
  availability: { revision: "5", disabled: [] },
};
const PAGE_PAIR = {
  versionId: SAMPLE_PRICE_ROOT.versionId,
  availabilityRevision: "5",
};
const RO = copyIn("ro", roMessages);
const RU = copyIn("ru", ruMessages as typeof roMessages);
const SHELF_NAME = "Raft de sticle";

function copyIn(locale: "ro" | "ru", messages: typeof roMessages) {
  const translate = createTranslator({ locale, messages });
  const rack = SAMPLE_PRICE_ROOT.book.accessories.dishDryingRack;
  return {
    copy: resolvePriceNoticeCopy(translate),
    rackLine: resolvePriceNoticeCopy(translate).accessoryRemoved(
      resolveContent(translate).bookText(rack.name, rack.nameKey),
    ),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// A server whose requests can be held open

interface Request {
  readonly method: string;
  readonly address: string;
  readonly body: unknown;
}

type Answer = { status: number; body?: unknown } | "network-failure";

interface HeldRequest {
  readonly request: Request;
  readonly release: (answer: Answer) => void;
}

let log: Request[];
let held: HeldRequest[];
let answerFor: (request: Request) => Answer | "hold";

function responseOf(answer: Answer): Promise<Response> {
  return answer === "network-failure"
    ? Promise.reject(new TypeError("offline"))
    : Promise.resolve(
        new Response(JSON.stringify(answer.body ?? {}), {
          status: answer.status,
        }),
      );
}

function installServer(decide: (request: Request) => Answer | "hold"): void {
  answerFor = decide;
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string, init?: RequestInit) => {
      const request: Request = {
        method: init?.method ?? "GET",
        address,
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      log.push(request);
      const answer = answerFor(request);
      if (answer !== "hold") return responseOf(answer);
      return new Promise<Response>((resolve, reject) => {
        held.push({
          request,
          release: (late) => {
            responseOf(late).then(resolve, reject);
          },
        });
      });
    }),
  );
}

function activeBody(overrides: Record<string, unknown> = {}): Answer {
  return {
    status: 200,
    body: {
      kind: "active-version",
      isSent: false,
      current: PAGE_PAIR,
      pricesChanged: true,
      replacementsRequired: [],
      removedAccessories: [],
      ...overrides,
    },
  };
}

const ACKNOWLEDGED: Answer = {
  status: 200,
  body: { acknowledged: PAGE_PAIR },
};

/** Notice answers as given; acknowledgements as given; both at once. */
function serve(
  notice: Answer | "hold",
  acknowledgement: Answer | "hold" = ACKNOWLEDGED,
) {
  installServer((request) =>
    request.method === "GET" ? notice : acknowledgement,
  );
}

function sent(method: string): Request[] {
  return log.filter((request) => request.method === method);
}

// ---------------------------------------------------------------------------------------------------------------------
// The screen under test: the hook, its banner, and a button that calls `acknowledge` whether or not C1 is drawn

function Harness({ isOwner }: { isOwner: boolean }): ReactElement {
  const notice = usePriceNotice({ isOwner });
  return createElement(
    "div",
    { "data-testid": "harness", "data-is-sent": String(notice.isSent) },
    createElement(PriceNoticeBanner, {
      banner: notice.banner,
      onAcknowledge: notice.acknowledge,
    }),
    createElement("button", {
      "data-testid": "direct-acknowledge",
      onClick: notice.acknowledge,
    }),
  );
}

interface View {
  isOwner: boolean;
  priceRoot: PriceBookRoot;
  locale: "ro" | "ru";
}

let container: HTMLDivElement | undefined;
let reactRoot: Root | undefined;
let view: View;

function draw(): void {
  reactRoot?.render(
    createElement(PriceBookProvider, {
      root: view.priceRoot,
      children: createElement(NextIntlClientProvider, {
        locale: view.locale,
        messages:
          view.locale === "ro" ? roMessages : (ruMessages as typeof roMessages),
        timeZone: "Europe/Chisinau",
        children: createElement(Harness, { isOwner: view.isOwner }),
      }),
    }),
  );
}

function mount(overrides: Partial<View> = {}): void {
  view = { isOwner: true, priceRoot: PAGE_ROOT, locale: "ro", ...overrides };
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
  act(draw);
}

function change(overrides: Partial<View>): void {
  view = { ...view, ...overrides };
  act(draw);
}

function unmount(): void {
  act(() => {
    reactRoot?.unmount();
  });
  container?.remove();
  reactRoot = undefined;
  container = undefined;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function mountAndSettle(overrides: Partial<View> = {}): Promise<void> {
  mount(overrides);
  await settle();
}

function el(selector: string): HTMLElement {
  const found = container?.querySelector<HTMLElement>(selector);
  if (found === null || found === undefined) {
    throw new Error(`nothing matches ${selector}`);
  }
  return found;
}

function maybeEl(selector: string): HTMLElement | null {
  return container?.querySelector<HTMLElement>(selector) ?? null;
}

function text(): string {
  return container?.textContent ?? "";
}

function isSentRead(): string | undefined {
  return el('[data-testid="harness"]').dataset.isSent;
}

function accessoryLines(): string[] {
  const lines = container?.querySelectorAll(
    '[data-testid="price-notice-accessory"]',
  );
  return Array.from(lines ?? []).map((line) => line.textContent);
}

const isNoticeShown = (): boolean =>
  maybeEl('[data-testid="price-notice"]') !== null;

async function press(
  testId: "price-notice-acknowledge" | "direct-acknowledge",
) {
  act(() => {
    el(`[data-testid="${testId}"]`).click();
  });
  await settle();
}

function firstHeld(): HeldRequest {
  const first = held[0];
  if (first === undefined) throw new Error("no request is being held");
  return first;
}

async function release(held_: HeldRequest, answer: Answer): Promise<void> {
  held_.release(answer);
  await settle();
}

function setStore(
  designId: string | null,
  canWrite: boolean | "checking" | "check-failed",
): void {
  act(() => {
    useConfiguratorStore.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: DESIGN_ID,
      revision: "1",
      canWrite: true,
    });
    useConfiguratorStore.setState({ designId, canWrite });
  });
}

beforeEach(() => {
  log = [];
  held = [];
  setStore(DESIGN_ID, true);
});

afterEach(() => {
  if (container !== undefined) unmount();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------------------------------

describe("gating: the GET is not made for anything but a saved design of the owner's, writable, under a book", () => {
  it.each([
    ["the share view's sentinel", SHARE_VIEW_SENTINEL],
    ["a legacy-looking short id", "qa-design"],
    ["an empty id", ""],
    ["twenty characters", "abcdefghijklmnopqrst"],
    ["twenty-two characters", "abcdefghijklmnopqrstuv"],
    ["a path traversal of the right length", "../../../../etc/passwd"],
    ["a 21-character id with a slash", "abcdefghij/lmnopqrstu"],
    ["a 21-character id with a query", "abcdefghij?lmnopqrstu"],
    ["a 21-character id with a hash", "abcdefghij#lmnopqrstu"],
    ["a 21-character id with a percent", "abcdefghij%2Fmnopqrstu"],
    ["a 21-character id with a space", "abcdefghij lmnopqrstu"],
    ["a 21-character id with a newline", "abcdefghij\nmnopqrstu"],
    ["a 21-character id with a dot", "abcdefghij.lmnopqrstu"],
    [
      "a 21-character id of letters that look like Latin",
      "abcdefghijklmnopqrstу",
    ],
    ["a 21-character id with a trailing newline", "abcdefghijklmnopqrst\n"],
  ])(
    "makes no GET for %s, though the store says it may write",
    async (_name, id) => {
      setStore(id, true);
      serve(activeBody());

      await mountAndSettle();

      expect(log).toEqual([]);
      expect(isNoticeShown()).toBe(false);
    },
  );

  it.each(["checking", "check-failed", false] as const)(
    "makes no GET while canWrite is %s, even for a real id, and shows nothing",
    async (canWrite) => {
      setStore(DESIGN_ID, canWrite);
      serve(activeBody());

      await mountAndSettle();

      expect(log).toEqual([]);
      expect(isNoticeShown()).toBe(false);
    },
  );

  it("makes no GET with no active root, and none when the page supplies none and the store is otherwise ready", async () => {
    serve(activeBody());

    await mountAndSettle({ priceRoot: NO_PRICE_BOOK });

    expect(log).toEqual([]);
  });

  it("makes no GET for a non-owner screen, whatever else holds", async () => {
    serve(activeBody());

    await mountAndSettle({ isOwner: false });

    expect(log).toEqual([]);
  });

  it("makes one GET once the id appears after a render without one", async () => {
    setStore(null, true);
    serve(activeBody());
    await mountAndSettle();
    expect(log).toEqual([]);

    setStore(DESIGN_ID, true);
    await settle();

    expect(sent("GET")).toHaveLength(1);
  });

  it("makes one GET once a book appears after a render without one, and not again when the book changes", async () => {
    serve(activeBody());
    await mountAndSettle({ priceRoot: NO_PRICE_BOOK });
    expect(log).toEqual([]);

    change({ priceRoot: PAGE_ROOT });
    await settle();
    change({ priceRoot: { ...PAGE_ROOT, versionId: "later" } });
    await settle();

    expect(sent("GET")).toHaveLength(1);
  });

  it("makes one GET once the owner flag turns true", async () => {
    serve(activeBody());
    await mountAndSettle({ isOwner: false });

    change({ isOwner: true });
    await settle();

    expect(sent("GET")).toHaveLength(1);
  });

  it.each([
    ["an unavailable answer", { status: 503, body: { status: "unavailable" } }],
    ["a network failure", "network-failure"],
    ["a malformed 200", { status: 200, body: { kind: "other" } }],
  ] as const)(
    "does not ask again after %s, however the store or the book moves afterwards",
    async (_name, answer) => {
      serve(answer);
      await mountAndSettle();

      setStore(DESIGN_ID, "checking");
      setStore(DESIGN_ID, true);
      change({ priceRoot: { ...PAGE_ROOT, versionId: "later" } });
      change({ priceRoot: PAGE_ROOT });
      await settle();

      expect(sent("GET")).toHaveLength(1);
      expect(sent("POST")).toEqual([]);
    },
  );

  it("asks about the second design when the store moves to one, once", async () => {
    serve(activeBody());
    await mountAndSettle();

    setStore(OTHER_DESIGN_ID, true);
    await settle();

    expect(sent("GET").map(({ address }) => address)).toEqual([
      `/api/designs/${DESIGN_ID}/price-notice`,
      `/api/designs/${OTHER_DESIGN_ID}/price-notice`,
    ]);
  });
});

describe("a stale page: the answer names a pair the page does not display", () => {
  const STALE_CURRENTS: readonly [string, Record<string, string>][] = [
    ["a later availability head", { ...PAGE_PAIR, availabilityRevision: "6" }],
    [
      "an earlier availability head",
      { ...PAGE_PAIR, availabilityRevision: "4" },
    ],
    ["a far later head", { ...PAGE_PAIR, availabilityRevision: "50" }],
    ["revision 0", { ...PAGE_PAIR, availabilityRevision: "0" }],
    ["another version", { ...PAGE_PAIR, versionId: "published-after-load" }],
    [
      "the version in another case",
      { ...PAGE_PAIR, versionId: PAGE_PAIR.versionId.toUpperCase() },
    ],
    [
      "the version with a trailing space",
      { ...PAGE_PAIR, versionId: `${PAGE_PAIR.versionId} ` },
    ],
    [
      "the pair swapped between its members",
      {
        versionId: PAGE_PAIR.availabilityRevision,
        availabilityRevision: PAGE_PAIR.versionId,
      },
    ],
  ];

  it.each(STALE_CURRENTS)(
    "shows no C1 and posts nothing when the answer names %s, with prices changed and an accessory removed",
    async (_name, current) => {
      serve(
        activeBody({
          current,
          removedAccessories: [{ accessoryId: "dishDryingRack" }],
        }),
      );

      await mountAndSettle();

      expect(isNoticeShown()).toBe(false);
      expect(sent("POST")).toEqual([]);
    },
  );

  it("shows C1 for the page's own pair (the sweep is not vacuous)", async () => {
    serve(activeBody());

    await mountAndSettle();

    expect(isNoticeShown()).toBe(true);
  });

  it("drops C1 when the page's own pair moves on after the answer", async () => {
    serve(activeBody());
    await mountAndSettle();
    expect(isNoticeShown()).toBe(true);

    change({
      priceRoot: {
        ...PAGE_ROOT,
        availability: { revision: "6", disabled: [] },
      },
    });

    expect(isNoticeShown()).toBe(false);
    expect(sent("POST")).toEqual([]);
  });

  it("still tells isSent, which is the design's and not the pair's", async () => {
    serve(
      activeBody({
        isSent: true,
        current: { ...PAGE_PAIR, availabilityRevision: "6" },
      }),
    );

    await mountAndSettle();

    expect(isSentRead()).toBe("true");
  });

  // The hook's `acknowledge` is a public callback: the Q3d sheet and anything after it calls it without the banner. Its
  // contract (use-price-notice.ts: "Records the pair this page displayed") and the plan (a stale page "acknowledges
  // nothing on that view") are both its own to keep, and today only the banner's absence keeps them.
  it("posts nothing when acknowledge is called directly on a stale answer", async () => {
    serve(activeBody({ current: { ...PAGE_PAIR, availabilityRevision: "6" } }));
    await mountAndSettle();

    await press("direct-acknowledge");

    expect(sent("POST")).toEqual([]);
  });

  it("posts, if it posts at all on a stale answer, the page's displayed pair and never the answer's current", async () => {
    const answersCurrent = { ...PAGE_PAIR, availabilityRevision: "6" };
    serve(activeBody({ current: answersCurrent }));
    await mountAndSettle();

    await press("direct-acknowledge");

    for (const post of sent("POST")) {
      expect(post.body).toEqual(PAGE_PAIR);
      expect(post.body).not.toEqual(answersCurrent);
    }
  });

  it("posts nothing when acknowledge is called directly on the no-active-version arm", async () => {
    serve({ status: 200, body: { kind: "no-active-version", isSent: false } });
    await mountAndSettle();

    await press("direct-acknowledge");

    expect(sent("POST")).toEqual([]);
  });

  it("posts nothing when acknowledge is called directly before the GET has answered", async () => {
    serve("hold");
    await mountAndSettle();

    await press("direct-acknowledge");

    expect(sent("POST")).toEqual([]);
  });

  it.each([
    ["a 503", { status: 503, body: { status: "unavailable" } }],
    ["a network failure", "network-failure"],
    ["a malformed 200", { status: 200, body: {} }],
  ] as const)(
    "posts nothing when acknowledge is called directly after %s",
    async (_name, answer) => {
      serve(answer);
      await mountAndSettle();

      await press("direct-acknowledge");

      expect(sent("POST")).toEqual([]);
    },
  );
});

describe("the press: one acknowledgement in flight at a time, and a record that survives only what it should", () => {
  it("sends one POST for any number of presses while it is in flight, and none after it landed", async () => {
    serve(activeBody(), "hold");
    await mountAndSettle();

    await press("price-notice-acknowledge");
    await press("price-notice-acknowledge");
    await press("direct-acknowledge");
    expect(sent("POST")).toHaveLength(1);

    await release(firstHeld(), ACKNOWLEDGED);
    expect(isNoticeShown()).toBe(false);
    await press("direct-acknowledge");
    await press("direct-acknowledge");

    expect(sent("POST")).toHaveLength(1);
  });

  it("keeps the notice on screen while the POST is in flight", async () => {
    serve(activeBody(), "hold");
    await mountAndSettle();

    await press("price-notice-acknowledge");

    expect(isNoticeShown()).toBe(true);
  });

  it.each([
    ["a 500", { status: 500, body: { status: "unexpected" } }],
    ["a 503", { status: 503, body: { status: "unavailable" } }],
    ["a 429", { status: 429, body: { status: "busy" } }],
    ["a network failure", "network-failure"],
    [
      "a 400 that is not the route's own word",
      { status: 400, body: { status: "invalid-input" } },
    ],
    ["a 200 that acknowledges nothing", { status: 200, body: {} }],
  ] as const)(
    "after %s keeps the notice and lets a later press try again",
    async (_name, failure) => {
      serve(activeBody(), "hold");
      await mountAndSettle();

      await press("price-notice-acknowledge");
      await release(firstHeld(), failure);
      expect(isNoticeShown()).toBe(true);
      await press("price-notice-acknowledge");

      expect(sent("POST")).toHaveLength(2);
    },
  );

  it("sends three POSTs over fail, fail, success, then hides the notice and sends no fourth", async () => {
    const outcomes: Answer[] = [
      { status: 500, body: {} },
      "network-failure",
      ACKNOWLEDGED,
    ];
    installServer((request) =>
      request.method === "GET"
        ? activeBody()
        : (outcomes.shift() ?? ACKNOWLEDGED),
    );
    await mountAndSettle();

    await press("price-notice-acknowledge");
    await press("price-notice-acknowledge");
    await press("price-notice-acknowledge");
    expect(isNoticeShown()).toBe(false);
    await press("direct-acknowledge");

    expect(sent("POST")).toHaveLength(3);
  });

  it.each(["unknown-version", "revision-ahead"])(
    "after a 400 %s keeps the notice and sends no second POST however often it is pressed",
    async (word) => {
      serve(activeBody(), { status: 400, body: { status: word } });
      await mountAndSettle();

      for (let presses = 0; presses < 5; presses += 1) {
        await press("price-notice-acknowledge");
        await press("direct-acknowledge");
      }

      expect(sent("POST")).toHaveLength(1);
      expect(isNoticeShown()).toBe(true);
      expect(sent("GET")).toHaveLength(1);
    },
  );

  it("posts the displayed pair to the displayed design's route, as exactly two members", async () => {
    serve(activeBody());
    await mountAndSettle();

    await press("price-notice-acknowledge");

    expect(sent("POST")).toEqual([
      {
        method: "POST",
        address: `/api/designs/${DESIGN_ID}/price-notice/acknowledge`,
        body: PAGE_PAIR,
      },
    ]);
  });

  it("lets the second design be acknowledged after the first was", async () => {
    serve(activeBody());
    await mountAndSettle();
    await press("price-notice-acknowledge");

    setStore(OTHER_DESIGN_ID, true);
    await settle();
    expect(isNoticeShown()).toBe(true);
    await press("price-notice-acknowledge");

    expect(sent("POST").map(({ address }) => address)).toEqual([
      `/api/designs/${DESIGN_ID}/price-notice/acknowledge`,
      `/api/designs/${OTHER_DESIGN_ID}/price-notice/acknowledge`,
    ]);
  });

  it("does not let the first design's late acknowledgement hide the second design's notice", async () => {
    serve(activeBody(), "hold");
    await mountAndSettle();
    await press("price-notice-acknowledge");
    const firstPost = firstHeld();

    setStore(OTHER_DESIGN_ID, true);
    await settle();
    await release(firstPost, ACKNOWLEDGED);

    expect(isNoticeShown()).toBe(true);
  });

  it("does not hand the first design's isSent to the second while its answer is awaited", async () => {
    installServer((request) =>
      request.address.includes(OTHER_DESIGN_ID)
        ? "hold"
        : activeBody({ isSent: true }),
    );
    await mountAndSettle();
    expect(isSentRead()).toBe("true");

    setStore(OTHER_DESIGN_ID, true);
    await settle();

    expect(isSentRead()).toBe("false");
    expect(isNoticeShown()).toBe(false);
  });

  it("shows nothing for a design with no id after the store drops it", async () => {
    serve(activeBody());
    await mountAndSettle();

    setStore(null, true);

    expect(isNoticeShown()).toBe(false);
    expect(isSentRead()).toBe("false");
  });
});

describe("unmounting and remounting", () => {
  it("does nothing when the GET answers after the screen is gone", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    serve("hold");
    await mountAndSettle();
    unmount();

    await release(firstHeld(), activeBody());

    expect(errors).not.toHaveBeenCalled();
    expect(sent("POST")).toEqual([]);
    expect(sent("GET")).toHaveLength(1);
  });

  it("does nothing when the POST answers after the screen is gone", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    serve(activeBody(), "hold");
    await mountAndSettle();
    await press("price-notice-acknowledge");
    unmount();

    await release(firstHeld(), ACKNOWLEDGED);

    expect(errors).not.toHaveBeenCalled();
    expect(sent("POST")).toHaveLength(1);
    expect(sent("GET")).toHaveLength(1);
  });

  it("does nothing when a failed POST answers after the screen is gone: no retry from a dead screen", async () => {
    serve(activeBody(), "hold");
    await mountAndSettle();
    await press("price-notice-acknowledge");
    unmount();

    await release(firstHeld(), { status: 500, body: {} });

    expect(sent("POST")).toHaveLength(1);
  });

  it("gives a remounted screen its own question, and the dead screen's late answer never reaches it", async () => {
    installServer((request) => {
      if (request.method !== "GET") return ACKNOWLEDGED;
      return log.filter((r) => r.method === "GET").length === 1
        ? "hold"
        : activeBody({ pricesChanged: false });
    });
    await mountAndSettle();
    const firstGet = firstHeld();
    unmount();

    await mountAndSettle();
    expect(isNoticeShown()).toBe(false);
    await release(firstGet, activeBody({ pricesChanged: true }));

    expect(sent("GET")).toHaveLength(2);
    expect(isNoticeShown()).toBe(false);
    expect(sent("POST")).toEqual([]);
  });

  it("asks again after a remount that follows an acknowledgement: what is still owed is the server's to say", async () => {
    serve(activeBody());
    await mountAndSettle();
    await press("price-notice-acknowledge");
    unmount();

    await mountAndSettle();

    expect(sent("GET")).toHaveLength(2);
    expect(sent("POST")).toHaveLength(1);
  });

  it("re-reads the words in the new language without a second GET when only the locale changes", async () => {
    serve(
      activeBody({ removedAccessories: [{ accessoryId: "dishDryingRack" }] }),
    );
    await mountAndSettle();
    expect(text()).toContain(RO.copy.body);
    expect(accessoryLines()).toEqual([RO.rackLine]);

    change({ locale: "ru" });

    expect(text()).toContain(RU.copy.body);
    expect(text()).toContain(RU.copy.acknowledge);
    expect(accessoryLines()).toEqual([RU.rackLine]);
    expect(sent("GET")).toHaveLength(1);
  });

  it("speaks the new language after a full remount, with a new GET and no leftover of the first mount", async () => {
    serve(activeBody());
    await mountAndSettle();
    unmount();

    await mountAndSettle({ locale: "ru" });

    expect(text()).toContain(RU.copy.body);
    expect(text()).not.toContain(RO.copy.body);
    expect(sent("GET")).toHaveLength(2);
  });
});

describe("naming a removed accessory: a line says a name, never an id", () => {
  async function showing(
    removedAccessories: readonly Record<string, unknown>[],
    overrides: Record<string, unknown> = {},
  ): Promise<void> {
    serve(activeBody({ removedAccessories, ...overrides }));
    await mountAndSettle();
  }

  it("shows the prices sentence alone for a nameless linked accessory beside a price change, and its id nowhere", async () => {
    await showing([{ accessoryId: "accessory.nameless-7f3a" }]);

    expect(isNoticeShown()).toBe(true);
    expect(text()).toContain(RO.copy.body);
    expect(accessoryLines()).toEqual([]);
    expect(text()).not.toContain("nameless-7f3a");
  });

  it("shows nothing for a nameless linked accessory when the prices did not move", async () => {
    await showing([{ accessoryId: "accessory.nameless-7f3a" }], {
      pricesChanged: false,
    });

    expect(isNoticeShown()).toBe(false);
    expect(text()).not.toContain("nameless-7f3a");
  });

  it("shows only the named one among a named and a nameless", async () => {
    await showing(
      [
        { accessoryId: "accessory.nameless" },
        { accessoryId: "accessory.shelf", authoredName: SHELF_NAME },
      ],
      { pricesChanged: false },
    );

    expect(accessoryLines()).toEqual([RO.copy.accessoryRemoved(SHELF_NAME)]);
    expect(text()).not.toContain("accessory.nameless");
  });

  it.each([
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "valueOf",
    "DishDryingRack",
    "dishDryingRack ",
  ])(
    "treats the id %j as a linked accessory: no name, no line, no id, no throw",
    async (accessoryId) => {
      await showing([{ accessoryId }], { pricesChanged: false });

      expect(isNoticeShown()).toBe(false);
      expect(text()).not.toContain(accessoryId);
    },
  );

  it("names a built-in from the book's own row, ignoring an authored name the wire should not carry", async () => {
    await showing(
      [{ accessoryId: "dishDryingRack", authoredName: "Smuggled name" }],
      { pricesChanged: false },
    );

    expect(accessoryLines()).toEqual([RO.rackLine]);
    expect(text()).not.toContain("Smuggled name");
  });

  it("names the sink cover from the book's message too", async () => {
    await showing([{ accessoryId: "sinkProtectiveCover" }], {
      pricesChanged: false,
    });

    const cover = SAMPLE_PRICE_ROOT.book.accessories.sinkProtectiveCover;
    const translate = createTranslator({ locale: "ro", messages: roMessages });
    expect(accessoryLines()).toEqual([
      RO.copy.accessoryRemoved(
        resolveContent(translate).bookText(cover.name, cover.nameKey),
      ),
    ]);
  });

  it("says a name once when two accessories read alike, and keeps the wire's order otherwise", async () => {
    await showing(
      [
        { accessoryId: "accessory.b", authoredName: "Beta" },
        { accessoryId: "accessory.a", authoredName: "Alfa" },
        { accessoryId: "accessory.b2", authoredName: "Beta" },
      ],
      { pricesChanged: false },
    );

    expect(accessoryLines()).toEqual([
      RO.copy.accessoryRemoved("Beta"),
      RO.copy.accessoryRemoved("Alfa"),
    ]);
  });

  it.each(["", " ", "   ", "\n\t"])(
    "draws no blank line for an authored name of %j",
    async (authoredName) => {
      await showing([{ accessoryId: "accessory.blank", authoredName }], {
        pricesChanged: false,
      });

      expect(accessoryLines().filter((line) => line.trim() === "")).toEqual([]);
      expect(isNoticeShown()).toBe(false);
    },
  );

  it("draws markup in an authored name as text", async () => {
    const markup = '<img src=x onerror="document.title=1"><b>bold</b>';
    await showing([{ accessoryId: "accessory.x", authoredName: markup }], {
      pricesChanged: false,
    });

    expect(maybeEl("img")).toBe(null);
    expect(maybeEl("b")).toBe(null);
    expect(accessoryLines()).toEqual([RO.copy.accessoryRemoved(markup)]);
  });

  it("draws a 20 000 character name without failing", async () => {
    const long = "Raft ".repeat(4_000);
    await showing([{ accessoryId: "accessory.long", authoredName: long }], {
      pricesChanged: false,
    });

    expect(accessoryLines()).toEqual([RO.copy.accessoryRemoved(long)]);
  });

  it("acknowledging hides every line at once", async () => {
    await showing([
      { accessoryId: "dishDryingRack" },
      { accessoryId: "accessory.shelf", authoredName: SHELF_NAME },
    ]);

    await press("price-notice-acknowledge");

    expect(accessoryLines()).toEqual([]);
    expect(isNoticeShown()).toBe(false);
  });

  it("shows nothing beside a pending replacement, however many accessories were removed", async () => {
    await showing([{ accessoryId: "dishDryingRack" }], {
      replacementsRequired: [
        {
          item: { kind: "material", tierId: "gone" },
          remaining: [{ kind: "material", tierId: "melamine" }],
        },
      ],
    });

    expect(isNoticeShown()).toBe(false);
    expect(sent("POST")).toEqual([]);
  });
});
