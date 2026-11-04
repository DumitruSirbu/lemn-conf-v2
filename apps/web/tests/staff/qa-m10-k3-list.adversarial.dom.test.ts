// @vitest-environment happy-dom
//
// Adversarial QA of the staff list of changed kitchens: the line that says when a kitchen was seen and when it changed again
// (a mark raised after the change, a mark with no instant, an instant with no mark) and the requests the three filters make
// together, read back by the server's own query reader.
import { readStaffKitchenQuery } from "@lemnaria/configurator-domain";
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
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
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
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const ROWS = '[data-testid="staff-kitchen-row"]';
const BADGE = '[data-testid="staff-kitchen-changed-badge"]';
const SEARCH_SETTLE_MS = 500;

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
        email: CONTEXT.email,
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
  width,
}: {
  locale: TestLocale;
  width: "desktop" | "phone";
}): Promise<void> {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: width === "desktop",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
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

describe.each(LOCALES)("the sub-line of a changed row in %s", (locale) => {
  const sayOfChanges = createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffChanges",
  });
  const leadOfSubLine =
    sayOfChanges("seenAndChangedAgain", { seen: "", changed: "" }).split(
      " ",
    )[0] ?? "";
  const [today, yesterday] =
    locale === "ro" ? ["azi", "ieri"] : ["сегодня", "вчера"];

  describe.each(["phone", "desktop"] as const)("on a %s", (width) => {
    it("never says a kitchen changed again before it was seen: a mark raised after the save it did not show has a later instant than the save", async () => {
      listAnswers(() => ({
        body: wireList(
          [
            wireRow(1, {
              changedAfterSeen: true,
              seenAt: "2026-10-21T08:00:00.000Z",
              updatedAt: "2026-10-21T06:40:00.000Z",
            }),
          ],
          { changedCount: 1 },
        ),
      }));

      await mount({ locale, width });

      const [row] = allIn(container(), ROWS);
      const seenLater = sayOfChanges("seenAndChangedAgain", {
        seen: `${today}, 11:00`,
        changed: `${today}, 09:40`,
      });
      expect(row?.textContent).not.toContain(seenLater);
    });

    it("draws the badge and no sub-line for a changed row that no mark counts for", async () => {
      listAnswers(() => ({
        body: wireList([wireRow(1, { changedAfterSeen: true, seenAt: null })], {
          changedCount: 1,
        }),
      }));

      await mount({ locale, width });

      const [row] = allIn(container(), ROWS);
      expect(row?.querySelector(BADGE)).not.toBeNull();
      expect(row?.textContent).not.toContain(leadOfSubLine);
    });

    it("draws neither the badge nor the sub-line for an unchanged row with a seen instant", async () => {
      listAnswers(() => ({
        body: wireList([
          wireRow(1, {
            changedAfterSeen: false,
            seenAt: "2026-10-20T07:05:00.000Z",
            updatedAt: "2026-10-19T07:05:00.000Z",
          }),
        ]),
      }));

      await mount({ locale, width });

      const [row] = allIn(container(), ROWS);
      expect(row?.querySelector(BADGE)).toBeNull();
      expect(row?.textContent).not.toContain(leadOfSubLine);
    });

    it("writes the day of an older seen instant by its date, and of yesterday's by its word", async () => {
      listAnswers(() => ({
        body: wireList(
          [
            wireRow(1, {
              changedAfterSeen: true,
              seenAt: "2026-10-12T07:05:00.000Z",
              updatedAt: "2026-10-20T10:20:00.000Z",
            }),
          ],
          { changedCount: 1 },
        ),
      }));

      await mount({ locale, width });

      const [row] = allIn(container(), ROWS);
      expect(row?.textContent).toContain(
        sayOfChanges("seenAndChangedAgain", {
          seen: "12.10.2026, 10:05",
          changed: `${yesterday}, 13:20`,
        }),
      );
    });
  });
});

describe("the request the three filters make together", () => {
  const SEARCHES = [
    "ana&onlyChanged=false",
    "a=b",
    "100%",
    "a+b c",
    "#fragment",
    "?segment=drafts",
    "Zo\u00EB \u00C5ngstr\u00F6m",
    "😀",
    "q=x&q=y",
  ];

  async function mountOnPhone(): Promise<void> {
    listAnswers(() => ({ body: wireList([wireRow(1)]) }));
    await mount({ locale: "ro", width: "phone" });
  }

  async function chooseStatus(status: string): Promise<void> {
    const select = requireIn<HTMLSelectElement>(container(), "select");
    select.value = status;
    act(() => {
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  }

  async function turnOnlyChangedOn(): Promise<void> {
    click(requireIn(container(), 'input[role="switch"]'));
    await settle();
  }

  async function typeSearch(text: string): Promise<void> {
    typeInto(
      requireIn<HTMLInputElement>(container(), 'input[type="search"]'),
      text,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEARCH_SETTLE_MS);
    });
    await settle();
  }

  function lastQueryAsTheServerReadsIt() {
    const url = listRequests().at(-1)?.url;
    if (url === undefined) throw new Error("no list request was made");
    return {
      members: [...url.searchParams.keys()].sort(),
      reading: readStaffKitchenQuery({
        segment: url.searchParams.get("segment") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
        page: url.searchParams.get("page") ?? undefined,
        onlyChanged: url.searchParams.get("onlyChanged") ?? undefined,
      }),
    };
  }

  it.each(SEARCHES)(
    "carries the search %j as one member of its own, with the status and the changed switch beside it",
    async (search) => {
      await mountOnPhone();

      await chooseStatus("contacted");
      await turnOnlyChangedOn();
      await typeSearch(search);

      const { members, reading } = lastQueryAsTheServerReadsIt();
      expect(members).toEqual([
        "onlyChanged",
        "page",
        "q",
        "segment",
        "status",
      ]);
      expect(reading).toEqual({
        ok: true,
        query: {
          segment: "sent",
          status: "contacted",
          search: search.trim(),
          page: 1,
          onlyChanged: true,
        },
      });
    },
  );

  it("keeps the changed switch and the search when the status is dropped again", async () => {
    await mountOnPhone();
    await turnOnlyChangedOn();
    await typeSearch("ana");
    await chooseStatus("contacted");

    await chooseStatus("");

    expect(lastQueryAsTheServerReadsIt().reading).toEqual({
      ok: true,
      query: {
        segment: "sent",
        status: null,
        search: "ana",
        page: 1,
        onlyChanged: true,
      },
    });
  });

  it("sends the changed switch, and no status, on the segment where no request has a status", async () => {
    await mountOnPhone();
    await chooseStatus("contacted");
    await turnOnlyChangedOn();

    const drafts = allIn<HTMLInputElement>(
      container(),
      'input[type="radio"][value="drafts"]',
    )[0];
    if (drafts === undefined) throw new Error("no drafts segment");
    click(drafts);
    await settle();

    expect(lastQueryAsTheServerReadsIt().reading).toEqual({
      ok: true,
      query: {
        segment: "drafts",
        status: null,
        search: null,
        page: 1,
        onlyChanged: true,
      },
    });
  });
});
