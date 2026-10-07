// The composition run: the first production caller of `generateKitchen`. Its rules:
// 1. A run starts from the tap that asked for it, never from an effect: `reactStrictMode` runs an effect twice,
//    which would build two kits and two designs and mint two rows.
// 2. The adapter arrives through a dynamic import inside that handler, so the first screen does not carry
//    `three`. This file alone names the package under `apps/web/src/room`.
// 3. The kit is borrowed through a lease and released on every path (ADR 0076 decision 3); see
//    `loadProbeFactory` and `releaseOrReport`.
// 4. One attempt writes the design once, built in the transition that first holds a design and never in a
//    handler, a render or a `useMemo`: every retry re-runs that attempt, so a retry is never a second row.
// It writes no URL, store, cookie or web storage (a reload would re-run generation and mint a second design)
// and reports no per-row progress: `generateKitchen` is one synchronous call.
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

import { recordEditorOpenedFromStepOne } from "@/app/configurator/configure/back-guard";
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
 * How far the hand-off into the editor has got. There is no "not started" member: the hand-off begins in the
 * transition that first holds a design. `saved` is distinct from `saving` so `ComposeCta` can tell "wait" from
 * "done"; the two are drawn identically (the busy control). What 1F draws for a design written while the customer
 * was away is undecided, and unreachable until `next.config.ts` sets `cacheComponents`.
 */
export type HandoffStatus = "saving" | "saved" | "failed";

/**
 * Where one composition has got to. The run carries its room so the summary above the list describes the kitchen
 * being composed. `failed` covers a `MINIMUM_NOT_MET` refusal and a throw alike: nothing was written or navigated.
 * A failed hand-off is a `composed` run with `handoff: "failed"`.
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
      /** The one attempt this composition is written by. Held in the run's state, not in a hook, a `useMemo` or a
       *  handler, because each of those re-creates it with a fresh mint identity and so a row per tap. */
      readonly attempt: DesignCreationAttempt;
      readonly handoff: HandoffStatus;
    }
  | {
      /**
       * A failed run carries no rows. `generateKitchen` can refuse after the plan's minimum was met (`insertBody`
       * refusing the sink or hob), over a log where other bodies read `placed` for a discarded design. The rows are
       * absent from the type so `generation-steps.tsx` cannot draw them; a throw ends before a log exists.
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
  /** Enters composition and runs it, once, for the room handed in. */
  readonly compose: (room: DesignRoom) => void;
  /** Leaves composition: a pure state clear, so nothing re-seeds from the URL. A run or write still in flight is
   *  abandoned, not cancelled: it may land, and nobody is moved when it does. */
  readonly leave: () => void;
  /** Asks the failed hand-off to write again by re-running the composition's own attempt: never a second row,
   *  never a re-run of generation. Inert in every other state. */
  readonly retryHandoff: () => void;
}

const IDLE: GenerationRunState = { phase: "idle" };

/**
 * One run and the token saying which run it is, always written together by `show`. Not a field of
 * `GenerationRunState`, which `generation-steps.tsx` renders. Whether a screen exists is `screenIsShowing`'s.
 */
interface ShownRun {
  readonly token: number;
  readonly state: GenerationRunState;
}

const NO_RUN: ShownRun = { token: 0, state: IDLE };

export function useGeneration(): GenerationRun {
  const [state, setState] = useState<GenerationRunState>(IDLE);
  // The run as the screen holds it, readable from a handler that was not re-created for it: a `setState` updater
  // is the wrong place to look up the attempt, since it must be pure and StrictMode invokes it twice.
  // `show` is the only writer of either; no other site in this hook may call `setState`.
  const shown = useRef<ShownRun>(NO_RUN);
  // Mints run tokens, unique for this mount's lifetime; only `shown` says which run is showing.
  const lastRunToken = useRef(0);
  // Whether there is a screen here at all: false after teardown, whether by unmount or by Next hiding the route
  // inside React's `<Activity>`, which runs cleanups and keeps the state.
  const screenIsShowing = useRef(false);
  const openDesign = useDesignRoute();

  const show = useCallback((token: number, next: GenerationRunState) => {
    shown.current = { token, state: next };
    setState(next);
  }, []);

  /** A token no continuation in flight can be holding; taking one is how a run is retired. */
  const mintRunToken = useCallback(() => {
    lastRunToken.current += 1;
    return lastRunToken.current;
  }, []);

  const leave = useCallback(() => {
    // A fresh token, so the abandoned run's continuations find a screen that is no longer theirs.
    if (shown.current.state.phase !== "idle") show(mintRunToken(), IDLE);
  }, [mintRunToken, show]);

  /**
   * The screen going away disarms the hand-off's navigation. A write in flight still lands (a half-written row
   * is worse than a whole one) but the `push` after it belongs to a screen nobody is looking at.
   * Separate from the run token: under `<Activity>` a hidden route runs this cleanup yet keeps the composed
   * kitchen and its retry control, so retiring the token here would refuse to open the row the retry wrote.
   * Setup as well as cleanup, so a re-shown route is a screen again. Nothing is resumed: a composition still
   * running when the screen goes is dropped where it settles, so a route hidden by `<Activity>` at that instant
   * comes back showing the pending list for ever.
   */
  useEffect(() => {
    screenIsShowing.current = true;
    return () => {
      screenIsShowing.current = false;
    };
  }, []);

  /** The hand-off's outcome, written onto the run that asked for it and no other. A left or superseded run has
   *  no state to mark; a merely hidden screen does. */
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
      // Both arms matter: `navigateToDesign` declines to move a screen the customer has left, so without the
      // success arm a finished write would leave the run `saving` for ever.
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
   * The one place an attempt is constructed, from the one transition in which a design first exists. Its two guards
   * ask different questions: the token, whether this composition is still the one on screen; `screenIsShowing`,
   * whether there is a screen to move at all. A write left behind by either moves nobody.
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
        // A composition settles onto a screen or not at all: building the attempt mints a row, so a run whose
        // screen is gone, or that the customer left with *Înapoi*, is dropped here.
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
    // The attempt and the token it was built with come out of one value, so the re-armed navigation is guarded
    // by the token the attempt closed over.
    const { token, state: current } = shown.current;
    // A retry is the hand-off's alone: it re-runs the composition's attempt, so generation is not re-run and no
    // second row can come of it. A tap in any other state has nothing to retry.
    if (current.phase !== "composed" || current.handoff !== "failed") return;
    show(token, { ...current, handoff: "saving" });
    handOff(current.attempt, token);
  }, [handOff, show]);

  return { state, compose, leave, retryHandoff };
}

