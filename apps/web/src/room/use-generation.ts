// **The composition run** — M7 wave 7F4a, rulings R12, R13, R15 and R16.
//
// This is the generation algorithm's **first production caller**: `generateKitchen` is exported from
// the domain's public index and, until this file, was called from nothing under `apps/web/src`.
// Three things about how it is called here are rules rather than style, and each one has a defect
// behind it.
//
// **1. A run starts from the tap that asked for it, never from an effect** (R15). `next.config.ts`
// sets `reactStrictMode: true`, so an effect that generated would run **twice** in development: two
// Three.js kits, two designs, and — once wave 7F4b hands off — two rows in the database, with nothing
// red to catch it because the second mint is a different attempt and 7E2's guarantee is per-attempt
// by design. A handler runs once per tap.
//
// **2. The adapter arrives through a dynamic import taken inside that handler** (R15, criterion 33).
// `@lemnaria/three-adapter` pulls `three` behind it, and the customer's **first** screen must not
// carry it. There is no top-level adapter import anywhere under `apps/web/src/room`, and this file is
// the only one that names the package at all.
//
// **3. The kit is borrowed through a lease and released on every path** (ADR 0074 decision 3, ADR
// 0076). A kit owns buffers, materials and canvas textures; `createBodyProbeLease`'s `finally` is
// what releases it when `generateKitchen` throws, and is why the factory below allocates and frees in
// one expression rather than handing a probe out for someone to remember. **A lease brackets its own
// `use` and nothing earlier**, so the window between `makeKit` and the lease is bracketed here, and a
// hand-back that fails is reported rather than allowed to discard a finished kitchen — see
// `loadProbeFactory` and `releaseOrReport`.
//
// **What this file deliberately does not do.** It writes to no URL, no store, no cookie and no web
// storage: composition is a client sub-state over the same query (R13), and an addressable one would
// make a reload re-run generation and mint a second design. It renders nothing. And it reports no
// per-row progress — `generateKitchen` is one synchronous call that returns a finished log, so the
// only honest states are *the whole list is pending* and *the whole list has resolved* (R12).
import {
  boundedFailureReason,
  createBodyProbeLease,
  generateKitchen,
  wallCarcassDepthMm,
  type BodyProbeFactory,
  type Design,
  type DesignRoom,
  type GenerationLog,
} from "@lemnaria/configurator-domain";
import { useCallback, useRef, useState } from "react";

import {
  pendingGenerationRows,
  resolveGenerationRows,
  type GenerationRow,
} from "./generation-model";

/**
 * Where one composition has got to.
 *
 * **The room is carried by the run rather than read back off the draft**, so the summary frame 1F
 * draws above the list describes the kitchen being composed and not whatever the form happens to hold
 * a moment later.
 *
 * **`failed` covers both arms of criterion 35** — a `MINIMUM_NOT_MET` refusal and a throw — because
 * the customer's position is identical in both: nothing was written, nothing navigated, and *Înapoi*
 * still works. The refusal's own sentence is **7F2's, at 1C**, where a customer can act on it (R16).
 */
export type GenerationRunState =
  | { readonly phase: "idle" }
  | {
      readonly phase: "composing";
      readonly room: DesignRoom;
      readonly rows: readonly GenerationRow[];
    }
  | {
      readonly phase: "composed";
      readonly room: DesignRoom;
      readonly rows: readonly GenerationRow[];
      readonly design: Design;
      readonly log: GenerationLog;
    }
  | {
      /**
       * **A failed run carries no rows at all, and that is a rule about honesty rather than an
       * omission** (coordinator's ruling, 2026-09-15).
       *
       * `generateKitchen` has a second refusal arm (`generate-kitchen.ts:296-300`): the plan's
       * minimum was met, but `insertBody` refused the sink or the hob at the real probe. It returns
       * `ok: false` over a log in which the fridge and the storage cabinets may be `placed` — so a
       * row set folded from that log reads *Frigider · 700 — inclus* under
       * *Compunerea nu s-a putut finaliza*, for a design that was **discarded and that nobody will
       * ever open**. Nothing was placed, because nothing was kept.
       *
       * The row set is therefore **absent from the type**, not hidden by the view: there is no
       * `rows` here for a component to remember not to draw, and `generation-steps.tsx` cannot
       * reach one without a compile error. The same absence covers the throw, which ends before a
       * log exists.
       */
      readonly phase: "failed";
      readonly room: DesignRoom;
    };

