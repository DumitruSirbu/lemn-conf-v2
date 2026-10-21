// @vitest-environment happy-dom
//
// The staff kitchen page over every combination of what a kitchen can be (wave L3-U3): sent or draft, hidden or not, a client
// with a full profile, a bare one or none, a request or none, the two documents (as sent, current) readable or not, and the
// status unset, listed or unrecognised; notes empty, a hundred, or truncated. The expected words are worked out from the
// combination here, never read back from the page, so a rule implemented plausibly and wrongly fails on the combination that
// tells it from the right one. Romanian and Russian are both walked.
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatRelativeAge,
  relativeAgeOf,
} from "@/account/kitchens/relative-age";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { allIn, requireIn, type TestLocale } from "../support/render-with-intl";
import {
  WIRE_DESIGN,
  wireChangedStatus,
  wireKitchen,
} from "../support/staff-kitchen-wire";

import {
  NOW,
  PAGE,
  resetSharedStores,
  setUpScreenHarness,
  type ScreenHarness,
} from "./qa-l3-u3-harness.adversarial";

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
      return element("canvas");
    },
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const SENT_AT = "2026-10-17T11:08:00.000Z";
const SENT_DAY = "17.10.2026";
const UPDATED_AT = "2026-10-19T09:00:00.000Z";
const SMALL_BODY_COUNT = 3;
const WHOLE_BODY_COUNT = 26;
const NOTES_AT_THE_LIMIT = 100;
const UNREADABLE_DOCUMENT = { room: "?" };

const WHOLE_DESIGN = WIRE_DESIGN;
const SMALL_DESIGN: unknown = {
  ...(WIRE_DESIGN as { placements: unknown[] }),
  placements: (WIRE_DESIGN as { placements: unknown[] }).placements.slice(
    0,
    SMALL_BODY_COUNT,
  ),
};

type Clients = "full" | "bare" | "none";
type Documents = "both" | "current-only" | "as-sent-only" | "neither";
type Statuses = "none" | "listed" | "unrecognised";
type NoteLoad = "none" | "hundred" | "truncated";

interface Combination {
  readonly isSent: boolean;
  readonly isHidden: boolean;
  readonly client: Clients;
  readonly hasRequest: boolean;
  readonly documents: Documents;
  readonly status: Statuses;
  readonly notes: NoteLoad;
}

const IS_SENT = [true, false] as const;
const CLIENTS: readonly Clients[] = ["full", "bare", "none"];
const DOCUMENTS: readonly Documents[] = [
  "both",
  "current-only",
  "as-sent-only",
  "neither",
];
const STATUSES: readonly Statuses[] = ["none", "listed", "unrecognised"];
const NOTE_LOADS: readonly NoteLoad[] = ["none", "hundred", "truncated"];

function everyCombination(notes: readonly NoteLoad[]): Combination[] {
  const combinations: Combination[] = [];
  for (const isSent of IS_SENT) {
    for (const isHidden of IS_SENT) {
      for (const client of CLIENTS) {
        for (const hasRequest of IS_SENT) {
          for (const documents of DOCUMENTS) {
            for (const status of STATUSES) {
              for (const load of notes) {
                combinations.push({
                  isSent,
                  isHidden,
                  client,
                  hasRequest,
                  documents,
                  status,
                  notes: load,
                });
              }
            }
          }
        }
      }
    }
  }
  return combinations;
}

function labelOf(combination: Combination): string {
  return JSON.stringify(combination);
}

function notesOf(load: NoteLoad): unknown[] {
  if (load === "none") return [];
  return Array.from({ length: NOTES_AT_THE_LIMIT }, (_, index) => ({
    id: `note-${String(index)}`,
    text: `Nota ${String(index)}`,
    createdAt: SENT_AT,
    author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
  }));
}

function clientOf(client: Clients): unknown {
  if (client === "none") return null;
  return client === "full"
    ? { email: "ana.popescu@mail.md", name: "Ana Popescu", phone: "078900555" }
    : { email: "bare@mail.md", name: null, phone: null };
}

