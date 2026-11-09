// @vitest-environment happy-dom
//
// M10 wave Q3c: the customer's price notice. The hook is mounted beside the banner it feeds, over a stubbed `fetch` that
// counts every request, so "no GET" and "no POST" are observed and not inferred.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveContent, resolvePriceNoticeCopy } from "@/i18n/content";
import { NO_PRICE_BOOK } from "@/price/price-book-root";
import { PriceNoticeBanner } from "@/price/price-notice-banner";
import { usePriceNotice } from "@/price/use-price-notice";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const DESIGN_ID = "abcdefghijklmnopqrstu";
const SHARE_VIEW_ID = "shared-view";
const PAGE_PAIR = {
  versionId: SAMPLE_PRICE_ROOT.versionId,
  availabilityRevision: SAMPLE_PRICE_ROOT.availability.revision,
};
const TRANSLATE = createTranslator({ locale: "ro", messages: roMessages });
const COPY = resolvePriceNoticeCopy(TRANSLATE);
const PRICES_SENTENCE = COPY.body;
const UNDERSTOOD = COPY.acknowledge;
const DISH_RACK_RULE = SAMPLE_PRICE_ROOT.book.accessories.dishDryingRack;
const DISH_RACK_LINE = COPY.accessoryRemoved(
  resolveContent(TRANSLATE).bookText(
    DISH_RACK_RULE.name,
    DISH_RACK_RULE.nameKey,
  ),
);
const SHELF_NAME = "Raft de sticle";

interface SentRequest {
  readonly method: string;
  readonly address: string;
  readonly body: unknown;
}

let sent: SentRequest[];
let screen: MountedScreen | undefined;

type Answer = { status: number; body?: unknown } | "network-failure";

/** Answers the `GET` and the `POST` as told, and records every request either way. */
function serverAnswers({
  notice,
  acknowledgement = { status: 200, body: { acknowledged: PAGE_PAIR } },
}: {
  notice: Answer;
  acknowledgement?: Answer;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      sent.push({
        method,
        address,
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const answer = method === "GET" ? notice : acknowledgement;
      if (answer === "network-failure") {
        return Promise.reject(new TypeError("offline"));
      }
      return Promise.resolve(
        new Response(JSON.stringify(answer.body ?? {}), {
          status: answer.status,
        }),
      );
    }),
  );
}

function activeNotice(overrides: Record<string, unknown> = {}): Answer {
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

function requestsOf(method: string): SentRequest[] {
  return sent.filter((request) => request.method === method);
}

/** The hook and the banner as the editor wires them, with the hook's `isSent` readable from the DOM. */
function Harness({ isOwner = true }: { isOwner?: boolean }): ReactElement {
  const notice = usePriceNotice({ isOwner });
  return createElement(
    "div",
    { "data-testid": "harness", "data-is-sent": String(notice.isSent) },
    createElement(PriceNoticeBanner, {
      banner: notice.banner,
      onAcknowledge: notice.acknowledge,
    }),
  );
}

function mount(
  options: {
    isOwner?: boolean;
    priceBook?: typeof NO_PRICE_BOOK | typeof SAMPLE_PRICE_ROOT;
    strict?: boolean;
  } = {},
): MountedScreen {
  const harness = createElement(Harness, { isOwner: options.isOwner ?? true });
  screen = mountInCatalogue(
    options.strict === true
      ? createElement(StrictMode, null, harness)
      : harness,
    "ro",
    options.priceBook ?? SAMPLE_PRICE_ROOT,
  );
  return screen;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function mountAndSettle(
  options: Parameters<typeof mount>[0] = {},
): Promise<MountedScreen> {
  const mounted = mount(options);
  await settle();
  return mounted;
}

function hydrateWith(
  designId: string | null,
  canWrite: boolean | "checking" | "check-failed",
): void {
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: designId ?? DESIGN_ID,
    revision: "1",
    canWrite: canWrite as boolean,
  });
  // The store takes the two named states and a design never saved only by being told after the hydration.
  useConfiguratorStore.setState({ canWrite, designId });
}

function notice(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-testid="price-notice"]');
}

async function pressUnderstood(container: HTMLElement): Promise<void> {
  const button = requireIn<HTMLButtonElement>(
    container,
    '[data-testid="price-notice-acknowledge"]',
  );
  act(() => {
    button.click();
  });
  await settle();
}

