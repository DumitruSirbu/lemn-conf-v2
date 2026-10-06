// @vitest-environment happy-dom
// Vitest's CSS-module stub fabricates a class name for any property, so a presence check on `styles.*` is vacuous:
// the assertion pairs the class a row renders with (read off the DOM) against `room.module.css`'s own text.
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

/** The owner's smallest accepted room (ADR 0108 Amendment E): the one room that puts both resolved statuses on
 *  the glass at once, the sink and hob placed, the fridge and storage not. */
const SMALLEST_ACCEPTED_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 900,
  depthMm: 2200,
  heightMm: 2200,
};

/** Read by path: under `happy-dom` the module URL is not a `file:` one, and `readFileSync` refuses it. */
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
// Cast as `room-composition.dom.test.ts` does: `Catalogue` is typed from `ro.json`; catalogue parity holds `ru.json`.
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

/** A generated run, so the resolved statuses are the engine's own for this room. Returned as the composed member
 *  so `failedHandoffRun` can spread it. */
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
    // `saving` is the state a composition is in the instant it exists. `attempt.run` throws synchronously: a
    // rejected promise nobody awaited would surface as an unhandled rejection in whichever test was running.
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

/** A composed kitchen whose write was refused: the rows are true and complete, what failed is the hand-off. */
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
 * Everything the notice band did across one transition, announceable or not. Records are drained with
 * `takeRecords` (an observer callback is a microtask and `act` has returned by then). The identity check stops
 * the observer watching a detached node; the result is unfiltered, so a filtered-out removal reads differently
 * from an observer that saw nothing.
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

/** Every class token the rows of one render carry, keyed by status. No single run holds all three statuses: a
 *  composing list is wholly pending and a settled one holds none. */
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

/** The local class name behind a rendered token: Vitest's CSS stub and a real build both wrap it in a hash
 *  (`_composeRowDropped_6fc2cb`). Throws on a token it cannot read, since a skip would pass over nothing. */
function localClassName(token: string): string {
  const local = /^_(?<local>[A-Za-z][\w-]*)_[\w-]+$/.exec(token)?.groups?.local;
  if (local === undefined) {
    throw new Error(`no local class name can be read out of "${token}"`);
  }
  return local;
}

/** Every class `room.module.css` declares. */
function declaredClassNames(): ReadonlySet<string> {
  return new Set(
    [...roomStylesheet.matchAll(/\.(?<name>[A-Za-z_][\w-]*)/g)].map(
      (match) => match.groups?.name ?? "",
    ),
  );
}

/** The declarations of one rule, by its selector, as text. */
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
      // Zero is the regression: the status resolved to `undefined` and `classNames` dropped it.
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
    // Self-check on the two readers above: if they stopped agreeing with the stylesheet's spelling, this goes red.
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
    // The row's own rule, not the whole stylesheet: a comment above the class names `line-through`.
    expect(dropped).not.toContain("text-decoration");
  });

  it("draws its glyph as generated content, so no locale can translate the mark away", () => {
    const glyphSelector = `\\.${localClassName(
      statusOwnTokens("not_placed")[0] ?? "",
    )} \\.composeRowGlyph::before`;

    expect(declarationsFor(glyphSelector)).toContain("content");
  });
});

/** happy-dom does no layout, so the overflow is the visual gate's to measure; this guards the declaration that
 *  keeps Russian's rule paragraph reachable, and the horizontal refusal of ADR 0082 decision 2. */
describe("the compose body scrolls vertically and only vertically (W7)", () => {
  it("lets content taller than the space above the footer scroll into view", () => {
    expect(declarationsFor("\\.composeBody")).toMatch(/overflow-y:\s*auto;/);
  });

  it("refuses a horizontal scroller", () => {
    expect(declarationsFor("\\.composeBody")).toMatch(/overflow-x:\s*hidden;/);
  });
});

/** The region is live unconditionally because it must be live before the mutation it announces; the happy path
 *  is silent because `composing` and `composed`+`saving` share one leaf. */
describe("the notice band is 1F's live region", () => {
  it("is polite, so nothing interrupts a sentence the customer is already hearing", () => {
    renderRun(failedHandoffRun());

    expect(noticeBand().getAttribute("aria-live")).toBe("polite");
    // `role="alert"` would be assertive, and nothing here waits on the customer.
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

    // Without this the assertion below reads the same over an observer that saw nothing at all.
    expect(mutations).toHaveLength(1);
    // The removal above is not read out: `aria-relevant` defaults to additions text.
    expect(announceableIn(mutations)).toHaveLength(0);
  });

  it("leaves the caret where the customer left it when the write fails", () => {
    renderRun(composedRun());
    const focusedBefore = document.activeElement;

    renderRun(failedHandoffRun());

    expect(document.activeElement).toBe(focusedBefore);
  });
});

/** Witnesses: 1500 × 2800 holds an M1 dishwasher, 1500 × 3500 holds none (ADR 0110 Amendment M3). */
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
      // The domain publishes no reason for an unplaced row, so the row explains nothing.
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

/** The unit is spelled here, not read from the catalogue, so a template that lost it or grouped thousands
 *  (`3 560` in `ru` without `::group-off`) could not agree with itself (ADR 0126). */
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

  // A straight room's summary names wall A and the height only: `room.depthMm` is the drawn floor's depth, not a
  // typed length, so the wall-B clause is absent rather than a second read of the shape.
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

/** `roomDraftFor` and `roomHrefFromDesignRoom` must keep mapping a DesignRoom the one way `parsedRoomLengthsOf`
 *  does: wall A from `widthMm`, wall B from `depthMm` only for a room that turns a corner. */
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

/** `room.compose.roomSummaryU` is drafted copy: the approved leaf's shape with a third length. The unit is spelled
 *  here, as above, so a template that lost it or grouped thousands could not agree with itself. */
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
