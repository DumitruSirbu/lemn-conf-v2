// @vitest-environment happy-dom
// M8D wave W1 and W2's seam with it, adversarial QA of Step 1's preset screens (criteria L-1, L-3, L-7, L-10, C-7, C-8,
// C-11, C-14): the wait and its 250 ms grace, the card's contents, the image's loading and failed states, the pop-up's
// opener and the copy's states through the REAL `usePresetCopy`. happy-dom has no layout or CSS, so the image's shape
// (L-2), a name's wrapping (L-4) and the fades are `qa-m8d-preset-list.adversarial.e2e.spec.ts`.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => router,
}));

import { PresetChooser, PresetWait } from "@/room/preset-list";
import type { ListedPresetOffer } from "@/room/preset-offers";
import {
  usePresetCopy,
  type PresetCopy,
  type PresetCopyStatus,
} from "@/room/use-generation";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import type { Catalogue, CatalogueLocale } from "../support/catalogues";
import {
  listedOfferOf,
  numberedOffers,
} from "../support/preset-offer-fixtures";

const ROOM = KITCHEN_L_DESIGN.room;
const GRACE_MS = 250;
const MINT_ENDPOINT = "/api/designs";
const LIMIT_BODY = JSON.stringify({ code: "MINT_LIMIT_REACHED" });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  router.push.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function render(
  child: ReturnType<typeof createElement>,
  locale: CatalogueLocale = "ro",
): void {
  const messages = locale === "ro" ? roMessages : (ruMessages as Catalogue);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement("main", null, child),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function byTestId(testId: string): HTMLElement {
  const element = maybeByTestId(testId);
  if (element === null) throw new Error(`nothing drawn as ${testId}`);
  return element;
}

function maybeByTestId(testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function press(element: Element): void {
  act(() => {
    (element as HTMLElement).click();
  });
}

function pressTestId(testId: string): void {
  press(byTestId(testId));
}

function pressKey(key: string, target: Element = document.body): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

describe("the wait, 1D (L-7)", () => {
  function mountWait(): { onBack: ReturnType<typeof vi.fn> } {
    vi.useFakeTimers();
    const onBack = vi.fn();
    render(createElement(PresetWait, { room: ROOM, onBack }));
    return { onBack };
  }

  function isWaitContentDrawn(): boolean {
    return (
      maybeByTestId("room-presets-wait-notice") !== null ||
      container.querySelector("h2") !== null ||
      container.querySelector("ul") !== null
    );
  }

  it.each([0, 1, 100, 248, 249])(
    "paints no heading, notice or skeleton at %i ms",
    (elapsedMs) => {
      mountWait();

      act(() => {
        vi.advanceTimersByTime(elapsedMs);
      });

      expect(isWaitContentDrawn()).toBe(false);
      expect(maybeByTestId("room-presets-wait")).not.toBeNull();
    },
  );

  it.each([250, 251, 1000, 3000])(
    "paints the heading, the notice and two skeletons at %i ms",
    (elapsedMs) => {
      mountWait();

      act(() => {
        vi.advanceTimersByTime(elapsedMs);
      });

      expect(container.querySelector("h2")?.textContent).toBe(
        roMessages.presetChooser.heading,
      );
      expect(byTestId("room-presets-wait-notice").textContent).toBe(
        roMessages.presetChooser.waiting,
      );
      expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    },
  );

  it("draws each skeleton in the card's shape: an image block, a name bar and a button bar", () => {
    mountWait();

    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });

    for (const skeleton of container.querySelectorAll("ul > li")) {
      expect(skeleton.children).toHaveLength(2);
      expect(skeleton.children[0]?.children).toHaveLength(0);
      expect(skeleton.children[1]?.children).toHaveLength(2);
      expect(skeleton.textContent).toBe("");
    }
  });

  it("hides the skeletons from a screen reader and announces the wait once", () => {
    mountWait();

    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });

    expect(container.querySelector("ul")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it.each([0, 249, 250, 251, 3000])(
    "holds only Back in the footer at %i ms",
    (elapsedMs) => {
      mountWait();

      act(() => {
        vi.advanceTimersByTime(elapsedMs);
      });

      const buttons = [...container.querySelectorAll("button")];
      expect(
        buttons.map((button) => button.getAttribute("data-testid")),
      ).toEqual(["room-presets-back"]);
      expect(buttons[0]?.textContent).toBe(roMessages.room.back);
    },
  );

  it("calls onBack from Back before and after the grace", () => {
    const { onBack } = mountWait();

    pressTestId("room-presets-back");
    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });
    pressTestId("room-presets-back");

    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("leaves no timer behind when it goes before the grace is over", () => {
    mountWait();

    act(() => {
      root.render(createElement("div"));
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts nothing when it is rendered again after the grace", () => {
    mountWait();
    act(() => {
      vi.advanceTimersByTime(GRACE_MS);
    });

    render(createElement(PresetWait, { room: ROOM, onBack: vi.fn() }));

    expect(isWaitContentDrawn()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

/** What the pop-up and the cards ask of the copy, with the status the test sets. */
interface StubCopy extends PresetCopy {
  readonly select: ReturnType<typeof vi.fn>;
  readonly dismissFailure: ReturnType<typeof vi.fn>;
}

function stubCopy(status: PresetCopyStatus): StubCopy {
  return { status, select: vi.fn(), dismissFailure: vi.fn(), reset: vi.fn() };
}

function mountList(
  offers: readonly ListedPresetOffer[],
  copy: PresetCopy = stubCopy("idle"),
  locale: CatalogueLocale = "ro",
): void {
  render(
    createElement(PresetChooser, {
      room: ROOM,
      offers,
      copy,
      onBack: vi.fn(),
      onSkip: vi.fn(),
    }),
    locale,
  );
}

function cards(): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      '[data-testid="room-preset-card"]',
    ),
  ];
}

function cardOf(presetId: string): HTMLElement {
  const card = cards().find(
    (candidate) => candidate.dataset.presetId === presetId,
  );
  if (card === undefined) throw new Error(`no card for ${presetId}`);
  return card;
}

function previewOf(presetId: string): HTMLButtonElement {
  return required(
    cardOf(presetId).querySelector<HTMLButtonElement>(
      '[data-testid="room-preset-preview"]',
    ),
  );
}

describe("a card (L-1)", () => {
  it("holds, in this order, the image, the name and the one button, for an unadjusted offer", () => {
    mountList([listedOfferOf({ id: "preset-1", typedName: "Kitchen in L" })]);

    const [card] = cards();
    const parts = [...(card?.querySelectorAll("img, h3, p, button") ?? [])].map(
      (part) => part.tagName.toLowerCase(),
    );

    expect(parts).toEqual(["img", "h3", "button"]);
    expect(card?.querySelectorAll("button")).toHaveLength(1);
    expect(card?.querySelector("button")?.textContent).toBe(
      roMessages.presetChooser.preview,
    );
  });

  it("holds the adjusted note between the name and the button if and only if the offer is adjusted", () => {
    mountList([
      listedOfferOf({ id: "kept", typedName: "Kept" }),
      listedOfferOf({
        id: "adjusted",
        typedName: "Adjusted",
        isAdjusted: true,
      }),
    ]);

    const orderOf = (id: string) =>
      [...cardOf(id).querySelectorAll("img, h3, p, button")].map((part) =>
        part.tagName.toLowerCase(),
      );

    expect(orderOf("kept")).toEqual(["img", "h3", "button"]);
    expect(orderOf("adjusted")).toEqual(["img", "h3", "p", "button"]);
    expect(cardOf("adjusted").querySelector("p")?.textContent).toContain(
      roMessages.presetChooser.adjusted,
    );
  });

  it("carries no counts, price, chip or other word from the old card", () => {
    mountList(numberedOffers(3));

    for (const card of cards()) {
      expect(card.textContent).not.toMatch(/MDL|corpuri|Folose/);
      expect(
        card.querySelectorAll("button, a, input, select, [role='button']"),
      ).toHaveLength(1);
    }
  });

  it.each(["card", "image", "name"] as const)(
    "opens nothing when the %s is tapped",
    (part) => {
      mountList(numberedOffers(3));
      const target =
        part === "card"
          ? cardOf("preset-2")
          : part === "image"
            ? required(cardOf("preset-2").querySelector("img"))
            : required(cardOf("preset-2").querySelector("h3"));

      press(target);

      expect(maybeByTestId("preset-carousel-dialog")).toBeNull();
    },
  );

  it("names the button by the word and the preset together", () => {
    mountList([listedOfferOf({ id: "preset-1", typedName: "Kitchen in L" })]);
    const preview = previewOf("preset-1");

    const names = (preview.getAttribute("aria-labelledby") ?? "")
      .split(" ")
      .map((id) => container.querySelector(`[id="${id}"]`)?.textContent);

    expect(names).toEqual([roMessages.presetChooser.preview, "Kitchen in L"]);
  });

  it("shows the generated name in the active language when the owner typed none", () => {
    mountList([listedOfferOf({ id: "generated" })], stubCopy("idle"), "ru");

    const name = cardOf("generated").querySelector("h3")?.textContent ?? "";

    expect(name.length).toBeGreaterThan(0);
    expect(name).toMatch(/мм|mm/);
  });

  it("draws an owner's typed name as text, never as markup", () => {
    const hostile = '<img src=x onerror="alert(1)"><b>bold</b>';
    mountList([listedOfferOf({ id: "preset-1", typedName: hostile })]);
    const card = cardOf("preset-1");

    expect(card.querySelector("h3")?.textContent).toBe(hostile);
    expect(card.querySelector("h3 *")).toBeNull();
    expect(card.querySelectorAll("img")).toHaveLength(1);
    expect(card.querySelector("img")?.getAttribute("alt")).toBe(hostile);
  });

  it("draws every name from one to eighty characters whole, in the card, the pop-up's title and the image's alt", () => {
    for (let length = 1; length <= 80; length += 1) {
      const name = "Ab "
        .repeat(length)
        .slice(0, length)
        .trim()
        .padEnd(length, "x");
      mountList([listedOfferOf({ id: "long", typedName: name })]);

      expect(cardOf("long").querySelector("h3")?.textContent).toBe(name);
      expect(cardOf("long").querySelector("img")?.getAttribute("alt")).toBe(
        name,
      );
      press(previewOf("long"));
      expect(byTestId("preset-carousel-name").textContent).toBe(name);
      pressKey("Escape");
    }
  });
});

describe("the image's states (L-3, L-10)", () => {
  it("shows a shimmer on every image until it has loaded", () => {
    mountList(numberedOffers(3));

    expect(
      container.querySelectorAll('[data-testid="preset-image-loading"]'),
    ).toHaveLength(3);
  });

  it("stops the shimmer of an image that has loaded and of no other", () => {
    mountList(numberedOffers(3));

    act(() => {
      cardOf("preset-2").querySelector("img")?.dispatchEvent(new Event("load"));
    });

    expect(
      cardOf("preset-2").querySelector('[data-testid="preset-image-loading"]'),
    ).toBeNull();
    expect(
      cardOf("preset-1").querySelector('[data-testid="preset-image-loading"]'),
    ).not.toBeNull();
    expect(
      cardOf("preset-3").querySelector('[data-testid="preset-image-loading"]'),
    ).not.toBeNull();
  });

  it("stops the shimmer of an image that failed, and draws the hatch with the name instead", () => {
    mountList([listedOfferOf({ id: "preset-1", typedName: "Kitchen in L" })]);

    act(() => {
      cardOf("preset-1")
        .querySelector("img")
        ?.dispatchEvent(new Event("error"));
    });

    const card = cardOf("preset-1");
    const hatch = card.querySelector('[data-testid="preset-image-failed"]');
    expect(
      card.querySelector('[data-testid="preset-image-loading"]'),
    ).toBeNull();
    expect(card.querySelector("img")).toBeNull();
    expect(hatch?.getAttribute("role")).toBe("img");
    expect(hatch?.getAttribute("aria-label")).toBe("Kitchen in L");
    expect(hatch?.textContent).toBe("Kitchen in L");
    expect(hatch?.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is read once by a screen reader: the visible name inside the hatch is hidden from it", () => {
    mountList([listedOfferOf({ id: "preset-1", typedName: "Kitchen in L" })]);
    act(() => {
      cardOf("preset-1")
        .querySelector("img")
        ?.dispatchEvent(new Event("error"));
    });

    const hatch = required(
      cardOf("preset-1").querySelector('[data-testid="preset-image-failed"]'),
    );
    const visibleToReaders = [...hatch.querySelectorAll("*")].filter(
      (node) => node.closest('[aria-hidden="true"]') === null,
    );

    expect(visibleToReaders).toEqual([]);
    expect(hatch.getAttribute("aria-label")).toBe("Kitchen in L");
  });

  it("keeps the failed card's one button and opens the pop-up on that preset", () => {
    mountList(numberedOffers(3));
    act(() => {
      cardOf("preset-2")
        .querySelector("img")
        ?.dispatchEvent(new Event("error"));
    });

    press(previewOf("preset-2"));

    expect(cardOf("preset-2").querySelectorAll("button")).toHaveLength(1);
    expect(byTestId("preset-carousel-name").textContent).toBe("Preset 2");
  });

  it("stops the shimmer of an image the cache had finished before React attached its listener", () => {
    const complete = vi
      .spyOn(HTMLImageElement.prototype, "complete", "get")
      .mockReturnValue(true);
    const naturalWidth = vi
      .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
      .mockReturnValue(1280);
    try {
      mountList(numberedOffers(2));

      expect(
        container.querySelectorAll('[data-testid="preset-image-loading"]'),
      ).toHaveLength(0);
    } finally {
      complete.mockRestore();
      naturalWidth.mockRestore();
    }
  });

  it("keeps the shimmer for an image the cache reports complete but empty (a broken one)", () => {
    const complete = vi
      .spyOn(HTMLImageElement.prototype, "complete", "get")
      .mockReturnValue(true);
    const naturalWidth = vi
      .spyOn(HTMLImageElement.prototype, "naturalWidth", "get")
      .mockReturnValue(0);
    try {
      mountList(numberedOffers(1));

      expect(
        container.querySelectorAll('[data-testid="preset-image-loading"]'),
      ).toHaveLength(1);
    } finally {
      complete.mockRestore();
      naturalWidth.mockRestore();
    }
  });

  it("has a shimmer and a failed state in the pop-up's slide as well", () => {
    mountList(numberedOffers(3));
    press(previewOf("preset-2"));
    const slide = byTestId("preset-carousel-slide");
    expect(
      slide.querySelectorAll('[data-testid="preset-image-loading"]'),
    ).toHaveLength(3);

    act(() => {
      slide.querySelectorAll("img")[1]?.dispatchEvent(new Event("error"));
    });

    expect(
      slide.querySelectorAll('[data-testid="preset-image-failed"]'),
    ).toHaveLength(1);
    expect(
      slide.querySelectorAll('[data-testid="preset-image-loading"]'),
    ).toHaveLength(2);
  });
});

describe("the pop-up's opener (C-11)", () => {
  it("opens on the card that was tapped", () => {
    mountList(numberedOffers(5));

    press(previewOf("preset-4"));

    expect(byTestId("preset-carousel-position").textContent).toBe("4 / 5");
    expect(byTestId("preset-carousel-name").textContent).toBe("Preset 4");
  });

  it("gives focus back to the card that opened it, not to the slide it ended on", () => {
    mountList(numberedOffers(5));
    press(previewOf("preset-2"));
    pressKey("ArrowRight", byTestId("preset-carousel-dialog"));
    pressKey("ArrowRight", byTestId("preset-carousel-dialog"));
    expect(byTestId("preset-carousel-name").textContent).toBe("Preset 4");

    pressKey("Escape");

    expect(maybeByTestId("preset-carousel-dialog")).toBeNull();
    expect(document.activeElement).toBe(previewOf("preset-2"));
  });

  it.each([
    [
      "Escape",
      () => {
        pressKey("Escape");
      },
    ],
    [
      "the scrim",
      () => {
        pressTestId("preset-carousel-scrim");
      },
    ],
    [
      "the close button",
      () => {
        pressTestId("preset-carousel-close");
      },
    ],
  ] as const)(
    "gives focus back to the opening card when %s closes it",
    (_way, close) => {
      mountList(numberedOffers(3));
      press(previewOf("preset-3"));

      close();

      expect(document.activeElement).toBe(previewOf("preset-3"));
    },
  );

  it("forgets a failure when the pop-up is closed, so it opens clean next time", () => {
    const copy = stubCopy("failed");
    mountList(numberedOffers(3), copy);
    press(previewOf("preset-1"));

    pressKey("Escape");

    expect(copy.dismissFailure).toHaveBeenCalledTimes(1);
  });

  it("tells the copy to forget a failure on a slide change", () => {
    const copy = stubCopy("failed");
    mountList(numberedOffers(3), copy);
    press(previewOf("preset-1"));

    pressTestId("preset-carousel-next");

    expect(copy.dismissFailure).toHaveBeenCalledTimes(1);
  });

  it("hands Select the design the card showed, with the preset's id", () => {
    const copy = stubCopy("idle");
    const offers = numberedOffers(3);
    mountList(offers, copy);
    press(previewOf("preset-1"));
    pressTestId("preset-carousel-next");

    pressTestId("preset-carousel-select");

    expect(copy.select).toHaveBeenCalledExactlyOnceWith({
      presetId: "preset-2",
      design: offers[1]?.design,
    });
  });
});

/** Mounts the list with the real copy hook, whose mint goes to a `fetch` the test holds. */
function mountWithTheRealCopy(offers: readonly ListedPresetOffer[]): void {
  function Host() {
    const copy = usePresetCopy();
    return createElement(PresetChooser, {
      room: ROOM,
      offers,
      copy,
      onBack: vi.fn(),
      onSkip: vi.fn(),
    });
  }
  render(createElement(Host));
}

function stubMint(answer: () => Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchStub = vi.fn((url: string) => {
    if (url === MINT_ENDPOINT) return answer();
    return Promise.reject(new Error(`unexpected request to ${url}`));
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function mintRequests(fetchStub: ReturnType<typeof vi.fn>): number {
  return fetchStub.mock.calls.filter(([url]) => url === MINT_ENDPOINT).length;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function toneOfStatus(): string | null {
  return (
    byTestId("preset-carousel-status")
      .closest("[data-tone]")
      ?.getAttribute("data-tone") ?? null
  );
}

describe("the copy through the real hook (C-6, C-7, C-8)", () => {
  it("writes one design however often Select is pressed while the mint is out", async () => {
    const fetchStub = stubMint(() => new Promise<Response>(() => undefined));
    mountWithTheRealCopy(numberedOffers(3));
    press(previewOf("preset-2"));

    pressTestId("preset-carousel-select");
    pressTestId("preset-carousel-select");
    pressTestId("preset-carousel-select");
    await settle();

    expect(mintRequests(fetchStub)).toBe(1);
    expect(byTestId("preset-carousel-select").getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(byTestId("preset-carousel-status").textContent).toBe(
      roMessages.presetChooser.selecting,
    );
    expect(toneOfStatus()).toBe("progress");
  });

  it("says the failure in the error tone when the mint fails, offers Select again, and a second press asks the same attempt", async () => {
    const fetchStub = stubMint(() =>
      Promise.resolve(new Response("{}", { status: 500 })),
    );
    mountWithTheRealCopy(numberedOffers(3));
    press(previewOf("preset-2"));

    pressTestId("preset-carousel-select");
    await settle();

    expect(toneOfStatus()).toBe("error");
    expect(byTestId("preset-carousel-status").textContent).toBe(
      roMessages.presetChooser.selectFailed,
    );
    expect(
      byTestId("preset-carousel-select").getAttribute("aria-disabled"),
    ).toBe("false");
    expect(mintRequests(fetchStub)).toBe(1);
  });

  it("clears the failure on a slide change", async () => {
    stubMint(() => Promise.resolve(new Response("{}", { status: 500 })));
    mountWithTheRealCopy(numberedOffers(3));
    press(previewOf("preset-2"));
    pressTestId("preset-carousel-select");
    await settle();
    expect(toneOfStatus()).toBe("error");

    pressTestId("preset-carousel-next");

    expect(byTestId("preset-carousel-status").textContent).toBe("");
    expect(toneOfStatus()).toBeNull();
  });

  it("says the limit in the warn tone, disables Select on every slide, and keeps the sentence across slide changes", async () => {
    const fetchStub = stubMint(() =>
      Promise.resolve(new Response(LIMIT_BODY, { status: 429 })),
    );
    mountWithTheRealCopy(numberedOffers(3));
    press(previewOf("preset-1"));
    pressTestId("preset-carousel-select");
    await settle();

    for (const move of [
      "preset-carousel-next",
      "preset-carousel-next",
      "preset-carousel-previous",
    ]) {
      expect(toneOfStatus()).toBe("warn");
      expect(byTestId("preset-carousel-status").textContent).toBe(
        roMessages.presetChooser.selectLimitReached,
      );
      expect(
        byTestId("preset-carousel-select").getAttribute("aria-disabled"),
      ).toBe("true");
      pressTestId("preset-carousel-select");
      pressTestId(move);
    }

    expect(mintRequests(fetchStub)).toBe(1);
  });

  it("keeps the limit when the pop-up is closed and opened again", async () => {
    stubMint(() => Promise.resolve(new Response(LIMIT_BODY, { status: 429 })));
    mountWithTheRealCopy(numberedOffers(3));
    press(previewOf("preset-1"));
    pressTestId("preset-carousel-select");
    await settle();

    pressKey("Escape");
    press(previewOf("preset-3"));

    expect(toneOfStatus()).toBe("warn");
    expect(
      byTestId("preset-carousel-select").getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("treats a 429 that is not the mint's limit as an ordinary failure", async () => {
    stubMint(() =>
      Promise.resolve(
        new Response('{"code":"SOMETHING_ELSE"}', { status: 429 }),
      ),
    );
    mountWithTheRealCopy(numberedOffers(2));
    press(previewOf("preset-1"));

    pressTestId("preset-carousel-select");
    await settle();

    expect(toneOfStatus()).toBe("error");
  });

  it("opens no editor and pushes no route while the mint is out or after it failed", async () => {
    stubMint(() => Promise.resolve(new Response("{}", { status: 500 })));
    mountWithTheRealCopy(numberedOffers(2));
    press(previewOf("preset-1"));

    pressTestId("preset-carousel-select");
    await settle();

    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("the copy hook's own guard (C-6, C-8)", () => {
  function mountCopyHook(): { readonly copy: () => PresetCopy } {
    let latest: PresetCopy | undefined;
    function Probe() {
      latest = usePresetCopy();
      return null;
    }
    render(createElement(Probe));
    return {
      copy: () => {
        if (latest === undefined) throw new Error("the hook has not rendered");
        return latest;
      },
    };
  }

  const FIRST = { presetId: "preset-1", design: KITCHEN_L_DESIGN };
  const SECOND = { presetId: "preset-2", design: KITCHEN_L_DESIGN };

  it("starts no second design for another preset while a write is in flight", async () => {
    const fetchStub = stubMint(() => new Promise<Response>(() => undefined));
    const { copy } = mountCopyHook();

    act(() => {
      copy().select(FIRST);
    });
    act(() => {
      copy().select(SECOND);
    });
    await settle();

    expect(mintRequests(fetchStub)).toBe(1);
    expect(copy().status).toBe("saving");
  });

  it("starts no design for any preset once the day's limit has been reached", async () => {
    const fetchStub = stubMint(() =>
      Promise.resolve(new Response(LIMIT_BODY, { status: 429 })),
    );
    const { copy } = mountCopyHook();
    act(() => {
      copy().select(FIRST);
    });
    await settle();
    expect(copy().status).toBe("limited");

    act(() => {
      copy().select(SECOND);
    });
    act(() => {
      copy().select(FIRST);
    });
    await settle();

    expect(mintRequests(fetchStub)).toBe(1);
    expect(copy().status).toBe("limited");
  });

  it("forgets a failure and only a failure when asked", async () => {
    stubMint(() => Promise.resolve(new Response("{}", { status: 500 })));
    const { copy } = mountCopyHook();
    act(() => {
      copy().select(FIRST);
    });
    await settle();
    expect(copy().status).toBe("failed");

    act(() => {
      copy().dismissFailure();
    });

    expect(copy().status).toBe("idle");
  });

  it("lets the customer ask again after a failure, and says so again when it fails again", async () => {
    const fetchStub = stubMint(() =>
      Promise.resolve(new Response("{}", { status: 500 })),
    );
    const { copy } = mountCopyHook();
    act(() => {
      copy().select(FIRST);
    });
    await settle();
    expect(copy().status).toBe("failed");

    act(() => {
      copy().select(FIRST);
    });
    await settle();

    expect(mintRequests(fetchStub)).toBe(2);
    expect(copy().status).toBe("failed");
  });
});

// Helpers

function required<Element>(element: Element | null): Element {
  if (element === null) throw new Error("nothing is drawn here");
  return element;
}