/** A run that is being drawn. `generation-steps.tsx` takes this rather than the whole union, so the
 *  body has no *"not composing"* branch to get wrong: the screen draws the form in that case. */
export type ActiveGenerationRun = Exclude<
  GenerationRunState,
  { readonly phase: "idle" }
>;

export interface GenerationRun {
  readonly state: GenerationRunState;
  /** Enters composition and runs it, once, for the room handed in.
   *
   *  **The seam wave 7F3 enters through.** 7F3 puts sub-states 1D and 1E in front of this and calls
   *  the same function when its preset list comes back empty or when the customer asks to generate;
   *  nothing here assumes *Continuă* is the only caller. */
  readonly compose: (room: DesignRoom) => void;
  /** Leaves composition. A pure state clear — the draft is still in memory behind the steps body,
   *  caret residue and all, so nothing re-seeds from the URL on the way back (R14). A run still in
   *  flight is abandoned rather than cancelled: it cannot be, and its lease is released either way. */
  readonly leave: () => void;
}

const IDLE: GenerationRunState = { phase: "idle" };

export function useGeneration(): GenerationRun {
  const [state, setState] = useState<GenerationRunState>(IDLE);
  // Which run the screen is showing. A run that finishes after the customer has left, or after a
  // second one started, settles into a state nobody is looking at — so it is discarded by token
  // rather than allowed to overwrite the newer one.
  const currentRun = useRef(0);

  const leave = useCallback(() => {
    currentRun.current += 1;
    setState((shown) => (shown.phase === "idle" ? shown : IDLE));
  }, []);

  const compose = useCallback((room: DesignRoom) => {
    currentRun.current += 1;
    const token = currentRun.current;
    setState({ phase: "composing", room, rows: pendingGenerationRows() });
    void composeKitchen(room).then((settled) => {
      if (currentRun.current !== token) return;
      setState(settled);
    });
  }, []);

  return { state, compose, leave };
}

/** The run's one error boundary, kept to itself: everything below it may throw, and a throw is the
 *  same dead end a refusal is — no mint, no navigation, no crash (criterion 35). */
async function composeKitchen(room: DesignRoom): Promise<GenerationRunState> {
  try {
    return await composeOrThrow(room);
  } catch {
    return { phase: "failed", room };
  }
}

async function composeOrThrow(room: DesignRoom): Promise<GenerationRunState> {
  const probeAt = await loadProbeFactory();
  await theNextPaint();
  const composed = generateKitchen({
    room,
    occurredAt: new Date().toISOString(),
    probeAt,
  });
  // The log is folded into rows **only** on the path that keeps the design. A refusal's log is left
  // unread: see the `failed` member above for why a row off it would be a false claim.
  if (!composed.ok) return { phase: "failed", room };
  return {
    phase: "composed",
    room,
    rows: resolveGenerationRows(composed.log),
    design: composed.design,
    log: composed.log,
  };
}

/**
 * **The adapter's only route into the room screen** (R15, criterion 33).
 *
 * The factory it returns is `generated-kitchen.parity.test.ts:40-48`'s shape, with the stage's own
 * `wallDepthMm` (`scene/kitchen-stage.tsx:78-88`): the depth map is a product rule the domain states,
 * and a design generated against a different wall depth from the one the editor will render it at
 * would persist seats the scene then disagrees with.
 *
 * **No renderer, no `<canvas>` in the document, no WebGL.** `makeKit` falls back to
 * `document.createElement("canvas")` for its textures, which is also why this cannot be moved to a
 * Web Worker: the kit reaches for `document`.
 *
 * **The kit exists before the lease does, and that window is this factory's own to bracket.**
 * `createBodyProbeLease`'s `finally` covers everything inside `use` and nothing before it, so the two
 * steps between `makeKit` and the lease — building the room, and building the probe over it — had no
 * `finally` above them: a throw from either stranded a whole L-kitchen's buffers, materials and baked
 * textures, and `composeKitchen`'s `catch` turned it into the failure screen without freeing
 * anything. The realistic trigger is a low-end phone running out of memory after the textures baked
 * (risk 2), where every retry from *Înapoi* stranded one more kit for the page's lifetime. Measured
 * before the `catch` below existed: `{ built: 1, disposed: 0 }` at both throw sites.
 */
