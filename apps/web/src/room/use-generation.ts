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
// **4. The design is written once per composition, by one attempt the run owns** (R17, wave 7F4b).
// `createDesignCreationAttempt`'s doc comment carries a caller obligation: an attempt holds one mint
// identity for its whole lifetime, so *"constructing one inside a click handler mints a row, and
// navigates, per tap."* The deliberate selection here is the *Continuă* tap, its state is this run,
// and the attempt is built **in the transition that first holds a design** — never in a handler, a
// render or a `useMemo` over the design. Every retry re-runs that same attempt, which is what makes
// a retry after a failed `PUT` a second write to an already-minted row rather than a second row.
//
// **What this file deliberately does not do.** It writes to no URL, no store, no cookie and no web
// storage: composition is a client sub-state over the same query (R13), and an addressable one would
// make a reload re-run generation and mint a second design. **The hand-off's `push` is not an
// exception to that** — it is the customer leaving step 1 for the editor, and it records nothing
// about the composition anywhere a reload could find it. It renders nothing. And it reports no
// per-row progress — `generateKitchen` is one synchronous call that returns a finished log, so the
// only honest states are *the whole list is pending* and *the whole list has resolved* (R12).
import {
  boundedFailureReason,
  createBodyProbeLease,
  generateKitchen,
  wallCarcassDepthMm,
  type BodyProbeFactory,
  type Design,
  type DesignId,
  type DesignRoom,
  type GenerationLog,
} from "@lemnaria/configurator-domain";
import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "@/i18n/navigation";

import {
  createDesignCreationAttempt,
  type DesignCreationAttempt,
} from "./create-design";
import {
  pendingGenerationRows,
  resolveGenerationRows,
  type GenerationRow,
} from "./generation-model";

/**
 * How far the hand-off into the editor has got (wave 7F4b, criteria 39–42; corrected by that wave's
 * review, finding F7).
 *
 * There is no *"not started"* member, and that is the point: the hand-off begins in the same
 * transition that first holds a design, so a composed kitchen is never sitting still with nothing
 * happening to it and nothing on the screen saying so.
 *
 * **`saved` is a member because the write finishing is not the write being in flight.** Until the
 * review, `handOff` had no success arm at all and a run that succeeded stayed `saving` for ever —
 * invisible only because the screen was normally on its way to the editor by then, and a lie the
 * moment it is not (`navigateToDesign` declines to move a screen the customer has left, criterion
 * 42). One word cannot mean both *"wait"* and *"done"* while `ComposeCta` reads it to decide whether
 * there is anything to offer.
 *
 * **`saving` and `saved` are drawn identically** — the busy control — so this adds no screen state:
 * on the path that matters the editor is already opening. What it adds is that the code, and anyone
 * reading it, can tell the two apart. **What 1F should draw for a design that was written while the
 * customer was away and therefore never opened is not decided here**; it is a position the product
 * has never been asked about, and it is unreachable until `next.config.ts` sets `cacheComponents`.
 */
export type HandoffStatus = "saving" | "saved" | "failed";

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
 * **A hand-off that failed is a different position and a different member's business** — there the
 * kitchen is composed and the rows are true, and what failed is the write.
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
      /**
       * **The one attempt this composition is ever written by** (ruling R17).
       *
       * It is a field of the run's state rather than a hook over the design, a `useMemo` or
       * something a handler builds, because all three of those re-create it — and a fresh attempt
       * carries a fresh mint identity, which `create-design.ts` documents as *"a row, and a
       * navigation, per tap"*. Held here so the retry below can only ever re-run **this** one: the
       * guarantee is per-attempt by design, so reusing the attempt *is* the guarantee.
       */
      readonly attempt: DesignCreationAttempt;
      readonly handoff: HandoffStatus;
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
   *  flight is abandoned rather than cancelled: it cannot be, and its lease is released either way.
   *  A **write** still in flight is abandoned the same way: it may land, and nobody is moved when
   *  it does (criterion 42). */
  readonly leave: () => void;
  /** Asks the failed hand-off to write again. It re-runs the composition's own attempt, so it
   *  never mints a second row and never re-runs generation (criterion 41). Inert in every other
   *  state, because there is nothing to retry in one. */
  readonly retryHandoff: () => void;
}

const IDLE: GenerationRunState = { phase: "idle" };

/**
 * **One run, and the number that says which run it is** (wave 7F4b's review, findings F1 and F4).
 *
 * The two fields are one value because they answer one question — *is the state this continuation
 * started for still the state on the screen?* — and they are only ever written together, by `show`.
 * Before the review they were an integer ref and a state ref that three distant sites had to keep in
 * step; `retryHandoff` read the integer and the attempt from those two places and they were equal
 * only by convention.
 *
 * **It is deliberately not a field of `GenerationRunState`.** That type is what
 * `generation-steps.tsx` renders, and a hook's bookkeeping integer is not something the view, or the
 * fixtures that build runs for it, should have to carry.
 *
 * **It answers nothing about whether a screen exists** — that is `screenIsShowing`'s, below, and the
 * two are separate because a route can lose its screen without losing this state.
 */
