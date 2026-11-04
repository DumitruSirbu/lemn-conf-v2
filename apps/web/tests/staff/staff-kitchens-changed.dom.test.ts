// @vitest-environment happy-dom
//
// The staff list of kitchens changed after staff saw them (frames D10A and D10C): the mark on a changed row in the cards and
// in the table, "Doar modificate" and the count beside it, the request it makes, and the words of a filter that matched
// nothing. The server is a stand-in for `fetch`; the catalogue is the shipped one.
import { createTranslator } from "next-intl";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";
import type { StaffShellContext } from "@/staff/staff-shell";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  installStaffKitchensServer,
  wireList,
  wireRow,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const STAFF_ADDRESS = "mihai.rusu@lemnaria.md";
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: STAFF_ADDRESS,
  navigation: ["kitchens"],
};
const ROWS = '[data-testid="staff-kitchen-row"]';
const BADGE = '[data-testid="staff-kitchen-changed-badge"]';
const CHANGED_COUNT = '[data-testid="staff-kitchens-changed-count"]';
const SWITCH = 'input[role="switch"]';

let screen: MountedScreen | undefined;
let server: StaffKitchensServer;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  vi.stubGlobal("location", { assign: () => undefined });
  server = installStaffKitchensServer();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function listAnswers(
  answer: (request: RecordedRequest) => ServerAnswer | "hold" | "offline",
): void {
  server.script((request) => {
    if (request.url.pathname === "/api/staff/kitchens") return answer(request);
    return {
      body: {
        state: "signed-in",
        email: STAFF_ADDRESS,
        capabilities: ["design.read.any", "account.manage.own"],
      },
    };
  });
}

function listRequests(): RecordedRequest[] {
  return server.requests.filter(
    ({ url }) => url.pathname === "/api/staff/kitchens",
  );
}

function useWidth(width: "desktop" | "phone"): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: width === "desktop",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

async function mount({
  locale,
  width = "phone",
}: {
  locale: TestLocale;
  width?: "desktop" | "phone";
}): Promise<void> {
  useWidth(width);
  screen = mountInCatalogue(
    createElement(StaffKitchensScreen, { locale, context: CONTEXT }),
    locale,
  );
  await settle();
}

function container(): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return screen.container;
}

function rows(): HTMLElement[] {
  return allIn(container(), ROWS);
}

function toggle(): HTMLInputElement {
  return requireIn<HTMLInputElement>(container(), SWITCH);
}

/** The changed kitchen first and the others after it, as the server orders a list. */
function oneChangedAmongThree() {
  return wireList(
    [wireRow(1, { changedAfterSeen: true }), wireRow(2), wireRow(3)],
    { changedCount: 1 },
  );
}