/** The composed kitchen as the screen holds it. Separate from the run's state: the hand-off's fields are the
 *  hook's to add, since the engine knows nothing about an attempt. */
interface ComposedKitchen {
  readonly rows: readonly GenerationRow[];
  readonly design: Design;
  readonly log: GenerationLog;
}

/** What one call of the engine produced. A refusal carries nothing: its log may hold placed bodies of a
 *  discarded design. */
type Composition =
  | { readonly outcome: "composed"; readonly kitchen: ComposedKitchen }
  | { readonly outcome: "refused" };

/** The run's one error boundary: a throw is the same dead end as a refusal, with no mint and no navigation. */
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
 * The editor, at the design just written: a localized `push`, so `/d/{id}` becomes `/ro/d/{id}`. The server-chosen
 * id is escaped into the path. The router is read through a ref, as in `room-query-sync.ts`: next-intl's router
 * identity is not stable, and a callback keyed on it would be re-created under the run holding it.
 */
function useDesignRoute(): (id: DesignId) => void {
  const router = useRouter();
  const latestRouter = useRef(router);

  // No dependency array on purpose: the ref must be caught up after every render.
  useEffect(() => {
    latestRouter.current = router;
  });

  return useCallback((id: DesignId) => {
    // Recorded before the push so the editor's first render finds it: this is the only entry with Step 1 behind
    // it, and it lets Back there ask first.
    recordEditorOpenedFromStepOne(id);
    latestRouter.current.push(`/d/${encodeURIComponent(id)}`);
  }, []);
}

/**
 * The adapter's only route into the room screen. The factory builds the kit with the same `wallDepthMm` as
 * `scene/kitchen-stage.tsx`: a design generated at another wall depth would persist seats the editor's scene
 * disagrees with. No renderer or WebGL; `makeKit` falls back to `document.createElement` for its textures, so
 * this cannot move to a Web Worker.
 *
 * The kit exists before the lease does, and this factory brackets that window: `createBodyProbeLease`'s `finally`
 * covers `use` only, so a throw while building the room or the probe would strand the kit's buffers and textures.
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
    // Held outside the `try` so the failed exit can free the room when there is one; when `buildRoom` throws,
    // `disposeKit` frees the kit's own shared resources.
    let room: ReturnType<typeof buildRoom> | undefined;
    // The site that allocates is the site that frees (ADR 0076 decision 3): one closure serves the lease's
    // `finally` and the `catch` that covers every path that never reached a lease.
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
 * Frees the kit and never at the cost of the run's outcome. A throwing `finally` replaces what its block was
 * returning, and `createBodyProbeLease` calls `release` from one, so a failed `disposeKit` would turn a composed
 * kitchen into the failure screen. Bounded here, not in `body-probe.ts`, whose contract is one `release` per `use`.
 */
function releaseOrReport(release: () => void): void {
  try {
    release();
  } catch (failure) {
    reportKitReleaseFailure(failure);
  }
}

/**
 * Writes the failure down in the shape `lib/server/design-failure-log.ts` writes its lines; `console` is the whole
 * transport (that module is `server-only` and no error tracker is installed). Nothing may escape this function:
 * a thrown value may define `message` or `toString` as a throwing getter, and a diagnostic that throws inside the
 * lease's `finally` would recreate the defect it reports.
 */
function reportKitReleaseFailure(failure: unknown): void {
  try {
    console.error(GENERATION_LOG_LABEL, {
      event: "kit-release-failed",
      // Control characters stripped and length capped, as for every logged message.
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
 * Resolves on the far side of a painted frame. `generateKitchen` is synchronous on the main thread, so the
 * pending rows must be on the glass before it starts; the dynamic import alone does not give that, since every
 * tap after the first resolves in a microtask. `requestAnimationFrame` runs before the paint, a task inside it after.
 */
function theNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}