async function loadProbeFactory(): Promise<BodyProbeFactory> {
  const { createBodyProbe, disposeKit, makeKit } = await import(
    "@lemnaria/three-adapter"
  );

  return (cabinetDepthMm: number) => {
    const kit = makeKit({
      cabinetDepthMm,
      wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
    });
    const buildRoom = kit.builders["kitchen-l"];
    // Held outside the `try` so the failed exit can free the room when there is one. There is none
    // when `buildRoom` itself throws, and `disposeKit` then frees the kit's own shared resources —
    // which is everything still reachable, since a room that threw mid-build returned nothing.
    let room: ReturnType<typeof buildRoom> | undefined;
    // **This is the site that allocates, so this is the site that frees** (ADR 0076 decision 3), and
    // one closure serves both exits: the lease's `finally`, which runs on every path through `use`,
    // and the `catch`, which runs on every path that never reached a lease.
    const giveTheKitBack = () => {
      releaseOrReport(() => {
        disposeKit(kit, room);
      });
    };

    try {
      room = buildRoom();
      return createBodyProbeLease(createBodyProbe(kit, room), giveTheKitBack);
    } catch (failure) {
      giveTheKitBack();
      throw failure;
    }
  };
}

/**
 * **Frees the kit, and never at the cost of the run's own outcome** — the coordinator's ruling of
 * 2026-09-15.
 *
 * A `finally` that throws *replaces* what its block was returning. `createBodyProbeLease` calls
 * `release` from exactly such a `finally`, so a `disposeKit` that failed used to travel out of a
 * `generateKitchen` that had already produced `ok: true`, past `composeOrThrow`, into
 * `composeKitchen`'s `catch` — and the customer read *composition could not be completed* over a
 * kitchen that was composed correctly. A kit that will not go back is a resource problem; discarding
 * the finished kitchen over it converts a leak into a visible failure, which is strictly worse for
 * the person waiting on it. **A composition that succeeded is delivered.**
 *
 * **Bounded here rather than in `body-probe.ts`**, whose contract is that `release` is called exactly
 * once per `use` — not that `release` cannot fail. The site that supplies `release` is the only one
 * that can make that promise true, and it is the same site that allocated the thing being released.
 */
function releaseOrReport(release: () => void): void {
  try {
    release();
  } catch (failure) {
    reportKitReleaseFailure(failure);
  }
}

/**
 * **Not swallowed — written down**, in the shape `lib/server/design-failure-log.ts` writes its lines.
 *
 * `console` is the whole of the transport, because it is the whole of what exists here: that module
 * is the application's structured-log seam and is `server-only`, there is no client equivalent, and
 * no error tracker is installed (an SDK needs a DSN and an account decision that are the owner's). A
 * grepped label and a flat record is what a platform log view captures today and what a tracker would
 * want when one arrives.
 *
 * **Nothing may escape this function**, for the reason that module's `writeOrNothing` states and one
 * more of its own: a thrown value this application did not construct may define `message` or
 * `toString` as a throwing getter, and a diagnostic that throws from inside the lease's `finally`
 * would re-create the exact defect it is here to report.
 */
function reportKitReleaseFailure(failure: unknown): void {
  try {
    console.error(GENERATION_LOG_LABEL, {
      event: "kit-release-failed",
      // Applied for the reason it is applied to every other logged message: no control characters,
      // so nothing forges a line, and a hard cap, so nothing floods one.
      reason: boundedFailureReason(
        failure instanceof Error ? failure.message : String(failure),
      ),
    });
  } catch {
    // The only thing left to report a failed report with is the transport that just failed.
  }
}

/** Grepped for in a platform log view, so it is one literal and not assembled. */
const GENERATION_LOG_LABEL = "[generation]";

/**
 * **Resolves on the far side of a painted frame, and that is criterion 29's whole mechanism.**
 *
 * `generateKitchen` is synchronous and runs on the main thread, so the pending rows have to be on the
 * glass before it starts or the customer sees a stopped screen instead of a list (risk 2). Awaiting
 * the dynamic import is **not enough**: the first tap fetches a chunk and yields for real, but every
 * tap after it resolves in a microtask with no frame in between.
 *
 * Both calls are needed. `requestAnimationFrame` runs *before* the paint; a task scheduled from
 * inside it runs *after* one.
 */
function theNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}