interface ShownRun {
  readonly token: number;
  readonly state: GenerationRunState;
}

const NO_RUN: ShownRun = { token: 0, state: IDLE };

export function useGeneration(): GenerationRun {
  const [state, setState] = useState<GenerationRunState>(IDLE);
  // The run as the screen holds it, readable from a handler that was not re-created for it. The
  // retry needs **this run's attempt** and a `setState` updater is the wrong place to look it up:
  // an updater must be pure, and under StrictMode it is invoked twice.
  //
  // It cannot drift from the `state` below it because `show` is the only writer of either, and
  // nothing else in this hook may call `setState` — which is a rule this file keeps rather than a
  // property React enforces. A second `setState` call site would leave every token comparison below
  // reading a run the screen has moved on from.
  const shown = useRef<ShownRun>(NO_RUN);
  // Mints the number above, and nothing else reads it: a token has to be unique for this mount's
  // lifetime, and *"which run is showing"* is a question only `shown` answers.
  const lastRunToken = useRef(0);
  // **Whether there is a screen here at all**, which is a different lifetime from the run above.
  // False until the mount effect says otherwise, and false again the moment this screen's effects
  // are torn down — by an unmount, or by Next hiding the route inside React's `<Activity>`, which
  // runs cleanups and **keeps the state** (`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`).
  const screenIsShowing = useRef(false);
  const openDesign = useDesignRoute();

  const show = useCallback((token: number, next: GenerationRunState) => {
    shown.current = { token, state: next };
    setState(next);
  }, []);

  /** A token no continuation in flight can be holding. Every state change that makes the runs in
   *  flight stale takes one, which is the whole of how a run is retired. */
  const mintRunToken = useCallback(() => {
    lastRunToken.current += 1;
    return lastRunToken.current;
  }, []);

  const leave = useCallback(() => {
    // A fresh token, so the abandoned run's continuations find a screen that is no longer theirs.
    if (shown.current.state.phase !== "idle") show(mintRunToken(), IDLE);
  }, [mintRunToken, show]);

  /**
   * **The screen going away disarms the hand-off's navigation** (criterion 42). A write in flight
   * when the customer navigates elsewhere still lands — it cannot be recalled and a half-written row
   * is worse than a whole one — but the `push` that would have followed it belongs to a screen the
   * customer is no longer looking at.
   *
   * **This is not the run token's business, and conflating the two was finding F1.** The cleanup
   * used to bump the run token, which was sound only while a route that ran its cleanups also
   * destroyed the state holding the attempt. Under `<Activity>` it does not: the route is hidden,
   * this cleanup runs, and the composed kitchen and its retry control come back untouched when the
   * customer returns — to a run whose token had been moved out from under it, so the retry wrote to
   * the right row and then refused to open it. `tests/room/handoff-across-a-hidden-route.dom.test.ts`
   * is that trip, and it failed before this separation existed.
   *
   * Setup as well as cleanup, so a route that is shown again is a screen again. Under StrictMode the
   * throw-away mount's cleanup is followed by the real setup, which leaves this true.
   *
   * **What it deliberately does not do is resume anything.** A composition still running when the
   * screen goes is dropped where it settles (`compose`), and a route hidden at that instant comes
   * back showing the pending list for ever — which is what this hook has always done at an unmount,
   * and is only *visible* once a hidden route can come back. Repairing that is a resumption, and a
   * screen state nobody has been asked about; it is recorded rather than invented here.
   */
  useEffect(() => {
    screenIsShowing.current = true;
    return () => {
      screenIsShowing.current = false;
    };
  }, []);

  /** The hand-off's own outcome, written onto the run that asked for it and no other. A run that has
   *  been left or superseded has no state left to mark, and a screen that is merely hidden still
   *  does — it is the state the customer comes back to. */
  const reportHandoff = useCallback(
    (token: number, handoff: HandoffStatus) => {
      const { state: current } = shown.current;
      if (shown.current.token !== token || current.phase !== "composed") return;
      show(token, { ...current, handoff });
    },
    [show],
  );

  const handOff = useCallback(
    (attempt: DesignCreationAttempt, token: number) => {
      // **Both arms, and the success one is not decoration.** The attempt navigates when it can, and
      // on the ordinary path this screen is leaving as it resolves — but `navigateToDesign` declines
      // to move a screen the customer has left, and a run that stayed `saving` for ever would be the
      // screen claiming to still be working over a write that finished (finding F7).
      void attempt.run().then(
        () => {
          reportHandoff(token, "saved");
        },
        () => {
          reportHandoff(token, "failed");
        },
      );
    },
    [reportHandoff],
  );

  /**
   * **The one place in the application an attempt is constructed** (ruling R17), called from the one
   * transition in which a design first exists.
   *
   * The two guards it closes over are criterion 42 and are **two different questions**: the token
   * asks whether this composition is still the one on the screen — a customer who tapped *Înapoi*,
   * or started a second run — and `screenIsShowing` asks whether there is a screen to move at all.
   * A write left behind by either lands on its own and moves nobody.
   */
  const attemptFor = useCallback(
    (design: Design, token: number): DesignCreationAttempt =>
      createDesignCreationAttempt({
        design,
        navigateToDesign: (id) => {
          if (!screenIsShowing.current) return;
          if (shown.current.token !== token) return;
          openDesign(id);
        },
      }),
    [openDesign],
  );

  const compose = useCallback(
    (room: DesignRoom) => {
      const token = mintRunToken();
      show(token, { phase: "composing", room, rows: pendingGenerationRows() });
      void composeKitchen(room).then((composed) => {
        // **A composition settles onto a screen or not at all.** Settling is what builds the
        // attempt, and building one **mints a row** — so a run whose screen has been torn down is
        // dropped here rather than allowed to write a design nobody asked for twice and nobody will
        // open. The customer who tapped *Înapoi* is the same case one line down.
        if (!screenIsShowing.current) return;
        if (shown.current.token !== token) return;
        if (composed.outcome === "refused") {
          show(token, { phase: "failed", room });
          return;
        }
        const attempt = attemptFor(composed.kitchen.design, token);
        show(token, {
          phase: "composed",
          room,
          ...composed.kitchen,
          attempt,
          handoff: "saving",
        });
        handOff(attempt, token);
      });
    },
    [attemptFor, handOff, mintRunToken, show],
  );

  const retryHandoff = useCallback(() => {
    // **The attempt and the token it was built with are read out of one value**, so the navigation
    // this re-arms is guarded by the number the attempt already closed over rather than by whatever
    // a counter happens to hold (finding F4).
    const { token, state: current } = shown.current;
    // A retry is the **hand-off's** alone: it re-runs the attempt the composition already holds, so
    // generation is not re-run (criterion 41) and no second attempt — and therefore no second row —
    // can come of it. A tap arriving in any other state has nothing to retry.
    if (current.phase !== "composed" || current.handoff !== "failed") return;
    show(token, { ...current, handoff: "saving" });
    handOff(current.attempt, token);
  }, [handOff, show]);

  return { state, compose, leave, retryHandoff };
}

