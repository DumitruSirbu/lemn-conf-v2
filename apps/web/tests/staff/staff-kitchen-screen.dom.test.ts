// @vitest-environment happy-dom
//
// The staff kitchen as a person meets it (Lot 3 frames S3A to S3C, S3H, S3I): every state of the page in Romanian and in
// Russian, and the guarantees that hold whatever a client or a colleague typed. The server is a stand-in for `fetch`; the 3D
// canvas is a stub (happy-dom has no WebGL); the words are the shipped catalogue's.
import { createTranslator } from "next-intl";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act } from "react";

import {
  formatRelativeAge,
  relativeAgeOf,
} from "@/account/kitchens/relative-age";
import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import type { StaffShellContext } from "@/staff/staff-shell";

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
  STAFF_KITCHEN_ID,
  WIRE_DESIGN,
  wireChangedStatus,
  wireDraftKitchen,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const canvases = vi.hoisted(() => ({ viewOnlyMounts: 0, editorMounts: 0 }));

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => {
      canvases.editorMounts += 1;
      return null;
    },
    ViewOnlyKitchenCanvas: () => {
      canvases.viewOnlyMounts += 1;
      return element("canvas", { "data-testid": "stub-canvas" });
    },
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const STAFF_ADDRESS = "mihai.rusu@lemnaria.md";
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: STAFF_ADDRESS,
  navigation: ["kitchens"],
};
const NOW = "2026-10-21T12:00:00.000Z";
const REFUSAL_OF_ONE_KITCHEN = {
  status: 404,
  body: { error: "Design not found" },
} as const;
/** The sender's address as the sentence under the title carries it: between isolate marks. */
const isolatedAddress = "\u2068ana.popescu@mail.md\u2069";
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
const PAGE = '[data-testid="staff-kitchen-page"]';

let screen: MountedScreen | undefined;
let server: StaffKitchensServer;
let assigned: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  resetAccountSessionForTests();
  canvases.viewOnlyMounts = 0;
  canvases.editorMounts = 0;
  assigned = [];
  vi.stubGlobal("location", {
    assign: (address: string) => assigned.push(address),
  });
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

function kitchenAnswers(
  answer: (request: RecordedRequest) => ServerAnswer | "hold" | "offline",
): void {
  server.script((request) => {
    if (request.url.pathname === KITCHEN_ADDRESS) return answer(request);
    return {
      body: {
        state: "signed-in",
        email: STAFF_ADDRESS,
        capabilities: ["design.read.any", "account.manage.own"],
      },
    };
  });
}

function kitchenRequests(): RecordedRequest[] {
  return server.requests.filter(({ url }) => url.pathname === KITCHEN_ADDRESS);
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

async function pass(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
  await settle();
}

async function mount(locale: TestLocale = "ro"): Promise<void> {
  screen = mountInCatalogue(
    createElement(StaffKitchenScreen, {
      locale,
      context: CONTEXT,
      designId: STAFF_KITCHEN_ID,
    }),
    locale,
  );
  await settle();
}

function container(): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return screen.container;
}

function page(): HTMLElement {
  return requireIn(container(), PAGE);
}

function textOf(testId: string): string {
  return requireIn(container(), `[data-testid="${testId}"]`).textContent;
}

function has(testId: string): boolean {
  return container().querySelector(`[data-testid="${testId}"]`) !== null;
}

const FEWER_BODIES = 3;
const FEWER_BODIES_DESIGN: unknown = {
  ...(WIRE_DESIGN as { placements: unknown[] }),
  placements: (WIRE_DESIGN as { placements: unknown[] }).placements.slice(
    0,
    FEWER_BODIES,
  ),
};

/** The value of one fact of the summary card. */
function factOf(key: string): string {
  return requireIn(
    container(),
    `[data-testid="staff-kitchen-summary"] [data-fact="${key}"] dd`,
  ).textContent;
}

function dayOf(locale: TestLocale, instant: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Chisinau",
  }).format(new Date(instant));
}