function statusOf(status: Statuses): unknown {
  if (status === "none") return null;
  return wireChangedStatus(
    status === "listed" ? "contacted" : "a-word-from-a-future-build",
  );
}

function wireOf(combination: Combination): Record<string, unknown> {
  const hasCurrent =
    combination.documents === "both" ||
    combination.documents === "current-only";
  const hasAsSent =
    combination.documents === "both" ||
    combination.documents === "as-sent-only";
  return wireKitchen({
    kitchen: {
      isSent: combination.isSent,
      sentAt: combination.isSent ? SENT_AT : null,
      isHidden: combination.isHidden,
      updatedAt: UPDATED_AT,
      design: hasCurrent ? WHOLE_DESIGN : UNREADABLE_DOCUMENT,
      asSent: hasAsSent ? SMALL_DESIGN : null,
    },
    client: clientOf(combination.client),
    request: combination.hasRequest
      ? { reference: "LEM-2026-0417", sentAt: SENT_AT }
      : null,
    status: statusOf(combination.status),
    notes: notesOf(combination.notes),
    notesTruncated: combination.notes === "truncated",
  });
}

interface Expectation {
  readonly shown: "as-sent" | "current" | "none";
  readonly bodyCount: number | undefined;
}

function expectationOf(combination: Combination): Expectation {
  if (
    combination.documents === "both" ||
    combination.documents === "as-sent-only"
  ) {
    return { shown: "as-sent", bodyCount: SMALL_BODY_COUNT };
  }
  return combination.documents === "current-only"
    ? { shown: "current", bodyCount: WHOLE_BODY_COUNT }
    : { shown: "none", bodyCount: undefined };
}

let harness: ScreenHarness;

beforeEach(() => {
  canvases.viewOnlyMounts = 0;
  canvases.editorMounts = 0;
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
});

function has(testId: string): boolean {
  return (
    harness.container().querySelector(`[data-testid="${testId}"]`) !== null
  );
}

function textOf(testId: string): string {
  return requireIn(harness.container(), `[data-testid="${testId}"]`)
    .textContent;
}

