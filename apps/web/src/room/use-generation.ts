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
// one expression rather than handing a probe out for someone to remember.
//
// **What this file deliberately does not do.** It writes to no URL, no store, no cookie and no web
// storage: composition is a client sub-state over the same query (R13), and an addressable one would
// make a reload re-run generation and mint a second design. It renders nothing. And it reports no
// per-row progress — `generateKitchen` is one synchronous call that returns a finished log, so the
// only honest states are *the whole list is pending* and *the whole list has resolved* (R12).
import {
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
      readonly phase: "failed";
      readonly room: DesignRoom;
      /** Absent when the run ended before a log existed — a throw. The list is then not drawn at
       *  all: every row state the frame has would be a claim about fit that the run never made. */
      readonly rows?: readonly GenerationRow[];
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
  const rows = resolveGenerationRows(composed.log);
  if (!composed.ok) return { phase: "failed", room, rows };
  return {
    phase: "composed",
    room,
    rows,
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
    const room = kit.builders["kitchen-l"]();
    // **This is the site that allocates, so this is the site that frees** (ADR 0076 decision 3).
    // `use` runs this in a `finally` and never hands the probe out, so a `generateKitchen` that
    // throws mid-composition still releases the kit.
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

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