describe.each(LOCALES)("the kitchen page in %s", (locale) => {
  const words = CATALOGUES[locale].staffKitchen;
  const lists = CATALOGUES[locale].staffKitchens;
  const shell = CATALOGUES[locale].staffShell;
  const say = createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffKitchen",
  });
  const sayOfShell = createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffShell",
  });

  describe("while the kitchen is out (frame S3A)", () => {
    it("draws three grey boxes, says the kitchen is loading to a screen reader, and asks nothing of the person", async () => {
      kitchenAnswers(() => "hold");

      await mount(locale);

      expect(has("staff-kitchen-skeleton")).toBe(true);
      expect(requireIn(page(), '[role="status"]').textContent).toBe(
        words.loading,
      );
      expect(requireIn(page(), "h1").textContent).toBe(words.title);
      expect(allIn(page(), "button, select, textarea, input")).toHaveLength(0);
    });

    it("leads back to the list in the page's own language", async () => {
      kitchenAnswers(() => "hold");

      await mount(locale);

      const back = requireIn<HTMLAnchorElement>(page(), "a");
      expect(back.getAttribute("href")).toBe(`/${locale}/staff/kitchens`);
      expect(back.textContent).toContain(shell.navKitchens);
    });
  });

  describe("a sent kitchen (frame S3B)", () => {
    beforeEach(async () => {
      kitchenAnswers(() => ({ body: wireKitchen() }));
      await mount(locale);
    });

    it("names the kitchen by what the client called it, and the sender and the day beneath", () => {
      expect(requireIn(page(), "h1").textContent).toBe("Casa din Orhei");
      expect(page().textContent).toContain(
        say("subSent", {
          email: isolatedAddress,
          date: "17.10.2026",
        }),
      );
    });

    it("shows the picture in view-only mode, with the editor nowhere", () => {
      expect(has("staff-kitchen-view")).toBe(true);
      expect(canvases.viewOnlyMounts).toBeGreaterThan(0);
      expect(canvases.editorMounts).toBe(0);
      expect(textOf("staff-kitchen-view")).toContain(words.viewOnly);
    });

    it("heads the summary as the configuration that was sent and says nothing of a current variant", () => {
      expect(
        requireIn(container(), "#staff-kitchen-summary-title").textContent,
      ).toBe(words.summaryTitleSent);
      expect(has("staff-kitchen-current-variant")).toBe(false);
    });

    it("tells the request by its reference and its day and minute on the shop's clock, and where its contact is", () => {
      const request = textOf("staff-kitchen-request");

      expect(request).toContain(words.requestTitle);
      expect(request).toContain("LEM-2026-0417, 17.10.2026, 14:08");
      expect(request).toContain(words.requestContactNote);
    });

    it("shows a status nobody changed as new, with no last change", () => {
      const status = requireIn(
        container(),
        '[data-testid="staff-kitchen-status"] [data-kind="status"]',
      );

      expect(status.textContent).toBe(lists.statusNew);
      expect(status.getAttribute("data-status")).toBe("new");
      expect(has("staff-kitchen-last-change")).toBe(false);
    });

    it("shows the client's address, name and phone as text, the phone as unconfirmed", () => {
      const profile = textOf("staff-kitchen-profile");

      expect(profile).toContain(words.profileTitle);
      expect(profile).toContain(words.profileTag);
      expect(profile).toContain("ana.popescu@mail.md");
      expect(profile).toContain("Ana Popescu");
      expect(profile).toContain("078900555");
      expect(profile).toContain(lists.phoneUnverified);
    });

    it("says the access is logged", () => {
      expect(page().textContent).toContain(words.accessLogged);
    });

    it("leads the language links to this kitchen in the other language, not to the list", () => {
      const other = locale === "ro" ? "ru" : "ro";
      const links = allIn<HTMLAnchorElement>(container(), "a[hreflang]");

      expect(links.map((link) => link.getAttribute("href"))).toEqual([
        `/${other}/staff/kitchens/${STAFF_KITCHEN_ID}`,
      ]);
    });

    it("draws no hidden banner for a kitchen its client has not hidden", () => {
      expect(has("staff-kitchen-hidden-banner")).toBe(false);
    });

    it("asks for nothing but to read: every request is a GET of this kitchen or of the session, whatever is pressed", async () => {
      for (const chip of allIn(page(), "button")) click(chip);
      await settle();

      const asked = server.requests.map(({ url, init }) => [
        init.method ?? "GET",
        url.pathname,
      ]);
      expect(asked.length).toBeGreaterThan(0);
      for (const [method, path] of asked) {
        expect(method).toBe("GET");
        expect([KITCHEN_ADDRESS, "/api/account/session"]).toContain(path);
      }
    });

    it("keeps the next wave's controls out: no field, no select, no button but the camera's and the way back", () => {
      expect(allIn(page(), "select, textarea, input")).toHaveLength(0);
      const buttons = allIn(page(), "button");
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button.closest('[role="group"]')).not.toBeNull();
      }
      for (const slot of ["notes", "status-control", "unhide"]) {
        expect(
          container().querySelector(`[data-slot="staff-kitchen-${slot}"]`)
            ?.textContent ?? "",
        ).toBe("");
      }
    });
  });

  describe("the last change of the status", () => {
    it("names who and when, on the shop's clock", async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({ status: wireChangedStatus("contacted") }),
      }));

      await mount(locale);

      expect(textOf("staff-kitchen-last-change")).toBe(
        say("statusLastChange", {
          name: "\u2068Mihai Rusu\u2069",
          when: "18.10.2026, 14:22",
        }),
      );
      expect(textOf("staff-kitchen-status")).toContain(lists.statusContacted);
    });

    it("names the person by address when they have no name, and by a dash when the account no longer resolves", async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({
          status: wireChangedStatus("closed", {
            email: "elena@lemnaria.md",
            name: null,
          }),
        }),
      }));
      await mount(locale);
      expect(textOf("staff-kitchen-last-change")).toContain(
        "elena@lemnaria.md",
      );
      screen?.unmount();

      kitchenAnswers(() => ({
        body: wireKitchen({
          status: wireChangedStatus("closed", { email: null, name: null }),
        }),
      }));
      await mount(locale);
      expect(textOf("staff-kitchen-last-change")).toContain(
        `${lists.noValue},`,
      );
    });
  });

  describe("a status this build does not name", () => {
    it("is its own neutral badge and never reads as a new request", async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({
          status: wireChangedStatus("rejected-by-a-future-build"),
        }),
      }));

      await mount(locale);

      const status = requireIn(
        container(),
        '[data-testid="staff-kitchen-status"] [data-kind="status"]',
      );
      expect(status.textContent).toBe(lists.statusUnrecognised);
      expect(status.getAttribute("data-status")).toBe("unrecognised");
      expect(textOf("staff-kitchen-status")).not.toContain(lists.statusNew);
    });
  });

  describe("a request whose kitchen was not kept as sent", () => {
    beforeEach(async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({ kitchen: { asSent: null } }),
      }));
      await mount(locale);
    });

    it("shows the current document and says it is the current variant", () => {
      expect(textOf("staff-kitchen-current-variant")).toBe(words.viewCurrent);
      expect(
        requireIn(container(), "#staff-kitchen-summary-title").textContent,
      ).toBe(words.summaryTitleCurrent);
      expect(canvases.viewOnlyMounts).toBeGreaterThan(0);
    });
  });

  describe("a kitchen the client changed after sending it", () => {
    it("shows and describes the copy that was sent, not the one on the client's table now", async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({
          kitchen: { design: WIRE_DESIGN, asSent: FEWER_BODIES_DESIGN },
        }),
      }));

      await mount(locale);

      expect(textOf("staff-kitchen-summary")).toContain(words.summaryTitleSent);
      expect(factOf("bodies")).toBe(String(FEWER_BODIES));
      expect(has("staff-kitchen-current-variant")).toBe(false);
    });

    it("describes the current document when none was kept as sent", async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({
          kitchen: { design: FEWER_BODIES_DESIGN, asSent: null },
        }),
      }));

      await mount(locale);

      expect(factOf("bodies")).toBe(String(FEWER_BODIES));
      expect(textOf("staff-kitchen-summary")).toContain(
        words.summaryTitleCurrent,
      );
    });

    it("shows the copy that was sent even when the current document cannot be read", async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({
          kitchen: { design: { room: "?" }, asSent: WIRE_DESIGN },
        }),
      }));

      await mount(locale);

      expect(has("staff-kitchen-cannot-show")).toBe(false);
      expect(has("staff-kitchen-view")).toBe(true);
    });
  });

  describe("a draft (frame S3C)", () => {
    beforeEach(async () => {
      kitchenAnswers(() => ({ body: wireDraftKitchen() }));
      await mount(locale);
    });

    it("has no request and no status, and says why", () => {
      expect(has("staff-kitchen-request")).toBe(false);
      expect(has("staff-kitchen-status")).toBe(false);
      expect(textOf("staff-kitchen-no-status")).toBe(words.draftNoStatus);
    });

    it("is not called a current variant of anything, since nothing was sent", () => {
      expect(has("staff-kitchen-current-variant")).toBe(false);
      expect(has("staff-kitchen-view")).toBe(true);
    });

    it("tells the owner and when it was last changed instead of when it was sent", () => {
      const when = formatRelativeAge(
        locale,
        relativeAgeOf(Date.parse("2026-10-19T09:00:00.000Z"), Date.parse(NOW)),
      );

      expect(page().textContent).toContain(
        say("subDraft", { email: isolatedAddress, when }),
      );
    });

    it("still shows the client", () => {
      expect(textOf("staff-kitchen-profile")).toContain("ana.popescu@mail.md");
    });
  });

  describe("a hidden kitchen (frame S3D)", () => {
    it("says the client hid it, in a status region, and the kitchen is still shown", async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({ kitchen: { isHidden: true } }),
      }));

      await mount(locale);

      const banner = requireIn(
        container(),
        '[data-testid="staff-kitchen-hidden-banner"]',
      );
      expect(banner.getAttribute("role")).toBe("status");
      expect(banner.textContent).toBe(words.hiddenBanner);
      expect(has("staff-kitchen-view")).toBe(true);
      expect(allIn(banner, "button, a")).toHaveLength(0);
    });
  });

  describe("a kitchen with no account", () => {
    it("says it has none instead of an address, here and under the title", async () => {
      kitchenAnswers(() => ({ body: wireKitchen({ client: null }) }));

      await mount(locale);

      expect(textOf("staff-kitchen-profile")).toContain(lists.noAccount);
      expect(textOf("staff-kitchen-profile")).not.toContain("@");
      expect(page().textContent).toContain(
        say("subSentNoAccount", {
          date: dayOf(locale, "2026-10-17T11:08:00.000Z"),
        }),
      );
    });
  });

  describe("a kitchen whose document this build cannot read", () => {
    beforeEach(async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({
          kitchen: { design: { room: "?" }, asSent: { room: "?" } },
          status: wireChangedStatus("offer-sent"),
        }),
      }));
      await mount(locale);
    });

    it("says it cannot show the kitchen, and draws neither a picture nor a summary", () => {
      const notice = textOf("staff-kitchen-cannot-show");

      expect(notice).toContain(words.cannotShowTitle);
      expect(notice).toContain(words.cannotShowBody);
      expect(has("staff-kitchen-view")).toBe(false);
      expect(has("staff-kitchen-summary")).toBe(false);
      expect(canvases.viewOnlyMounts).toBe(0);
    });

    it("keeps the client, the request and the status, and names the kitchen as it was named", () => {
      expect(requireIn(page(), "h1").textContent).toBe("Casa din Orhei");
      expect(textOf("staff-kitchen-profile")).toContain("ana.popescu@mail.md");
      expect(textOf("staff-kitchen-request")).toContain("LEM-2026-0417");
      expect(textOf("staff-kitchen-status")).toContain(lists.statusOfferSent);
    });
  });

  describe("a kitchen nobody named", () => {
    it("is called by the name its facts generate", async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({ kitchen: { name: null } }),
      }));

      await mount(locale);

      expect(requireIn(page(), "h1").textContent).not.toBe("");
      expect(requireIn(page(), "h1").textContent).not.toBe(
        lists.unnamedKitchen,
      );
    });

    it("is called by a plain word when its document cannot be read either", async () => {
      kitchenAnswers(() => ({
        body: wireKitchen({
          kitchen: { name: " ", design: null, asSent: null },
        }),
      }));

      await mount(locale);

      expect(requireIn(page(), "h1").textContent).toBe(lists.unnamedKitchen);
    });
  });

  describe("a kitchen that is missing or not the person's to open (frame S3H)", () => {
    beforeEach(async () => {
      kitchenAnswers(() => ({
        status: 404,
        body: { error: "Design not found" },
      }));
      await mount(locale);
    });

    it("says it is not available, with one answer for both causes, and leads back to the list", () => {
      const notFound = requireIn(
        container(),
        '[data-testid="staff-kitchen-not-found"]',
      );

      expect(requireIn(notFound, "h1").textContent).toBe(words.notFoundTitle);
      expect(notFound.textContent).toContain(words.notFoundBody);
      const back = requireIn<HTMLAnchorElement>(notFound, "a");
      expect(back.getAttribute("href")).toBe(`/${locale}/staff/kitchens`);
      expect(back.textContent).toBe(
        sayOfShell("backTo", { name: shell.navKitchens }),
      );
    });

    it("draws no kitchen and keeps the staff frame", () => {
      expect(has("staff-kitchen-view")).toBe(false);
      expect(has("staff-kitchen-profile")).toBe(false);
      expect(has("staff-role-chip")).toBe(true);
    });
  });

  describe("when the kitchen could not be had (frame S3I)", () => {
    it("tells a 503 as the service being unavailable, and asks again only when the person presses", async () => {
      kitchenAnswers(() => UNAVAILABLE_ANSWER);
      await mount(locale);

      expect(requireIn(page(), '[role="alert"]').textContent).toContain(
        CATALOGUES[locale].accountForm.unavailableTitle,
      );
      expect(requireIn(page(), "h1").textContent).toBe(words.title);
      await pass(30 * 60 * 1000);
      expect(kitchenRequests()).toHaveLength(1);

      kitchenAnswers(() => ({ body: wireKitchen() }));
      click(byWords(page(), "button", CATALOGUES[locale].accountForm.retry));
      await settle();

      expect(kitchenRequests()).toHaveLength(2);
      expect(has("staff-kitchen-profile")).toBe(true);
    });

    it("counts a 429 down, ignores the retry button while it counts, and wakes it when the wait ends", async () => {
      kitchenAnswers(() => RATE_LIMITED_ANSWER(30));
      await mount(locale);
      const retry = byWords(
        page(),
        "button",
        CATALOGUES[locale].accountForm.retry,
      );
      expect(retry.getAttribute("aria-disabled")).toBe("true");

      click(retry);
      await settle();
      expect(kitchenRequests()).toHaveLength(1);

      await pass(31_000);
      expect(retry.getAttribute("aria-disabled")).toBeNull();
      expect(kitchenRequests()).toHaveLength(1);

      click(retry);
      await settle();
      expect(kitchenRequests()).toHaveLength(2);
    });

    it.each([
      ["whole minutes", 600],
      ["a clock time", 7200],
    ])(
      "keeps the retry button off for the whole of a limit told as %s",
      async (_, seconds) => {
        kitchenAnswers(() => RATE_LIMITED_ANSWER(seconds));
        await mount(locale);
        const retry = byWords(
          page(),
          "button",
          CATALOGUES[locale].accountForm.retry,
        );

        await pass((seconds - 1) * 1000);
        click(retry);
        await settle();
        expect(retry.getAttribute("aria-disabled")).toBe("true");
        expect(kitchenRequests()).toHaveLength(1);

        await pass(2000);
        expect(retry.getAttribute("aria-disabled")).toBeNull();
        click(retry);
        await settle();
        expect(kitchenRequests()).toHaveLength(2);
      },
    );

    it.each([
      ["the kitchen", () => ({ body: wireKitchen() })],
      ["the one refusal", () => REFUSAL_OF_ONE_KITCHEN],
      ["another failure", () => UNAVAILABLE_ANSWER],
    ])(
      "puts focus on the page's heading when the retry is answered with %s, the button having gone",
      async (_, answer) => {
        kitchenAnswers(() => UNAVAILABLE_ANSWER);
        await mount(locale);
        const retry = byWords(
          page(),
          "button",
          CATALOGUES[locale].accountForm.retry,
        );
        retry.focus();
        kitchenAnswers(answer);

        click(retry);
        await settle();

        expect(document.activeElement).toBe(requireIn(page(), "h1"));
      },
    );

    it("moves focus only after a retry: a page that opens does not take it", async () => {
      const outside = document.createElement("button");
      document.body.append(outside);
      outside.focus();
      kitchenAnswers(() => ({ body: wireKitchen() }));

      await mount(locale);

      expect(document.activeElement).toBe(outside);
    });

    it("tells an answer with no connection as the account's offline notice", async () => {
      kitchenAnswers(() => "offline");

      await mount(locale);

      expect(requireIn(page(), '[role="alert"]').textContent).toContain(
        CATALOGUES[locale].accountForm.offlineTitle,
      );
    });

    it("tells an answer it cannot read as a failed request, drawing nothing of it", async () => {
      kitchenAnswers(() => ({ body: { kitchen: { id: STAFF_KITCHEN_ID } } }));

      await mount(locale);

      expect(requireIn(page(), '[role="alert"]').textContent).toContain(
        CATALOGUES[locale].accountForm.requestFailedTitle,
      );
      expect(has("staff-kitchen-profile")).toBe(false);
    });
  });

  describe("the session", () => {
    it("leaves for the login page of the page's own language as an expired session on a 401", async () => {
      kitchenAnswers(() => UNAUTHENTICATED_ANSWER);

      await mount(locale);

      expect(assigned).toEqual([
        `/${locale}/account/login?reason=session-expired`,
      ]);
      expect(has("staff-kitchen-profile")).toBe(false);
    });

    it("draws the forbidden screen inside the staff frame on a 403, never an expired session", async () => {
      kitchenAnswers(() => FORBIDDEN_ANSWER);

      await mount(locale);

      expect(container().textContent).toContain(
        CATALOGUES[locale].accountForbidden.title,
      );
      expect(container().textContent).not.toContain(
        CATALOGUES[locale].sessionExpiredSheet.title,
      );
      expect(assigned).toEqual([]);
      expect(has("staff-role-chip")).toBe(true);
    });
  });
});

