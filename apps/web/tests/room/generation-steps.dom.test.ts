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

function renderRun(run: ActiveGenerationRun): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(GenerationSteps, {
          run,
          onBack: () => undefined,
          onRetry: () => undefined,
        }),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

/** The list as it is painted before `generateKitchen` is entered: five rows, all pending. */
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
function composedRun(): Extract<ActiveGenerationRun, { phase: "composed" }> {
  const result = generateKitchen({
    room: SMALLEST_ACCEPTED_ROOM,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) {
    throw new Error("the owner's smallest accepted room no longer composes");
  }
  return {
    phase: "composed",
    room: SMALLEST_ACCEPTED_ROOM,
    rows: resolveGenerationRows(result.log),
    design: result.design,
    log: result.log,
    // The hand-off's two fields, which this file has no opinion about: it reads row classes. The
    // attempt is never run, and `saving` is the state a composition is in the instant it exists.
    attempt: { run: () => Promise.reject(new Error("never run here")) },
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
 * What a screen reader would be given by the notice band across one transition.
 *
 * Records are drained with `takeRecords`, because a `MutationObserver` callback is a microtask and
 * `act` has already returned by the time one would run.
 *
 * **The identity check is what stops this from passing over nothing.** If React ever replaced the
 * band instead of updating it, the observer would be watching a detached node, every assertion below
 * would read zero mutations, and the silent-happy-path test would pass for the wrong reason — while
 * the real region would be a freshly mounted one, which is the shape that gets announced late or not
 * at all.
 */
function announceableMutationsAcross(
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
      announceableMutationsAcross(composedRun(), failedHandoffRun()),
    ).not.toHaveLength(0);
  });

  it("announces a composition that did not finish, for the same reason", () => {
    expect(
      announceableMutationsAcross(composingRun(), failedRun()),
    ).not.toHaveLength(0);
  });

  it("says nothing when the composition simply resolves", () => {
    // The happy path must not be narrated: *pending → composed* is a screenful of rows the customer
    // can read at their own pace, and a region that fired here would talk over all of it.
    expect(
      announceableMutationsAcross(composingRun(), composedRun()),
    ).toHaveLength(0);
  });

  it("leaves the caret where the customer left it when the write fails", () => {
    renderRun(composedRun());
    const focusedBefore = document.activeElement;

    renderRun(failedHandoffRun());

    expect(document.activeElement).toBe(focusedBefore);
  });
});
