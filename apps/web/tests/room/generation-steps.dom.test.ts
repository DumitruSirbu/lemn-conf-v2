// @vitest-environment happy-dom
//
// **The class each row status is drawn with, taken off the DOM and required of the stylesheet** —
// M7 wave 7F4a, ruling R10.
//
// **The failure this file exists for.** `generation-steps.tsx`'s `ROW_STATUS_CLASS` satisfies
// `Record<GenerationRowStatus, string | undefined>`, because a CSS module's exports are typed
// `string | undefined`. Rename or drop `.composeRowDropped` in `room.module.css` and the
// `not_placed` entry becomes `undefined` — no compile error, `classNames` filters it out, and the
// dropped row silently loses its dashed border, its muted background and its `−` glyph. The one
// R10 assertion that existed before this file (`room-composition.dom.test.ts:517`) is
// `expect(fridge.className).not.toContain("strike")`, which is **negative**: it passes more easily
// once the class is gone.
//
// **Why the assertion is not `expect(styles.composeRowDropped).toBeDefined()`, measured rather than
// assumed.** `vitest.config.ts` does not enable CSS processing, so a `.module.css` import resolves
// to a stub that fabricates a name for **any** property: `styles.composeRowDropped` and
// `styles.thisClassDoesNotExist` are both `"_<key>_<hash>"` strings here. A presence check — in the
// module or in the DOM — is therefore vacuous on its own. What is not vacuous is the pair: the class
// the row **actually renders with**, read off the DOM, and `room.module.css`'s own text, read by
// path exactly as `plan-preview.dom.test.ts:45` reads it. A class the stylesheet stopped declaring
// fails that pairing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fc } from "@fast-check/vitest";
import {
  generateKitchen,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  pendingGenerationRows,
  resolveGenerationRows,
  type GenerationRowStatus,
} from "@/room/generation-model";
import { GenerationSteps } from "@/room/generation-steps";
import type { ActiveGenerationRun } from "@/room/use-generation";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import type { Catalogue, CatalogueLocale } from "../support/catalogues";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-14T09:00:00.000Z";

/** The owner's smallest accepted room (ADR 0108 Amendment E). It is the one room that puts both
 *  resolved statuses on the glass at once: the sink and the hob are placed, and neither the fridge
 *  nor any storage cabinet has a wall to stand on. */
const SMALLEST_ACCEPTED_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 900,
  depthMm: 2200,
  heightMm: 2200,
};

/** Read by path rather than through `new URL(…, import.meta.url)`: under `happy-dom` the module URL
 *  is not a `file:` one (`room-url-round-trip.dom.test.ts:166-168`). */
const roomStylesheet = readFileSync(
  resolve(import.meta.dirname, "../../src/room/room.module.css"),
  "utf8",
);