beforeEach(() => {
  sent = [];
  hydrateWith(DESIGN_ID, true);
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("when the notice is asked for", () => {
  it("asks the design's route once when the owner can write", async () => {
    serverAnswers({ notice: activeNotice() });

    await mountAndSettle();

    expect(requestsOf("GET").map(({ address }) => address)).toEqual([
      `/api/designs/${DESIGN_ID}/price-notice`,
    ]);
  });

  it.each([
    ["write access is still being checked", DESIGN_ID, "checking"],
    ["the write-access check failed", DESIGN_ID, "check-failed"],
    ["the browser cannot write", DESIGN_ID, false],
    ["the share view's sentinel id", SHARE_VIEW_ID, true],
    ["a design never saved, with no id", null, true],
  ] as const)("sends no GET when %s", async (_name, designId, canWrite) => {
    hydrateWith(designId, canWrite);
    serverAnswers({ notice: activeNotice() });

    await mountAndSettle();

    expect(sent).toEqual([]);
    expect(notice(screen?.container as HTMLElement)).toBe(null);
  });

  it("sends no GET on the shared variant, whatever the store says", async () => {
    serverAnswers({ notice: activeNotice() });

    await mountAndSettle({ isOwner: false });

    expect(sent).toEqual([]);
  });

  it("sends no GET with no active price book", async () => {
    serverAnswers({ notice: activeNotice() });

    await mountAndSettle({ priceBook: NO_PRICE_BOOK });

    expect(sent).toEqual([]);
  });

  it("sends one GET when write access settles after the first render", async () => {
    hydrateWith(DESIGN_ID, "checking");
    serverAnswers({ notice: activeNotice() });
    await mountAndSettle();
    expect(sent).toEqual([]);

    act(() => {
      useConfiguratorStore.setState({ canWrite: true });
    });
    await settle();
    act(() => {
      useConfiguratorStore.setState({ canWrite: "checking" });
    });
    act(() => {
      useConfiguratorStore.setState({ canWrite: true });
    });
    await settle();

    expect(requestsOf("GET")).toHaveLength(1);
  });

  it("sends one GET under strict mode's double effect", async () => {
    serverAnswers({ notice: activeNotice() });

    await mountAndSettle({ strict: true });

    expect(requestsOf("GET")).toHaveLength(1);
  });
});

describe("an answer that is not a notice shows nothing and writes nothing", () => {
  it.each([
    ["404", { status: 404, body: { status: "not-found" } }],
    ["429", { status: 429, body: { status: "busy" } }],
    ["500", { status: 500, body: { status: "unexpected" } }],
    ["503", { status: 503, body: { status: "unavailable" } }],
    ["a network failure", "network-failure"],
  ] as const)("%s", async (_name, answer) => {
    serverAnswers({ notice: answer });

    const mounted = await mountAndSettle();

    expect(notice(mounted.container)).toBe(null);
    expect(requestsOf("POST")).toEqual([]);
    expect(
      requireIn(mounted.container, '[data-testid="harness"]').dataset.isSent,
    ).toBe("false");
  });
});

describe("C1 standalone", () => {
  it("shows the prices sentence and a button, with no accessory line", async () => {
    serverAnswers({ notice: activeNotice() });

    const mounted = await mountAndSettle();

    expect(notice(mounted.container)?.textContent).toContain(PRICES_SENTENCE);
    expect(notice(mounted.container)?.textContent).toContain(UNDERSTOOD);
    expect(
      allIn(mounted.container, '[data-testid="price-notice-accessory"]'),
    ).toEqual([]);
  });

  it("posts the displayed pair once and hides the notice", async () => {
    serverAnswers({ notice: activeNotice() });
    const mounted = await mountAndSettle();

    await pressUnderstood(mounted.container);

    expect(requestsOf("POST")).toEqual([
      {
        method: "POST",
        address: `/api/designs/${DESIGN_ID}/price-notice/acknowledge`,
        body: PAGE_PAIR,
      },
    ]);
    expect(notice(mounted.container)).toBe(null);
  });

  it("shows nothing when the prices did not change and nothing was removed", async () => {
    serverAnswers({ notice: activeNotice({ pricesChanged: false }) });

    const mounted = await mountAndSettle();

    expect(notice(mounted.container)).toBe(null);
  });

  it("is not shown beside a sheet: a replacement required hides it", async () => {
    serverAnswers({
      notice: activeNotice({
        replacementsRequired: [
          {
            item: { kind: "material", tierId: "gone" },
            remaining: [{ kind: "material", tierId: "melamine" }],
          },
        ],
      }),
    });

    const mounted = await mountAndSettle();

    expect(notice(mounted.container)).toBe(null);
    expect(requestsOf("POST")).toEqual([]);
  });
});

describe("removed accessories with no replacement (OQ-42)", () => {
  it("shows the info line and acknowledges when the prices did not move", async () => {
    serverAnswers({
      notice: activeNotice({
        pricesChanged: false,
        removedAccessories: [{ accessoryId: "dishDryingRack" }],
      }),
    });

    const mounted = await mountAndSettle();

    const lines = allIn(
      mounted.container,
      '[data-testid="price-notice-accessory"]',
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toBe(DISH_RACK_LINE);
    expect(lines[0]?.textContent).not.toContain("dishDryingRack");
    expect(notice(mounted.container)?.textContent).not.toContain(
      PRICES_SENTENCE,
    );

    await pressUnderstood(mounted.container);

    expect(requestsOf("POST")).toHaveLength(1);
  });

  it("names a linked accessory by its authored name and says the prices sentence too", async () => {
    serverAnswers({
      notice: activeNotice({
        removedAccessories: [
          { accessoryId: "accessory.shelf", authoredName: SHELF_NAME },
        ],
      }),
    });

    const mounted = await mountAndSettle();

    expect(notice(mounted.container)?.textContent).toContain(PRICES_SENTENCE);
    expect(notice(mounted.container)?.textContent).toContain(
      COPY.accessoryRemoved(SHELF_NAME),
    );
  });

  it("never shows an accessory by its id: with no name and nothing else to say, nothing shows", async () => {
    serverAnswers({
      notice: activeNotice({
        pricesChanged: false,
        removedAccessories: [{ accessoryId: "accessory.nameless" }],
      }),
    });

    const mounted = await mountAndSettle();

    expect(notice(mounted.container)).toBe(null);
    expect(mounted.container.textContent).not.toContain("accessory.nameless");
  });
});

describe("a stale page", () => {
  it.each([
    ["a newer version", { ...PAGE_PAIR, versionId: "published-after-load" }],
    ["a newer availability head", { ...PAGE_PAIR, availabilityRevision: "9" }],
  ])(
    "shows no C1 and sends no POST when the answer names %s",
    async (_name, current) => {
      serverAnswers({ notice: activeNotice({ current }) });

      const mounted = await mountAndSettle();

      expect(notice(mounted.container)).toBe(null);
      expect(requestsOf("POST")).toEqual([]);
    },
  );
});

describe("a refused acknowledgement", () => {
  it.each(["unknown-version", "revision-ahead"])(
    "a 400 %s ends the notice for this view and sends no second POST",
    async (word) => {
      serverAnswers({
        notice: activeNotice(),
        acknowledgement: { status: 400, body: { status: word } },
      });
      const mounted = await mountAndSettle();

      await pressUnderstood(mounted.container);
      act(() => {
        mounted.container
          .querySelector<HTMLButtonElement>(
            '[data-testid="price-notice-acknowledge"]',
          )
          ?.click();
      });
      await settle();

      expect(requestsOf("POST")).toHaveLength(1);
      expect(requestsOf("GET")).toHaveLength(1);
      expect(notice(mounted.container)).toBe(null);
    },
  );

  it("two quick presses send one POST", async () => {
    serverAnswers({ notice: activeNotice() });
    const mounted = await mountAndSettle();
    const button = requireIn<HTMLButtonElement>(
      mounted.container,
      '[data-testid="price-notice-acknowledge"]',
    );

    act(() => {
      button.click();
      button.click();
    });
    await settle();

    expect(requestsOf("POST")).toHaveLength(1);
  });

  it("a failed POST is not retried", async () => {
    serverAnswers({
      notice: activeNotice(),
      acknowledgement: "network-failure",
    });
    const mounted = await mountAndSettle();

    await pressUnderstood(mounted.container);
    await settle();

    expect(requestsOf("POST")).toHaveLength(1);
    expect(requestsOf("GET")).toHaveLength(1);
  });
});

describe("isSent, for the note that follows", () => {
  it.each([
    ["the active arm", activeNotice({ isSent: true, pricesChanged: false })],
    [
      "the no-active-version arm",
      { status: 200, body: { kind: "no-active-version", isSent: true } },
    ],
  ])("is true on %s", async (_name, answer) => {
    serverAnswers({ notice: answer });

    const mounted = await mountAndSettle();

    expect(
      requireIn(mounted.container, '[data-testid="harness"]').dataset.isSent,
    ).toBe("true");
  });

  it("is still read on a stale page, where C1 is not shown", async () => {
    serverAnswers({
      notice: activeNotice({
        isSent: true,
        current: { ...PAGE_PAIR, versionId: "published-after-load" },
      }),
    });

    const mounted = await mountAndSettle();

    expect(notice(mounted.container)).toBe(null);
    expect(
      requireIn(mounted.container, '[data-testid="harness"]').dataset.isSent,
    ).toBe("true");
  });
});