describe.each(LOCALES)(
  "every kitchen the page can be handed, in %s",
  (locale) => {
    const words = CATALOGUES[locale].staffKitchen;
    const lists = CATALOGUES[locale].staffKitchens;
    const say = createTranslator({
      locale,
      messages: CATALOGUES[locale] as typeof roMessages,
      namespace: "staffKitchen",
    });
    const summaryPrice = (container: HTMLElement): string =>
      requireIn(container, '[data-fact="price"] dd').textContent;

    async function drawEach(
      combinations: readonly Combination[],
      check: (combination: Combination) => void,
    ): Promise<void> {
      for (const combination of combinations) {
        canvases.viewOnlyMounts = 0;
        harness.answers(() => ({ body: wireOf(combination) }));
        await harness.mount({ locale });
        try {
          check(combination);
        } catch (failure) {
          throw new Error(
            `${labelOf(combination)}: ${failure instanceof Error ? failure.message : String(failure)}`,
            { cause: failure },
          );
        }
        harness.unmount();
        resetSharedStores();
      }
    }

    it("draws without a failure, one title, one way back, the caption, no editor, no link to write or to call", async () => {
      await drawEach(everyCombination(["none"]), () => {
        const container = harness.container();
        const page = requireIn(container, PAGE);

        expect(allIn(container, "h1")).toHaveLength(1);
        expect(allIn(page, "a")).toHaveLength(1);
        expect(page.textContent).toContain(words.accessLogged);
        expect(canvases.editorMounts).toBe(0);
        expect(
          allIn(container, "a[href^='mailto:' i], a[href^='tel:' i]"),
        ).toHaveLength(0);
        expect(allIn(page, "select, textarea, input")).toHaveLength(0);
        expect(requireIn(page, "h1").textContent).toBe("Casa din Orhei");
        expect(has("staff-kitchen-skeleton")).toBe(false);
      });
    });

    it("labels the picture 'current variant' only for a request whose copy as sent is missing, and the summary by the copy it describes", async () => {
      await drawEach(everyCombination(["none"]), (combination) => {
        const { shown } = expectationOf(combination);
        const isCurrentVariant = shown === "current" && combination.hasRequest;

        expect(has("staff-kitchen-current-variant")).toBe(isCurrentVariant);
        expect(has("staff-kitchen-view")).toBe(shown !== "none");
        expect(has("staff-kitchen-cannot-show")).toBe(shown === "none");
        expect(has("staff-kitchen-summary")).toBe(shown !== "none");
        if (shown === "none") return;
        expect(
          requireIn(harness.container(), "#staff-kitchen-summary-title")
            .textContent,
        ).toBe(
          shown === "as-sent"
            ? words.summaryTitleSent
            : words.summaryTitleCurrent,
        );
        const page = harness.container().textContent;
        const otherTitle =
          shown === "as-sent"
            ? words.summaryTitleCurrent
            : words.summaryTitleSent;
        expect(page).not.toContain(otherTitle);
        expect(page.includes(words.viewCurrent)).toBe(isCurrentVariant);
      });
    });

    it("describes, prices and draws the copy it says it shows and not the other one", async () => {
      const priceOfSmall: string[] = [];
      const priceOfWhole: string[] = [];
      harness.answers(() => ({
        body: wireOf({
          isSent: true,
          isHidden: false,
          client: "full",
          hasRequest: true,
          documents: "as-sent-only",
          status: "none",
          notes: "none",
        }),
      }));
      await harness.mount({ locale });
      priceOfSmall.push(summaryPrice(harness.container()));
      harness.unmount();
      harness.answers(() => ({
        body: wireOf({
          isSent: true,
          isHidden: false,
          client: "full",
          hasRequest: true,
          documents: "current-only",
          status: "none",
          notes: "none",
        }),
      }));
      await harness.mount({ locale });
      priceOfWhole.push(summaryPrice(harness.container()));
      harness.unmount();
      resetSharedStores();
      expect(priceOfSmall[0]).not.toBe(priceOfWhole[0]);

      await drawEach(everyCombination(["none"]), (combination) => {
        const { shown, bodyCount } = expectationOf(combination);
        if (shown === "none") return;
        const container = harness.container();

        expect(
          requireIn(container, '[data-fact="bodies"] dd').textContent,
        ).toBe(String(bodyCount));
        expect(summaryPrice(container)).toBe(
          shown === "as-sent" ? priceOfSmall[0] : priceOfWhole[0],
        );
        expect(useConfiguratorStore.getState().design.placements).toHaveLength(
          bodyCount ?? -1,
        );
        expect(useConfiguratorStore.getState().canWrite).toBe(false);
        expect(canvases.viewOnlyMounts).toBeGreaterThan(0);
      });
    });

    it("shows the status of a sent kitchen as the word it is, a dash for none, and never as 'new' unless it is", async () => {
      await drawEach(everyCombination(["none"]), (combination) => {
        expect(has("staff-kitchen-status")).toBe(combination.isSent);
        expect(has("staff-kitchen-no-status")).toBe(!combination.isSent);
        if (!combination.isSent) {
          expect(textOf("staff-kitchen-no-status")).toBe(words.draftNoStatus);
          return;
        }
        const card = requireIn(
          harness.container(),
          '[data-testid="staff-kitchen-status"]',
        );
        const badge = card.querySelector('[data-kind="status"]');
        if (combination.status === "none") {
          expect(badge).toBeNull();
          expect(card.textContent).toContain(lists.noValue);
          expect(card.textContent).not.toContain(lists.statusNew);
          expect(has("staff-kitchen-last-change")).toBe(false);
          return;
        }
        const expected =
          combination.status === "listed"
            ? { word: lists.statusContacted, code: "contacted" }
            : { word: lists.statusUnrecognised, code: "unrecognised" };
        expect(badge?.textContent).toBe(expected.word);
        expect(badge?.getAttribute("data-status")).toBe(expected.code);
        expect(card.textContent).not.toContain(lists.statusNew);
        expect(has("staff-kitchen-last-change")).toBe(true);
      });
    });

    it("draws the request card, the profile and the banner exactly when the facts are there", async () => {
      await drawEach(everyCombination(["none"]), (combination) => {
        expect(has("staff-kitchen-request")).toBe(combination.hasRequest);
        if (combination.hasRequest) {
          expect(textOf("staff-kitchen-request")).toContain(
            say("requestLine", {
              reference: "LEM-2026-0417",
              date: new Intl.DateTimeFormat(locale, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
                timeZone: "Europe/Chisinau",
              }).format(new Date(SENT_AT)),
            }),
          );
          expect(textOf("staff-kitchen-request")).toContain(
            words.requestContactNote,
          );
        }
        expect(has("staff-kitchen-hidden-banner")).toBe(combination.isHidden);
        if (combination.isHidden) {
          expect(textOf("staff-kitchen-hidden-banner")).toBe(
            words.hiddenBanner,
          );
        }
        const profile = textOf("staff-kitchen-profile");
        expect(profile).toContain(words.profileTitle);
        expect(profile.includes(lists.noAccount)).toBe(
          combination.client === "none",
        );
        expect(profile.includes("@")).toBe(combination.client !== "none");
        expect(profile.includes(lists.phoneUnverified)).toBe(
          combination.client === "full",
        );
        if (combination.client === "full") {
          expect(profile).toContain("078900555");
        }
      });
    });

    it("tells the owner and the day on the line under the title, by whether it was sent and whether it has an account", async () => {
      await drawEach(everyCombination(["none"]), (combination) => {
        const sub = requireIn(harness.container(), "header p").textContent;
        const email =
          combination.client === "full"
            ? "ana.popescu@mail.md"
            : "bare@mail.md";
        const when = formatRelativeAge(
          locale,
          relativeAgeOf(Date.parse(UPDATED_AT), Date.parse(NOW)),
        );
        let expected: string;
        if (combination.isSent) {
          expected =
            combination.client === "none"
              ? say("subSentNoAccount", { date: SENT_DAY })
              : say("subSent", { email, date: SENT_DAY });
        } else {
          expected =
            combination.client === "none"
              ? say("subDraftNoAccount", { when })
              : say("subDraft", { email, when });
        }
        expect(sub).toBe(expected);
      });
    });

    it("shows the notes no way yet whatever they hold, and draws no field, select or button but the camera's", async () => {
      await drawEach(
        everyCombination(NOTE_LOADS).filter(
          (combination) =>
            combination.notes !== "none" &&
            combination.client === "full" &&
            combination.documents === "both",
        ),
        () => {
          const page = requireIn(harness.container(), PAGE);

          expect(allIn(page, "select, textarea, input")).toHaveLength(0);
          for (const button of allIn(page, "button")) {
            expect(button.closest('[role="group"]')).not.toBeNull();
          }
          expect(page.textContent).not.toContain("Nota 0");
          expect(
            page.querySelector('[data-slot="staff-kitchen-notes"]')
              ?.textContent,
          ).toBe("");
        },
      );
    });

    it("is the same page for the same kitchen asked twice", async () => {
      const combination = everyCombination(["none"])[0];
      if (combination === undefined) throw new Error("no combination");
      harness.answers(() => ({ body: wireOf(combination) }));
      await harness.mount({ locale });
      const first = harness.container().innerHTML;
      harness.unmount();
      resetSharedStores();
      await harness.mount({ locale });

      expect(harness.container().innerHTML).toBe(first);
    });
  },
);