const ROW_STATUSES: readonly GenerationRowStatus[] = [
  "pending",
  "placed",
  "not_placed",
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** A locale and the catalogue it renders with. */
interface RenderLocale {
  readonly locale: CatalogueLocale;
  readonly messages: Catalogue;
}

const ROMANIAN: RenderLocale = { locale: "ro", messages: roMessages };
// The same cast `room-composition.dom.test.ts` makes: `Catalogue` is typed from `ro.json`, and
// catalogue parity is what holds `ru.json` to its shape.
const RUSSIAN: RenderLocale = {
  locale: "ru",
  messages: ruMessages as Catalogue,
};

function renderRun(
  run: ActiveGenerationRun,
  { locale, messages }: RenderLocale = ROMANIAN,
): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(GenerationSteps, {
          run,
          onBack: () => undefined,
          onRetry: () => undefined,
        }),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

/** The list as it is painted before `generateKitchen` is entered: six rows, all pending. */
function composingRun(): ActiveGenerationRun {
  return {
    phase: "composing",
    room: SMALLEST_ACCEPTED_ROOM,
    rows: pendingGenerationRows(),
  };
}

/** A genuinely generated run rather than a hand-written one, so the two resolved statuses below are
 *  the statuses the engine really produces for this room and not a fixture's opinion of them.
 *
 *  Returned as the composed member rather than the whole union, so `failedHandoffRun` can spread it
 *  and move `handoff` without the compiler losing which member it is holding. */
function composedRun(
  room: DesignRoom = SMALLEST_ACCEPTED_ROOM,
): Extract<ActiveGenerationRun, { phase: "composed" }> {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) {
    throw new Error(
      `${String(room.widthMm)} × ${String(room.depthMm)} no longer composes`,
    );
  }
  return {
    phase: "composed",
    room,
    rows: resolveGenerationRows(result.log),
    design: result.design,
    log: result.log,
    // The hand-off's two fields, which this file has no opinion about: it reads row classes and the
    // notice band. `saving` is the state a composition is in the instant it exists.
    //
    // **The attempt throws synchronously rather than returning a rejected promise** (wave 7F4b's
    // review, finding F9): nothing here runs it, and a rejected promise nobody awaited would surface
    // in whatever test happened to be running when it was collected — as an unhandled rejection
    // rather than as this file saying what it does not do.
    attempt: {
      run: () => {
        throw new Error(
          "generation-steps.dom.test.ts renders hand-off states; it never performs one",
        );
      },
    },
    handoff: "saving",
  };
}

/** A composed kitchen whose write was refused — the state QA finding F4 is about. The rows above it
 *  are true and complete; what failed is the hand-off. */
function failedHandoffRun(): ActiveGenerationRun {
  return { ...composedRun(), handoff: "failed" };
}

/** A composition that did not finish. It carries no rows at all, by construction of the type. */
function failedRun(): ActiveGenerationRun {
  return { phase: "failed", room: SMALLEST_ACCEPTED_ROOM };
}

function noticeBand(): HTMLElement {
  const band = container.querySelector<HTMLElement>(
    '[data-testid="room-compose-notice"]',
  );
  if (band === null) throw new Error("1F drew no notice band");
  return band;
}

/** A mutation a live region actually reads out. `aria-relevant` defaults to *additions text*, so the
 *  spinner leaving the band when the run settles is **not** announced and is not counted here. */
function isAnnounceable(record: MutationRecord): boolean {
  return record.type === "characterData" || record.addedNodes.length > 0;
}

/**
 * Everything the notice band did across one transition, announceable or not.
 *
 * Records are drained with `takeRecords`, because a `MutationObserver` callback is a microtask and
 * `act` has already returned by the time one would run.
 *
 * **The identity check is what stops this from passing over nothing.** If React ever replaced the
 * band instead of updating it, the observer would be watching a detached node, every assertion below
 * would read zero mutations, and the silent-happy-path test would pass for the wrong reason — while
 * the real region would be a freshly mounted one, which is the shape that gets announced late or not
 * at all.
 *
 * **Unfiltered on purpose** (wave 7F4b's review, finding F2). The silent transition is silent
 * because `aria-relevant` defaults to *additions text* and the one mutation there is a **removal**;
 * a helper that filtered before returning let that test assert `toHaveLength(0)` over a filtered-out
 * removal and over an observer that saw nothing at all, which are not the same claim.
 */