describe("what a client or a colleague typed", () => {
  const MARKUP = '<img src=x onerror="globalThis.pwned=1">';
  const BIDI = "\u202Eevil\u2066";
  const HOSTILE_WIRE = wireKitchen({
    kitchen: { name: `Casa ${MARKUP} ${BIDI}` },
    client: {
      email: `${MARKUP}@mail.md`,
      name: `Ana ${MARKUP}`,
      phone: `tel:${MARKUP}`,
    },
    request: { reference: `LEM-${MARKUP}`, sentAt: "2026-10-17T11:08:00.000Z" },
    status: wireChangedStatus("contacted", {
      email: `staff${MARKUP}@lemnaria.md`,
      name: `Mihai ${MARKUP}`,
    }),
  });

  beforeEach(async () => {
    kitchenAnswers(() => ({ body: HOSTILE_WIRE }));
    document.title = "unchanged";
    await mount("ro");
  });

  it("is drawn as text and never as markup", () => {
    expect(page().querySelector("img")).toBeNull();
    expect(page().querySelector("script")).toBeNull();
    expect(page().textContent).toContain(MARKUP);
    expect((globalThis as { pwned?: unknown }).pwned).toBeUndefined();
  });

  it("makes no address and no phone a link to write or to call", () => {
    expect(allIn(container(), 'a[href^="mailto:" i]')).toHaveLength(0);
    expect(allIn(container(), 'a[href^="tel:" i]')).toHaveLength(0);
    expect(allIn(page(), "a")).toHaveLength(1);
  });

  it("keeps the kitchen's name out of the document's title", () => {
    expect(document.title).toBe("unchanged");
  });

  it("keeps a right-to-left override that was typed inside its own text, drawn as typed", () => {
    expect(requireIn(page(), "h1").textContent).toBe(`Casa ${MARKUP} ${BIDI}`);
  });
});

describe("a right-to-left override left open in a draft's sender", () => {
  it("is fenced between isolate marks in the line under the title, beside the day it was changed", async () => {
    const typed = "\u202Eevil@mail.md";
    kitchenAnswers(() => ({
      body: wireDraftKitchen({
        client: { email: typed, name: null, phone: null },
      }),
    }));

    await mount("ro");

    expect(requireIn(page(), "header p").textContent).toContain(
      `\u2068${typed}\u2069`,
    );
  });
});
