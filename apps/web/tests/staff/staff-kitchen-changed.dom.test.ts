// @vitest-environment happy-dom
//
// The kitchen page of a sent kitchen the client changed after staff saw it (frame D10B): opening it marks it seen once,
// with the revision the page displayed; the "Trimisă" / "Actuală" switch chooses the copy the picture, the cabinet list and
// the summary show; and the two estimates say what each is, or why there is none, and never draw a zero. The server is a
// stand-in for `fetch`; the 3D canvas is a stub; the words are the shipped catalogue's.
import { createTranslator } from "next-intl";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatRelativeAge } from "@/account/kitchens/relative-age";
import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { shopRelativeAgeOf } from "@/staff/staff-kitchen-dates";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
  resolveStaffSessionExpired,
} from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import {
  STAFF_KITCHEN_ID,
  WIRE_DESIGN,
  wireDraftKitchen,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import {
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  type RecordedRequest,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const canvases = vi.hoisted(() => ({ viewOnlyMounts: 0 }));

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
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
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const NOW = "2026-10-21T12:00:00.000Z";
/** The fixture's `updatedAt`, which the page tells "modified" against `NOW`. */
const UPDATED_AT = "2026-10-19T09:00:00.000Z";
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
const SEEN_ADDRESS = `${KITCHEN_ADDRESS}/seen`;
const DISPLAYED_REVISION = "7";
const FEWER_BODIES = 3;
const FEWER_BODIES_DESIGN: unknown = {
  ...(WIRE_DESIGN as { placements: unknown[] }),
  placements: (WIRE_DESIGN as { placements: unknown[] }).placements.slice(
    0,
    FEWER_BODIES,
  ),
};
const BODIES_ADDED =
  (WIRE_DESIGN as { placements: unknown[] }).placements.length - FEWER_BODIES;

let screen: MountedScreen | undefined;
let server: StaffKitchensServer;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  canvases.viewOnlyMounts = 0;
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

/** A sent kitchen whose copy as sent holds fewer bodies than the document does now, as the server writes it. */
function changedKitchen(
  members: Parameters<typeof wireKitchen>[0] = {},
): Record<string, unknown> {
  return wireKitchen({
    changedAfterSeen: true,
    displayedRevision: DISPLAYED_REVISION,
    kitchen: { asSent: FEWER_BODIES_DESIGN },
    ...members,
  });
}

function answers(
  kitchen: Record<string, unknown>,
  seen: ServerAnswer | "hold" = { body: { changedAfterSeen: false } },
): void {
  server.script((request) => {
    if (request.url.pathname === SEEN_ADDRESS) return seen;
    if (request.url.pathname === KITCHEN_ADDRESS) return { body: kitchen };
    return {
      body: {
        state: "signed-in",
        email: CONTEXT.email,
        capabilities: ["design.read.any", "account.manage.own"],
      },
    };
  });
}

function bodyOf(request: RecordedRequest | undefined): string {
  const body = request?.init.body;
  return typeof body === "string" ? body : "";
}

function seenRequests(): RecordedRequest[] {
  return server.requests.filter(({ url }) => url.pathname === SEEN_ADDRESS);
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
}

async function mount(locale: TestLocale): Promise<void> {
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

function textOf(testId: string): string {
  return requireIn(container(), `[data-testid="${testId}"]`).textContent;
}

function has(testId: string): boolean {
  return container().querySelector(`[data-testid="${testId}"]`) !== null;
}

function versionChoices(): HTMLInputElement[] {
  return allIn<HTMLInputElement>(
    container(),
    '[data-testid="staff-kitchen-versions"] input',
  );
}

function cabinetChanges(): string[] {
  return allIn(container(), '[data-testid="staff-kitchen-cabinet"]').map(
    (row) => row.dataset.change ?? "",
  );
}

describe.each(LOCALES)(
  "the kitchen page of a changed kitchen in %s",
  (locale) => {
    const changes = CATALOGUES[locale].staffChanges;
    const kitchen = CATALOGUES[locale].staffKitchen;
    const sayOfChanges = createTranslator({
      locale,
      messages: CATALOGUES[locale] as typeof roMessages,
      namespace: "staffChanges",
    });

    describe("opening it marks it seen", () => {
      it("sends one mark with the displayed revision, as JSON, and says the status did not change", async () => {
        answers(changedKitchen());

        await mount(locale);

        expect(seenRequests()).toHaveLength(1);
        const [mark] = seenRequests();
        expect(mark?.init.method).toBe("POST");
        expect(JSON.parse(bodyOf(mark))).toEqual({
          displayedRevision: DISPLAYED_REVISION,
        });
        expect(textOf("staff-kitchen-seen-notice")).toBe(changes.markedSeen);
      });

      it("changes no status: opening the page asks for the kitchen, marks it seen and makes no other request of it", async () => {
        answers(changedKitchen());

        await mount(locale);

        const paths = server.requests
          .map(({ url }) => url.pathname)
          .filter((path) => path.startsWith(KITCHEN_ADDRESS));
        expect(paths.sort()).toEqual([KITCHEN_ADDRESS, SEEN_ADDRESS].sort());
        expect(
          server.requests.filter(({ init }) => init.method === "PUT"),
        ).toHaveLength(0);
      });

      it("sends no mark for a kitchen that does not read as changed, and says nothing", async () => {
        answers(wireKitchen({ changedAfterSeen: false }));

        await mount(locale);

        expect(seenRequests()).toHaveLength(0);
        expect(textOf("staff-kitchen-seen-notice")).toBe("");
      });

      it("sends no mark for a draft", async () => {
        answers(wireDraftKitchen());

        await mount(locale);

        expect(seenRequests()).toHaveLength(0);
      });

      it("says the client saved again meanwhile when the mark answers that it still reads as changed", async () => {
        answers(changedKitchen(), { body: { changedAfterSeen: true } });

        await mount(locale);

        expect(textOf("staff-kitchen-seen-notice")).toBe(
          changes.changedWhileOpen,
        );
      });

      it("says the mark was not made, and does not send it again, when the server is not there", async () => {
        answers(changedKitchen(), UNAVAILABLE_ANSWER);

        await mount(locale);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60_000);
        });

        expect(seenRequests()).toHaveLength(1);
        expect(textOf("staff-kitchen-seen-notice")).toBe(
          changes.markSeenFailed,
        );
      });

      it("asks for the session sheet on a 401 and sends the mark again once the person has signed in", async () => {
        answers(changedKitchen(), UNAUTHENTICATED_ANSWER);
        await mount(locale);
        expect(getStaffSessionExpiry()).toBeDefined();
        expect(seenRequests()).toHaveLength(1);
        expect(textOf("staff-kitchen-seen-notice")).toBe("");

        answers(changedKitchen());
        act(() => {
          resolveStaffSessionExpired();
        });
        await settle();

        expect(seenRequests()).toHaveLength(2);
        expect(textOf("staff-kitchen-seen-notice")).toBe(changes.markedSeen);
      });
    });

    describe("the two estimates", () => {
      const FIGURE_OF_SENT = /59.000/u;
      const FIGURE_OF_CURRENT = /62.000/u;

      it("states what the notice carried and what the kitchen is priced at now, each with its own label", async () => {
        answers(changedKitchen());

        await mount(locale);

        const sent = textOf("staff-kitchen-estimate-sent");
        const current = textOf("staff-kitchen-estimate-current");
        expect(sent).toContain(changes.estimateSent);
        expect(sent).toMatch(FIGURE_OF_SENT);
        expect(current).toContain(changes.estimateCurrent);
        expect(current).toMatch(FIGURE_OF_CURRENT);
      });

      it("tells why the kitchen has no current estimate, in the words of its refusal and with no figure", async () => {
        answers(
          changedKitchen({
            currentEstimate: { refused: "INVALID_PRICE_BOOK" },
          }),
        );

        await mount(locale);

        const current = textOf("staff-kitchen-estimate-current");
        expect(current).toContain(changes.estimateRefusedUnavailable);
        expect(current).not.toMatch(/\d/u);
        expect(textOf("staff-kitchen-estimate-sent")).toMatch(FIGURE_OF_SENT);
      });

      it.each([
        ["UNKNOWN_BODY", changes.estimateRefusedUnreadable],
        ["NO_RULE_FOR_BODY", changes.estimateRefusedNotPriceable],
        ["REPLACEMENT_REQUIRED", changes.estimateRefusedReplacement],
      ])("words %s as its own sentence", async (code, sentence) => {
        answers(changedKitchen({ currentEstimate: { refused: code } }));

        await mount(locale);

        expect(textOf("staff-kitchen-estimate-current")).toContain(sentence);
      });

      it("says the kitchen has no cabinets, and draws no figure, when the current estimate is empty", async () => {
        answers(changedKitchen({ currentEstimate: { empty: true } }));

        await mount(locale);

        const current = textOf("staff-kitchen-estimate-current");
        expect(current).toContain(changes.estimateEmpty);
        expect(current).not.toMatch(/\d/u);
        expect(current).not.toContain("MDL");
      });

      it("says the request kept no estimate rather than drawing one, when the sent estimate is missing", async () => {
        answers(changedKitchen({ sentEstimate: null }));

        await mount(locale);

        const sent = textOf("staff-kitchen-estimate-sent");
        expect(sent).toContain(changes.estimateSentMissing);
        expect(sent).not.toMatch(/\d/u);
      });

      it("has no estimates for a draft, and the summary keeps its own starting price there", async () => {
        answers(wireDraftKitchen());

        await mount(locale);

        expect(has("staff-kitchen-estimates")).toBe(false);
        expect(
          container().querySelector(
            '[data-testid="staff-kitchen-summary"] [data-fact="price"]',
          ),
        ).not.toBeNull();
      });

      it("is the page's one price surface for a sent kitchen: the summary states none beside it", async () => {
        answers(changedKitchen());

        await mount(locale);

        expect(has("staff-kitchen-estimates")).toBe(true);
        expect(
          container().querySelector(
            '[data-testid="staff-kitchen-summary"] [data-fact="price"]',
          ),
        ).toBeNull();
      });
    });

    describe("the version switch", () => {
      it("opens a changed kitchen on the current copy, with the two copies named by their day and age", async () => {
        answers(changedKitchen());

        await mount(locale);

        const [sent, current] = versionChoices();
        expect(versionChoices()).toHaveLength(2);
        expect(sent?.checked).toBe(false);
        expect(current?.checked).toBe(true);
        expect(textOf("staff-kitchen-versions")).toContain(
          changes.versionLabel,
        );
        expect(textOf("staff-kitchen-summary")).toContain(
          kitchen.summaryTitleCurrent,
        );
        expect(textOf("staff-kitchen-versions")).toContain(
          sayOfChanges("versionSent", { date: "17.10.2026" }),
        );
      });

      it("opens a kitchen the person has seen on the copy as sent, and the switch still offers the other", async () => {
        answers(changedKitchen({ changedAfterSeen: false }));

        await mount(locale);

        const [sent] = versionChoices();
        expect(sent?.checked).toBe(true);
        expect(textOf("staff-kitchen-summary")).toContain(
          kitchen.summaryTitleSent,
        );
      });

      it("draws the other copy's summary, and a new picture of it, when the other choice is pressed", async () => {
        answers(changedKitchen());
        await mount(locale);
        const mountsBefore = canvases.viewOnlyMounts;

        const [sent] = versionChoices();
        click(
          requireIn(
            container(),
            `[data-testid="staff-kitchen-versions"] input[value="sent"]`,
          ),
        );
        await settle();

        expect(sent?.checked).toBe(true);
        expect(textOf("staff-kitchen-summary")).toContain(
          kitchen.summaryTitleSent,
        );
        expect(canvases.viewOnlyMounts).toBeGreaterThan(mountsBefore);
        expect(has("staff-kitchen-current-variant")).toBe(false);
      });

      it("marks the bodies only the current copy holds as new, and the rest as the same, whichever copy is shown", async () => {
        answers(changedKitchen());
        await mount(locale);
        const expected = [
          ...Array.from({ length: FEWER_BODIES }, () => "same"),
          ...Array.from({ length: BODIES_ADDED }, () => "added"),
        ];

        expect([...cabinetChanges()].sort()).toEqual([...expected].sort());
        click(
          requireIn(
            container(),
            `[data-testid="staff-kitchen-versions"] input[value="sent"]`,
          ),
        );
        await settle();

        expect([...cabinetChanges()].sort()).toEqual([...expected].sort());
        expect(textOf("staff-kitchen-cabinets")).toContain(
          changes.highlightNote,
        );
        expect(textOf("staff-kitchen-cabinets")).toContain(changes.rowAdded);
      });

      it("marks a body the client took out as removed", async () => {
        answers(
          changedKitchen({
            kitchen: { design: FEWER_BODIES_DESIGN, asSent: WIRE_DESIGN },
          }),
        );

        await mount(locale);

        expect(
          cabinetChanges().filter((change) => change === "removed"),
        ).toHaveLength(BODIES_ADDED);
        expect(textOf("staff-kitchen-cabinets")).toContain(changes.rowRemoved);
      });

      it("draws no switch when the two copies are the same kitchen", async () => {
        answers(changedKitchen({ kitchen: { asSent: WIRE_DESIGN } }));

        await mount(locale);

        expect(has("staff-kitchen-versions")).toBe(false);
        expect(has("staff-kitchen-cabinets")).toBe(false);
      });

      it("marks a setting that differs between the copies, and says what the sent copy had only beside the current one", async () => {
        const room = (WIRE_DESIGN as { room: { widthMm: number } }).room;
        const widerRoom = {
          ...(WIRE_DESIGN as object),
          room: { ...room, widthMm: room.widthMm + 100 },
        };
        answers(
          changedKitchen({
            kitchen: { design: widerRoom, asSent: WIRE_DESIGN },
          }),
        );
        await mount(locale);
        const differing = () =>
          allIn(
            container(),
            '[data-testid="staff-kitchen-summary"] [data-differs]',
          );

        expect(differing().map((fact) => fact.dataset.fact)).toEqual(["walls"]);
        expect(differing()[0]?.textContent).toContain(changes.rowDiffers);
        expect(differing()[0]?.textContent).toContain(
          sayOfChanges("rowWasInSent", { value: "" }).split(":")[0] ?? "",
        );
        expect(cabinetChanges().every((change) => change === "same")).toBe(
          true,
        );

        click(
          requireIn(
            container(),
            '[data-testid="staff-kitchen-versions"] input[value="sent"]',
          ),
        );
        await settle();

        expect(differing().map((fact) => fact.dataset.fact)).toEqual(["walls"]);
        expect(differing()[0]?.textContent).toContain(changes.rowDiffers);
        expect(differing()[0]?.textContent).not.toContain(
          sayOfChanges("rowWasInSent", { value: "" }).split(":")[0] ?? "",
        );
      });

      it("marks no setting when the copies share them", async () => {
        answers(changedKitchen());

        await mount(locale);

        expect(
          allIn(
            container(),
            '[data-testid="staff-kitchen-summary"] [data-differs]',
          ),
        ).toHaveLength(0);
      });

      it("says the cabinet list cannot be shown, and keeps the rest, when a body of the current copy is one no catalogue holds", async () => {
        const unknownBody = {
          ...(WIRE_DESIGN as { placements: { body: object }[] }),
          placements: (
            WIRE_DESIGN as { placements: { body: object }[] }
          ).placements.map((placement, index) =>
            index === 0
              ? {
                  ...placement,
                  body: {
                    ...placement.body,
                    buildId: "a-body-no-catalogue-holds",
                  },
                }
              : placement,
          ),
        };
        answers(
          changedKitchen({
            changedAfterSeen: false,
            kitchen: { design: unknownBody },
          }),
        );

        await mount(locale);

        expect(textOf("staff-kitchen-cabinets")).toBe(
          changes.cabinetsUnavailable,
        );
        expect(has("staff-kitchen-versions")).toBe(true);
        expect(has("staff-kitchen-estimates")).toBe(true);
      });

      it("draws no switch when the copy as sent cannot be read", async () => {
        answers(changedKitchen({ kitchen: { asSent: null } }));

        await mount(locale);

        expect(has("staff-kitchen-versions")).toBe(false);
        expect(has("staff-kitchen-view")).toBe(true);
      });

      it("says what the sub-line says of a changed kitchen: sent by, the day, and when it was modified", async () => {
        answers(changedKitchen());

        await mount(locale);

        expect(requireIn(container(), "h1 + p").textContent).toBe(
          sayOfChanges("subSentModified", {
            email: "\u2068ana.popescu@mail.md\u2069",
            date: "17.10.2026",
            when: formatRelativeAge(
              locale,
              shopRelativeAgeOf(Date.parse(UPDATED_AT), Date.parse(NOW)),
            ),
          }),
        );
      });
    });
  },
);