/** The composed kitchen as the screen holds it: the rows the log resolves to, the design that was
 *  built and the log itself. Separate from the run's state because the hand-off's fields are the
 *  hook's to add — the engine knows nothing about an attempt. */
interface ComposedKitchen {
  readonly rows: readonly GenerationRow[];
  readonly design: Design;
  readonly log: GenerationLog;
}

/** What one call of the engine produced. **A refusal carries nothing**, for the reason the `failed`
 *  state carries no rows: the log it refuses over may hold placed bodies for a design that was
 *  discarded, and a row folded off it would be a false claim. */
type Composition =
  | { readonly outcome: "composed"; readonly kitchen: ComposedKitchen }
  | { readonly outcome: "refused" };

/** The run's one error boundary, kept to itself: everything below it may throw, and a throw is the
 *  same dead end a refusal is — no mint, no navigation, no crash (criterion 35). */
async function composeKitchen(room: DesignRoom): Promise<Composition> {
  try {
    return await composeOrThrow(room);
  } catch {
    return { outcome: "refused" };
  }
}

async function composeOrThrow(room: DesignRoom): Promise<Composition> {
  const probeAt = await loadProbeFactory();
  await theNextPaint();
  const composed = generateKitchen({
    room,
    occurredAt: new Date().toISOString(),
    probeAt,
  });
  if (!composed.ok) return { outcome: "refused" };
  return {
    outcome: "composed",
    kitchen: {
      rows: resolveGenerationRows(composed.log),
      design: composed.design,
      log: composed.log,
    },
  };
}

/**
 * **The editor, at the design just written** (criterion 40).
 *
 * A localized `push`, so `/d/{id}` becomes `/ro/d/{id}` and the customer stays in the language they
 * were reading. The id is the one the mint returned and is escaped on the way into the path: it is a
 * value the server chose, and a path segment built by concatenation is a place where that stops
 * being true.
 *
 * The router is read through a ref for `room-query-sync.ts`'s reason: next-intl memoises its router
 * on Next's own instance, whose identity nothing here can promise, and a callback keyed on it would
 * be re-created under the run that is holding it.
 */
function useDesignRoute(): (id: DesignId) => void {
  const router = useRouter();
  const latestRouter = useRef(router);

  // **No dependency array on purpose**: the ref has to be caught up after *every* render, because
  // the identity this is tracking is the one thing a dependency array could not name.
  useEffect(() => {
    latestRouter.current = router;
  });

  return useCallback((id: DesignId) => {
    latestRouter.current.push(`/d/${encodeURIComponent(id)}`);
  }, []);
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