function mutationsAcross(
  from: ActiveGenerationRun,
  to: ActiveGenerationRun,
): readonly MutationRecord[] {
  renderRun(from);
  const observed = noticeBand();
  const observer = new MutationObserver(() => undefined);
  observer.observe(observed, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  renderRun(to);
  const records = observer.takeRecords();
  observer.disconnect();
  if (noticeBand() !== observed) {
    throw new Error("the notice band was remounted rather than updated");
  }
  return records;
}

/** What a screen reader would actually be read out of one transition's mutations. */
function announceableIn(
  records: readonly MutationRecord[],
): readonly MutationRecord[] {
  return records.filter(isAnnounceable);
}

/** Every class token the rows of one render carry, keyed by the status the row is in. The two
 *  renders together cover all three statuses; no single run can, because a composing list is wholly
 *  pending and a settled one holds none (ruling R12). */
function classTokensByStatus(): ReadonlyMap<string, readonly string[]> {
  const byStatus = new Map<string, readonly string[]>();
  for (const run of [composingRun(), composedRun()]) {
    renderRun(run);
    for (const row of container.querySelectorAll("[data-compose-status]")) {
      const status = row.getAttribute("data-compose-status") ?? "";
      if (!byStatus.has(status)) byStatus.set(status, [...row.classList]);
    }
  }
  return byStatus;
}

function tokensFor(status: GenerationRowStatus): readonly string[] {
  const tokens = classTokensByStatus().get(status);
  if (tokens === undefined) throw new Error(`no row was drawn ${status}`);
  return tokens;
}

/** The token a row carries **because of its status**: the one the rows of the other two statuses do
 *  not share. Empty when the status resolved to no class at all, which is the silent regression. */
function statusOwnTokens(status: GenerationRowStatus): readonly string[] {
  const byStatus = classTokensByStatus();
  const shared = ROW_STATUSES.filter((other) => other !== status).flatMap(
    (other) => byStatus.get(other) ?? [],
  );
  return (byStatus.get(status) ?? []).filter(
    (token) => !shared.includes(token),
  );
}

/**
 * The local class name behind a rendered token.
 *
 * Both Vitest's CSS stub and a real CSS-module build wrap the author's name in a hash
 * (`_composeRowDropped_6fc2cb`), and it is the author's name the stylesheet declares. A token this
 * cannot read is thrown on rather than skipped: a silent skip would make every assertion below pass
 * over nothing.
 */
function localClassName(token: string): string {
  const local = /^_(?<local>[A-Za-z][\w-]*)_[\w-]+$/.exec(token)?.groups?.local;
  if (local === undefined) {
    throw new Error(`no local class name can be read out of "${token}"`);
  }
  return local;
}

/** Every class `room.module.css` declares. A name absent from this set is a class the component
 *  believes in and the stylesheet does not. */
function declaredClassNames(): ReadonlySet<string> {
  return new Set(
    [...roomStylesheet.matchAll(/\.(?<name>[A-Za-z_][\w-]*)/g)].map(
      (match) => match.groups?.name ?? "",
    ),
  );
}

/** The declarations of one rule, by its selector. Returned as text because what is asserted of it
 *  is a property the frame draws with, not a parsed value. */
function declarationsFor(selector: string): string {
  const rule = new RegExp(`${selector}\\s*\\{(?<body>[^}]*)\\}`).exec(
    roomStylesheet,
  );
  const body = rule?.groups?.body;
  if (body === undefined) {
    throw new Error(`room.module.css declares no rule for ${selector}`);
  }
  return body;
}

describe("every row status is drawn with a class the stylesheet declares (ruling R10)", () => {
  it.each(ROW_STATUSES.map((status) => [status]))(
    "draws a %s row with exactly one class of its own",
    (status) => {
      // Zero here is the regression this file was written for: the status resolved to `undefined`,
      // `classNames` dropped it, and the row is drawn as a plain row with no mark of its state.
      expect(statusOwnTokens(status)).toHaveLength(1);
    },
  );

  it.each(ROW_STATUSES.map((status) => [status]))(
    "requires room.module.css to declare the class a %s row renders with",
    (status) => {
      const [token] = statusOwnTokens(status);
      expect(token).toBeDefined();
      expect([...declaredClassNames()]).toContain(localClassName(token ?? ""));
    },
  );

  it("declares the class every row shares, whatever its status", () => {
    // The self-check on the two readers above: if `localClassName` or `declaredClassNames` stopped
    // agreeing with the stylesheet's own spelling, this line goes red first and the per-status
    // assertions above are never left passing over a name nothing could have matched.
    const perStatus = ROW_STATUSES.map((status) => new Set(tokensFor(status)));
    const sharedTokens = [...(perStatus[0] ?? [])].filter((token) =>
      perStatus.every((tokens) => tokens.has(token)),
    );

    expect(sharedTokens).toHaveLength(1);
    for (const token of sharedTokens) {
      expect([...declaredClassNames()]).toContain(localClassName(token));
    }
  });

  it("gives the three statuses three different classes", () => {
    const perStatus = ROW_STATUSES.flatMap((status) =>
      statusOwnTokens(status).map(localClassName),
    );

    expect(new Set(perStatus).size).toBe(ROW_STATUSES.length);
  });
});

describe("the not-placed row keeps the drawing R10 describes", () => {
  it("draws it with a dashed border and a muted background rather than struck text", () => {
    const dropped = declarationsFor(
      `\\.${localClassName(statusOwnTokens("not_placed")[0] ?? "")}`,
    );

    expect(dropped).toContain("dashed");
    expect(dropped).toContain("background");
    // The row's own rule, not the whole stylesheet: `line-through` is named in the comment above
    // this very class, explaining that the frame draws none, and a text gate over the file would
    // have been red the day that comment landed.
    expect(dropped).not.toContain("text-decoration");
  });

  it("draws its glyph as generated content, so no locale can translate the mark away", () => {
    const glyphSelector = `\\.${localClassName(
      statusOwnTokens("not_placed")[0] ?? "",
    )} \\.composeRowGlyph::before`;

    expect(declarationsFor(glyphSelector)).toContain("content");
  });
});

/**
 * **7D5b defect W7** — the compose body scrolls vertically and never horizontally.
 *
 * Russian at 390 x 844 outgrows the space above the fixed footer, and under `overflow: hidden` the
 * rule paragraph was cut off and unreachable. happy-dom does no layout, so the overflow itself is the
 * visual gate's to measure; what this guards is the declaration that makes it reachable, and the
 * horizontal refusal of ADR 0082 decision 2 that a bare `overflow-y: auto` would silently drop.
 */
describe("the compose body scrolls vertically and only vertically (W7)", () => {
  it("lets content taller than the space above the footer scroll into view", () => {
    expect(declarationsFor("\\.composeBody")).toMatch(/overflow-y:\s*auto;/);
  });

  it("refuses a horizontal scroller", () => {
    expect(declarationsFor("\\.composeBody")).toMatch(/overflow-x:\s*hidden;/);
  });
});

/**
 * **QA finding F4** — the two states 1F reaches with no tap behind them are the two a live region
 * exists for, and the save-failed one is the one that also needs an action.
 *
 * The region is live unconditionally rather than only in those states, because a region has to be
 * live **before** the mutation it should announce; the silence of the happy path is a property of the
 * text — `composing` and `composed`+`saving` share one leaf — and is asserted below rather than
 * assumed.
 */
describe("the notice band is 1F's live region", () => {
  it("is polite, so nothing interrupts a sentence the customer is already hearing", () => {
    renderRun(failedHandoffRun());

    expect(noticeBand().getAttribute("aria-live")).toBe("polite");
    // `role="alert"` would be assertive, and nothing here is waiting on the customer: the retry
    // button stands there until it is pressed.
    expect(noticeBand().getAttribute("role")).toBeNull();
  });

  it("reads the save-failed sentence once the write has been refused", () => {
    renderRun(failedHandoffRun());

    expect(noticeBand().textContent).toBe(roMessages.room.compose.saveFailed);
  });

  it("announces the refused write, which arrives with no tap behind it", () => {
    expect(
      announceableIn(mutationsAcross(composedRun(), failedHandoffRun())),
    ).not.toHaveLength(0);
  });

  it("announces a composition that did not finish, for the same reason", () => {
    expect(
      announceableIn(mutationsAcross(composingRun(), failedRun())),
    ).not.toHaveLength(0);
  });

  it("says nothing when the composition simply resolves", () => {
    const mutations = mutationsAcross(composingRun(), composedRun());

    // The observer really watched this transition happen: React removes the spinner `<span>` from
    // the band. Without this line the assertion below would read the same over an observer that saw
    // nothing at all, and the silence would be the test's rather than the region's.
    expect(mutations).toHaveLength(1);
    // The happy path must not be narrated: *pending → composed* is a screenful of rows the customer
    // can read at their own pace, and a region that fired here would talk over all of it. The
    // removal above is not read out, because `aria-relevant` defaults to *additions text*.
    expect(announceableIn(mutations)).toHaveLength(0);
  });

  it("leaves the caret where the customer left it when the write fails", () => {
    renderRun(composedRun());
    const focusedBefore = document.activeElement;

    renderRun(failedHandoffRun());

    expect(document.activeElement).toBe(focusedBefore);
  });
});

/**
 * **Wave 7D5b slice SW: the dishwasher row, as the customer reads it** (ADR 0110 Amendment M3). A
 * resolution assertion in both locales — the wording itself is the copy lock's — over the plan's own
 * witnesses: **1500 × 2800** holds an M1 dishwasher, **1500 × 3500** holds none.
 */
describe("the dishwasher row, in both locales (7D5b SW)", () => {
  const WITH_DISHWASHER: DesignRoom = {
    shape: "L",
    widthMm: 1500,
    depthMm: 2800,
    heightMm: 2600,
  };
  const WITHOUT_DISHWASHER: DesignRoom = {
    shape: "L",
    widthMm: 1500,
    depthMm: 3500,
    heightMm: 2600,
  };

  function textOf(testId: string): string {
    const element = container.querySelector(`[data-testid="${testId}"]`);
    if (element === null) throw new Error(`1F drew no ${testId}`);
    return element.textContent;
  }

  function drawnRowIds(): readonly string[] {
    return [...container.querySelectorAll("[data-compose-status]")].map(
      (row) => row.getAttribute("data-testid") ?? "",
    );
  }

  it("draws it fifth of six, between the hob and storage", () => {
    renderRun(composedRun(WITH_DISHWASHER));

    expect(drawnRowIds()).toEqual([
      "room-compose-row-fridge",
      "room-compose-row-sink",
      "room-compose-row-preparation",
      "room-compose-row-hob",
      "room-compose-row-dishwasher",
      "room-compose-row-storage",
    ]);
  });

  it.each([
    ["ro", ROMANIAN],
    ["ru", RUSSIAN],
  ] as const)(
    "names it by its own leaf and its width in %s",
    (_locale, catalogue) => {
      renderRun(composedRun(WITH_DISHWASHER), catalogue);

      const name = textOf("room-compose-name-dishwasher");
      expect(name).toContain(catalogue.messages.room.compose.dishwasher);
      expect(name).toContain("600");
    },
  );

  it.each([
    ["ro", ROMANIAN],
    ["ru", RUSSIAN],
  ] as const)(
    "reads the placed status word where the plan holds one, in %s",
    (_locale, catalogue) => {
      renderRun(composedRun(WITH_DISHWASHER), catalogue);

      expect(textOf("room-compose-status-dishwasher")).toBe(
        catalogue.messages.room.compose.status.placed,
      );
    },
  );

  it.each([
    ["ro", ROMANIAN],
    ["ru", RUSSIAN],
  ] as const)(
    "reads the not-placed status word, with nothing beneath it, where it holds none, in %s",
    (_locale, catalogue) => {
      renderRun(composedRun(WITHOUT_DISHWASHER), catalogue);

      expect(textOf("room-compose-status-dishwasher")).toBe(
        catalogue.messages.room.compose.status.notPlaced,
      );
      // ADR 0113 decision 5: the domain publishes no reason, so the row explains nothing.
      expect(
        container.querySelector('[data-testid="room-compose-row-dishwasher"]')
          ?.children,
      ).toHaveLength(3);
    },
  );

  it("tells storage apart from the dishwasher where the dishwasher is all the storage there is (W3)", () => {
    renderRun(composedRun(WITH_DISHWASHER));

    expect(textOf("room-compose-status-dishwasher")).toBe(
      roMessages.room.compose.status.placed,
    );
    expect(textOf("room-compose-status-storage")).toBe(
      roMessages.room.compose.status.notPlaced,
    );
  });
});

/**
 * **Wave 7F2 S1b: 1F's room summary reads the whole millimetres the customer typed** (ADR 0126,
 * criterion S1b-9). The unit is spelled here rather than read from the catalogue, so a template that
 * lost it, or a number form that grouped thousands (*"3 560"* in `ru` without `::group-off`), could
 * not agree with itself.
 */
describe("the room summary reads whole millimetres, in both locales (7F2 S1b)", () => {
  const SUMMARY_SWEEP_RUNS = 100;
  const LARGEST_SWEPT_MM = 9_000_000;

  function summaryText(): string {
    const summary = container.querySelector(
      '[data-testid="room-compose-summary"]',
    );
    if (summary === null) throw new Error("1F drew no room summary");
    return summary.textContent;
  }

  it.each([
    ["ro", ROMANIAN, "mm"],
    ["ru", RUSSIAN, "\u043C\u043C"],
  ] as const)(
    "writes each length as its digits and the unit, with no separator, in %s",
    (_locale, catalogue, unit) => {
      const lengthMm = fc.integer({ min: 1, max: LARGEST_SWEPT_MM });
      fc.assert(
        fc.property(
          lengthMm,
          lengthMm,
          lengthMm,
          (widthMm, depthMm, heightMm) => {
            renderRun(
              {
                phase: "failed",
                room: { shape: "L", widthMm, depthMm, heightMm },
              },
              catalogue,
            );

            expect(summaryText()).toBe(
              `${catalogue.messages.room.shapes.L.short} \u00B7 ${String(widthMm)} \u00D7 ` +
                `${String(depthMm)} ${unit} \u00B7 h ${String(heightMm)} ${unit}`,
            );
          },
        ),
        { numRuns: SUMMARY_SWEEP_RUNS },
      );
    },
  );

  // ADR 0130 D10 (wave 7J S4): a straight room's summary names wall A and the height only \u2014 never a
  // third number \u2014 because `room.depthMm` is the drawn floor's depth in front of the run (D3), not a
  // length the customer typed. Selected by `requiredFieldsFor(room.shape)`, so this is the same
  // property as the L's own above with the wall-B clause absent rather than a second read of the
  // shape.
  it.each([
    ["ro", ROMANIAN, "mm"],
    ["ru", RUSSIAN, "\u043C\u043C"],
  ] as const)(
    "writes only wall A and the height for a straight room, in %s",
    (_locale, catalogue, unit) => {
      const lengthMm = fc.integer({ min: 1, max: LARGEST_SWEPT_MM });
      fc.assert(
        fc.property(lengthMm, lengthMm, (widthMm, heightMm) => {
          renderRun(
            {
              phase: "failed",
              room: { shape: "linear", widthMm, depthMm: 3400, heightMm },
            },
            catalogue,
          );

          expect(summaryText()).toBe(
            `${catalogue.messages.room.shapes.linear.short} \u00B7 ${String(widthMm)} ` +
              `${unit} \u00B7 h ${String(heightMm)} ${unit}`,
          );
        }),
        { numRuns: SUMMARY_SWEEP_RUNS },
      );
    },
  );
});

/**
 * **7L review finding F5.** `roomDraftFor` (this file) and `roomHrefFromDesignRoom`
 * (`room-url-state.ts`) both used to map a stored `DesignRoom`'s numbers onto wall/height fields
 * independently; now both call the one shared `parsedRoomLengthsOf`. This locks the mapping itself —
 * wall A from `widthMm`, wall B from `depthMm` only for a room that turns a corner — against the two
 * drifting apart again, read off what 1F actually draws rather than off the summary line.
 */
describe("the composed plan aside maps a DesignRoom the one way parsedRoomLengthsOf does (7L F5)", () => {
  function planLabelText(wall: "A" | "B"): string | null {
    return (
      container.querySelector(`[data-testid="room-plan-label-${wall}"]`)
        ?.textContent ?? null
    );
  }

  it("draws wall A from widthMm and wall B from depthMm for a room that turns a corner", () => {
    renderRun({
      phase: "failed",
      room: { shape: "L", widthMm: 1500, depthMm: 2800, heightMm: 2600 },
    });

    expect(planLabelText("A")).toContain("1500");
    expect(planLabelText("B")).toContain("2800");
  });

  it("draws only wall A from widthMm for a straight room, never a wall B from depthMm", () => {
    renderRun({
      phase: "failed",
      room: { shape: "linear", widthMm: 3400, depthMm: 900, heightMm: 2600 },
    });

    expect(planLabelText("A")).toContain("3400");
    expect(planLabelText("B")).toBeNull();
  });
});

/**
 * **M7B U5 S1, acceptance criterion 2, and the 1F aside for a U.** A U's 1F summary shows wall A,
 * wall B, wall C and the height, and the desktop aside draws the plan with all three walls. The
 * sentence is `room.compose.roomSummaryU`, drafted 2026-09-30 by the coordinator's ruling: the approved
 * leaf's own shape with a third length. Rendered here straight through `GenerationSteps`, handed the
 * room a U 1D would hand it, so the summary is tested without the screen's route to it.
 * The unit is spelled here, as the block above does, so a template that lost it or grouped thousands
 * could not agree with itself.
 */
describe("a U's summary names its three walls (M7B U5 S1, criterion 2)", () => {
  const SWEPT_RUNS = 100;
  const LARGEST_MM = 9_000_000;

  interface UWalls {
    readonly widthMm: number;
    readonly depthMm: number;
    readonly wallCMm: number;
    readonly heightMm: number;
  }

  function summaryOfU(walls: UWalls, catalogue: RenderLocale): string {
    renderRun({ phase: "failed", room: { shape: "U", ...walls } }, catalogue);
    const summary = container.querySelector(
      '[data-testid="room-compose-summary"]',
    );
    if (summary === null) throw new Error("1F drew no room summary");
    return summary.textContent;
  }

  it.each([
    ["ro", ROMANIAN, "mm"],
    ["ru", RUSSIAN, "мм"],
  ] as const)(
    "writes A, B, C and the height as digits and the unit, in %s",
    (_locale, catalogue, unit) => {
      const lengthMm = fc.integer({ min: 1, max: LARGEST_MM });
      fc.assert(
        fc.property(
          lengthMm,
          lengthMm,
          lengthMm,
          lengthMm,
          (widthMm, depthMm, wallCMm, heightMm) => {
            expect(
              summaryOfU({ widthMm, depthMm, wallCMm, heightMm }, catalogue),
            ).toBe(
              `${catalogue.messages.room.shapes.U.short} · ${String(widthMm)} × ` +
                `${String(depthMm)} × ${String(wallCMm)} ${unit} · h ${String(heightMm)} ${unit}`,
            );
          },
        ),
        { numRuns: SWEPT_RUNS },
      );
    },
  );

  it("does not print wall B's number in wall C's place: the two differ on screen", () => {
    const text = summaryOfU(
      { widthMm: 4500, depthMm: 3010, wallCMm: 3620, heightMm: 2600 },
      ROMANIAN,
    );

    expect(text).toContain("3010 × 3620");
  });

  it("draws all three walls in the composed plan aside, wall C from wallCMm", () => {
    renderRun({
      phase: "failed",
      room: {
        shape: "U",
        widthMm: 4500,
        depthMm: 3010,
        wallCMm: 3620,
        heightMm: 2600,
      },
    });

    const label = (wall: "A" | "B" | "C") =>
      container.querySelector(`[data-testid="room-plan-label-${wall}"]`)
        ?.textContent ?? null;
    expect(label("A")).toContain("4500");
    expect(label("B")).toContain("3010");
    expect(label("C")).toContain("3620");
  });
});
