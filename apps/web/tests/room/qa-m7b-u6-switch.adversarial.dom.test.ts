// @vitest-environment happy-dom
//
// M7B U6 adversarial QA (docs/WORKFLOW.md step 3): the U at Step 1 under the policy the product ships,
// through the real `RoomScreen`, in both locales. What the implementer's restatements leave open:
// - a U too small for its kitchen (ADR 0108 H3, RQ8) at 1C: the room-level reason alone, no number,
//   no shape refusal, Continue refused — and H3's pairs at 1 mm landing on the same side of 1C/1D as
//   the domain says, B and C mirrored;
// - W23's owner answer (2026-09-30, relayed): a too-short U gets the straight-kitchen suggestion, a
//   U whose wall A is no straight room gets none, and the suggestion's action lands on a straight room;
// - fixing the room clears 1C and enables Continue.
// Every sentence is read out of the catalogue under test.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
  useSearchParams: () => new URLSearchParams(browser.search),
  useRouter: () => ({
    push: browser.push,
    replace: browser.replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { APPROVED_ROOM_POLICY } from "@lemnaria/configurator-domain";

import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";
import {
  parseRoomUrlState,
  type RoomSearchParams,
} from "@/room/room-url-state";

import {
  CATALOGUES,
  requireLeafAt,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";

type Locale = readonly [CatalogueLocale, Catalogue];

let container: HTMLDivElement;
let root: Root;

function render(search: string, [locale, messages]: Locale): void {
  browser.search = search;
  browser.pathname = `/${locale}/configurator/room`;
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(RoomScreen, { policy: APPROVED_ROOM_POLICY }),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function maybeAt(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function elementAt(testId: string): HTMLElement {
  const found = maybeAt(testId);
  if (found === null) throw new Error(`the screen draws no ${testId}`);
  return found;
}

function substate(): string | null {
  return (
    container
      .querySelector("main[data-room-substate]")
      ?.getAttribute("data-room-substate") ?? null
  );
}

function continueButton(): HTMLButtonElement {
  return elementAt("room-continue") as HTMLButtonElement;
}

function fieldReasonsShown(): readonly string[] {
  return [
    ...container.querySelectorAll("[data-testid^='room-length-reason-']"),
  ].map((element) =>
    (element.getAttribute("data-testid") ?? "").replace(
      "room-length-reason-",
      "",
    ),
  );
}

function roomReasonTexts(): readonly string[] {
  return [
    ...container.querySelectorAll("[data-testid='room-room-reason']"),
  ].map((element) => element.textContent);
}

/** The query of the last URL the screen wrote, by push or by replace. */
function lastWrittenQuery(): RoomSearchParams {
  const hrefs = [...browser.push.mock.calls, ...browser.replace.mock.calls].map(
    ([href]) => String(href),
  );
  const href = hrefs.at(-1);
  if (href === undefined) throw new Error("the screen wrote no URL");
  return Object.fromEntries(new URL(href, "http://localhost").searchParams);
}

function uQuery(
  wallA: string,
  wallB: string,
  wallC: string,
  height = "2.6",
): string {
  return `shape=U&wallA=${wallA}&wallB=${wallB}&wallC=${wallC}&height=${height}`;
}

beforeEach(() => {
  browser.search = "";
  browser.push.mockClear();
  browser.replace.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

describe.each(CATALOGUES)(
  "a U too small for its kitchen at 1C, in %s",
  (locale, messages) => {
    const catalogue: Locale = [locale, messages];

    it("shows the room-level reason alone, with no number, no shape refusal, and no way on", () => {
      render(uQuery("2.7", "1", "1"), catalogue);

      expect(substate()).toBe("1C");
      expect(roomReasonTexts()).toEqual([
        requireLeafAt(messages, "room.issue.roomTooSmall"),
      ]);
      expect(fieldReasonsShown()).toEqual([]);
      expect(maybeAt("room-shape-refusal")?.textContent ?? "").toBe("");
      expect(elementAt("room-one-c-status").textContent).not.toMatch(/\d/);
      expect(continueButton().disabled).toBe(true);
    });

    it("offers the straight kitchen, whose wall A of 2700 mm is one (W23)", () => {
      render(uQuery("2.7", "1", "1"), catalogue);

      expect(maybeAt("room-linear-suggestion")?.textContent).toBe(
        requireLeafAt(messages, "room.issue.orChooseLinear"),
      );
    });
  },
);

describe("H3's pairs at 1 mm land on the domain's side of 1C and 1D, B and C mirrored", () => {
  it.each([
    ["A 2999, B 6000, C 1599", uQuery("2.999", "6", "1.599"), "1C"],
    ["A 2999, B 6000, C 1600", uQuery("2.999", "6", "1.6"), "1D"],
    ["A 2999, B 1599, C 6000", uQuery("2.999", "1.599", "6"), "1C"],
    ["A 2999, B 1600, C 6000", uQuery("2.999", "1.6", "6"), "1D"],
    ["A 2999, B = C = 1000", uQuery("2.999", "1", "1"), "1C"],
    ["A 3000, B = C = 1000", uQuery("3", "1", "1"), "1D"],
    ["A 2700, B = C = 1600", uQuery("2.7", "1.6", "1.6"), "1D"],
    ["A 2699, B = C = 3000", uQuery("2.699", "3", "3"), "1C"],
  ] as const)("%s is %s", (_label, query, expected) => {
    render(query, CATALOGUES[0]);

    expect(substate()).toBe(expected);
    expect(continueButton().disabled).toBe(expected === "1C");
  });
});

describe("the straight-kitchen suggestion on a U (W23, owner 2026-09-30)", () => {
  it("shows for a U whose wall A is too short for a U but a straight room's", () => {
    render(uQuery("2.2", "2", "2"), CATALOGUES[0]);

    expect(substate()).toBe("1C");
    expect(fieldReasonsShown()).toEqual(["wallA"]);
    expect(maybeAt("room-linear-suggestion")).not.toBeNull();
  });

  it("does not show for a U whose wall A is too short for a straight room too", () => {
    render(uQuery("1", "2", "2"), CATALOGUES[0]);

    expect(substate()).toBe("1C");
    expect(fieldReasonsShown()).toEqual(["wallA"]);
    expect(maybeAt("room-linear-suggestion")).toBeNull();
  });

  it("takes a too-small U to a straight room of the same wall A and height when its action is used", () => {
    vi.useFakeTimers();
    render(uQuery("2.7", "1", "1"), CATALOGUES[0]);

    act(() => {
      elementAt("room-suggestion-action").click();
    });
    act(() => {
      vi.advanceTimersByTime(URL_SETTLE_MS * 3);
    });

    expect(
      (elementAt("room-shape-chip-control-linear") as HTMLInputElement).checked,
    ).toBe(true);
    expect((elementAt("room-length-wallA") as HTMLInputElement).value).toBe(
      "2700",
    );
    expect(continueButton().disabled).toBe(false);
    expect(parseRoomUrlState(lastWrittenQuery())).toMatchObject({
      substate: "1D",
      input: { shape: "linear", wallAMm: 2700, heightMm: 2600 },
    });
  });
});

describe("fixing a too-small U leads on", () => {
  it("clears 1C and enables Continue once wall A reaches 3000 mm", () => {
    render(uQuery("2.7", "1", "1"), CATALOGUES[0]);
    expect(continueButton().disabled).toBe(true);

    act(() => {
      const control = elementAt("room-length-wallA");
      Reflect.set(HTMLInputElement.prototype, "value", "3000", control);
      control.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(continueButton().disabled).toBe(false);
    expect(roomReasonTexts()).toEqual([]);
    expect(maybeAt("room-linear-suggestion")).toBeNull();
  });
});