describe.each(LOCALES)("the list of changed kitchens in %s", (locale) => {
  const changes = CATALOGUES[locale].staffChanges;
  const sayOfChanges = createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffChanges",
  });

  describe.each(["phone", "desktop"] as const)("on a %s", (width) => {
    it("marks the changed row with the badge, and no other row", async () => {
      listAnswers(() => ({ body: oneChangedAmongThree() }));

      await mount({ locale, width });

      const [first, second, third] = rows();
      expect(rows()).toHaveLength(3);
      expect(first?.querySelector(BADGE)?.textContent).toBe(changes.badge);
      expect(first?.dataset.changed).toBe("true");
      expect(second?.querySelector(BADGE)).toBeNull();
      expect(third?.querySelector(BADGE)).toBeNull();
      expect(second?.dataset.changed).toBe("false");
    });

    it("stands the badge with the kitchen's name, in the table's name cell and on the card, and not in the state column", async () => {
      listAnswers(() => ({ body: oneChangedAmongThree() }));

      await mount({ locale, width });

      const [first] = rows();
      const badge = first?.querySelector(BADGE);
      expect(badge).not.toBeNull();
      if (width === "desktop") {
        expect(badge?.closest("th")).not.toBeNull();
        expect(badge?.closest("td")).toBeNull();
      } else {
        expect(badge?.closest("li")).toBe(first);
      }
    });

    it("draws no badge when no row reads as changed", async () => {
      listAnswers(() => ({ body: wireList([wireRow(1), wireRow(2)]) }));

      await mount({ locale, width });

      expect(allIn(container(), BADGE)).toHaveLength(0);
    });
  });

  describe("the switch 'Doar modificate' and the count beside it", () => {
    it("is off at first, and the first request does not ask for the changed ones only", async () => {
      listAnswers(() => ({ body: oneChangedAmongThree() }));

      await mount({ locale });

      expect(toggle().checked).toBe(false);
      expect(
        byWords(container(), "label", changes.filter).contains(toggle()),
      ).toBe(true);
      expect(listRequests()[0]?.url.searchParams.has("onlyChanged")).toBe(
        false,
      );
    });

    it("says how many kitchens read as changed, from the server's count and whatever the filters are", async () => {
      listAnswers(() => ({
        body: wireList([wireRow(1)], { changedCount: 3, total: 1 }),
      }));

      await mount({ locale });

      expect(requireIn(container(), CHANGED_COUNT).textContent).toBe(
        sayOfChanges("toolbarCount", { count: 3 }),
      );
    });

    it("says nothing of a count when none reads as changed", async () => {
      listAnswers(() => ({ body: wireList([wireRow(1)]) }));

      await mount({ locale });

      expect(container().querySelector(CHANGED_COUNT)).toBeNull();
    });

    it("asks for the changed ones only, from the first page, when it is turned on, and for all again when it is turned off", async () => {
      listAnswers(() => ({ body: oneChangedAmongThree() }));
      await mount({ locale });

      click(toggle());
      await settle();
      const turnedOn = listRequests().at(-1);
      click(toggle());
      await settle();
      const turnedOff = listRequests().at(-1);

      expect(turnedOn?.url.searchParams.get("onlyChanged")).toBe("true");
      expect(turnedOn?.url.searchParams.get("page")).toBe("1");
      expect(turnedOff?.url.searchParams.has("onlyChanged")).toBe(false);
      expect(toggle().checked).toBe(false);
    });

    it("keeps the other filters when it is turned on, and the switch when they change", async () => {
      listAnswers(() => ({ body: oneChangedAmongThree() }));
      await mount({ locale });

      click(toggle());
      await settle();
      click(requireIn(container(), 'input[type="radio"][value="all"]'));
      await settle();

      const asked = listRequests().at(-1)?.url.searchParams;
      expect(asked?.get("segment")).toBe("all");
      expect(asked?.get("onlyChanged")).toBe("true");
      expect(toggle().checked).toBe(true);
    });

    it("keeps the count the server last gave while the next page is out", async () => {
      listAnswers((request) =>
        request.url.searchParams.has("onlyChanged")
          ? "hold"
          : { body: oneChangedAmongThree() },
      );
      await mount({ locale });

      click(toggle());
      await settle();

      expect(requireIn(container(), CHANGED_COUNT).textContent).toBe(
        sayOfChanges("toolbarCount", { count: 1 }),
      );
    });
  });

  describe("when nothing reads as changed", () => {
    function noChangedKitchens(request: RecordedRequest): ServerAnswer {
      return request.url.searchParams.has("onlyChanged")
        ? { body: wireList([], { changedCount: 0 }) }
        : { body: wireList([wireRow(1)]) };
    }

    it("says no kitchen is changed, and never that no kitchen was sent, and offers the way back to all", async () => {
      listAnswers(noChangedKitchens);
      await mount({ locale });

      click(toggle());
      await settle();

      const notice = requireIn(
        container(),
        '[data-testid="staff-kitchens-no-results"]',
      );
      expect(notice.textContent).toContain(changes.noChangedTitle);
      expect(notice.textContent).toContain(changes.noChangedBody);
      expect(
        container().querySelector('[data-testid="staff-kitchens-empty"]'),
      ).toBeNull();
    });

    it("turns the switch off, asks for all, and puts focus on the switch when 'show all' is pressed", async () => {
      listAnswers(noChangedKitchens);
      await mount({ locale });
      click(toggle());
      await settle();

      click(byWords(container(), "button", changes.showAllKitchens));
      await settle();

      expect(toggle().checked).toBe(false);
      expect(rows()).toHaveLength(1);
      expect(document.activeElement).toBe(toggle());
    });
  });
});
